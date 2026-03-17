# Terminal Tabs Research — Architecture Analysis

## Executive Summary

Adding tab-based terminal management to Grove is **primarily a frontend concern**. The Rust PTY layer needs zero changes — it already operates on individual PTY instances identified by `ptyId`, completely independent of how the UI organizes them. The main work is restructuring the Zustand store and adding a thin TabBar UI component, while preserving the existing split-tree system within each tab.

**Recommended approach**: Tabs as top-level containers, each containing its own split tree (VS Code model).

---

## 1. Architecture Options

### Option A: Tabs wrapping split trees (Recommended)

Each tab is a container holding its own independent `SplitNode` tree. Users can split panes within a tab, and switch between tabs to get entirely different layouts.

```
WorktreeSession
├── Tab 1 (active)
│   └── SplitNode tree (h-split: [pane-a, pane-b])
├── Tab 2
│   └── SplitNode tree (single leaf: pane-c)
└── Tab 3
    └── SplitNode tree (v-split: [pane-d, h-split: [pane-e, pane-f]])
```

**Pros:**
- Matches VS Code / iTerm2 mental model — users expect this
- Design reference shows both tabs AND a split button in the toolbar, implying coexistence
- Clean separation: tab = workspace context, splits = spatial arrangement
- Backward compatible: existing single-split-tree sessions become "Tab 1" automatically

**Cons:**
- Slightly more state complexity (array of trees vs. single tree)
- Need to manage tab lifecycle (create, close, rename, reorder)

### Option B: Tabs as alternative view mode

Toggle between "tab view" (flat list, one pane visible at a time) and "split view" (current behavior). All panes live in one flat pool; tabs show one at a time, splits show multiple.

**Pros:**
- No structural change to the split tree model
- Simpler state model

**Cons:**
- Awkward UX: switching modes reshuffles the layout
- Doesn't match the design reference (which shows tabs + splits coexisting)
- Harder to reason about persistence (which mode was active?)

### Option C: Tabs replacing splits entirely

Remove split support. Each tab = one terminal pane.

**Pros:**
- Simplest implementation
- Design reference's primary view is tab-based

**Cons:**
- Loses existing split functionality that users already rely on
- Split button in the design toolbar suggests splits should remain
- Regression in capability

### Recommendation: Option A

The design reference explicitly shows both a tab bar (line 87-103) and a split/columns button (line 124-129), confirming that tabs and splits should coexist. Option A is the only approach that supports this naturally.

---

## 2. State Model Changes

### Current State (`src/store/terminal.ts`)

```typescript
interface TerminalState {
  sessions: Record<string, SplitNode>;  // worktreePath → single split tree
  activeWorktree: string | null;
  focusedPtyId: string | null;
  theme: TerminalTheme | null;
  detectedTheme: TerminalTheme | null;
}
```

### Proposed State

```typescript
interface TerminalTab {
  id: string;           // Stable tab identifier (UUID)
  name: string;         // User-visible label ("Terminal 1", or auto from cwd)
  splitRoot: SplitNode; // This tab's split tree (existing type, unchanged)
}

interface WorktreeSession {
  tabs: TerminalTab[];    // Ordered list of tabs
  activeTabId: string;    // Currently visible tab
}

interface TerminalState {
  sessions: Record<string, WorktreeSession>;  // worktreePath → session with tabs
  activeWorktree: string | null;
  focusedPtyId: string | null;
  theme: TerminalTheme | null;
  detectedTheme: TerminalTheme | null;
}
```

### New Store Actions

```typescript
// Tab management
createTab(worktreePath: string): Promise<void>       // Add new tab with fresh PTY
closeTab(worktreePath: string, tabId: string): void   // Close tab and its PTYs
switchTab(worktreePath: string, tabId: string): void   // Activate tab
renameTab(worktreePath: string, tabId: string, name: string): void
moveTab(worktreePath: string, tabId: string, newIndex: number): void  // Reorder
```

### Modified Store Actions

These existing actions need an extra level of indirection — they currently operate on `sessions[worktreePath]` (a `SplitNode`), and would now operate on `sessions[worktreePath].tabs[activeTabIndex].splitRoot`:

| Action | Current target | New target |
|--------|---------------|------------|
| `splitTerminal()` | `sessions[worktreePath]` | `activeTab.splitRoot` |
| `closeTerminal()` | `sessions[worktreePath]` | `activeTab.splitRoot` |
| `updateSizes()` | `sessions[worktreePath]` | `activeTab.splitRoot` |
| `setFocusedPtyId()` | Global | Global (unchanged — focused pty is independent of tab structure) |

### Helper: Resolve Active Tab

A small utility used throughout the store:

```typescript
function getActiveTab(session: WorktreeSession): TerminalTab | undefined {
  return session.tabs.find(t => t.id === session.activeTabId);
}
```

### SplitNode Type — No Changes

The `SplitNode` type in `src/types/terminal.ts` remains exactly as-is. Tabs wrap split trees; they don't modify the tree structure.

---

## 3. Backend (Rust) Impact

### PTY Layer: Zero Changes Required

The Rust PTY layer (`grove-core/src/pty.rs`) is **completely tab-unaware**. It operates on:
- Individual PTY instances identified by `ptyId`
- Worktree-scoped tmux sessions named by `grove:${hash}:${pane}`

None of these concepts depend on how the frontend organizes panes into tabs vs. splits. The IPC commands (`create_pty`, `write_pty`, `resize_pty`, `close_pty`) all take `ptyId` — tabs are invisible to them.

### Snapshot Layer: Minor Extension

The snapshot system (`save_terminal_session_snapshot` / `load_terminal_session_snapshot`) currently captures per-pane metadata (scrollback, cwd) keyed by `paneId`. This remains correct because:
- `paneId` is stable and lives inside `SplitNode` leaves
- The snapshot captures ALL panes in a worktree session, regardless of tab grouping
- Tab assignment of panes is reconstructed from the layout template

**No Rust changes needed.** The tab→pane mapping is reconstructed from the layout template on the TypeScript side during restoration.

### Layout Persistence: Frontend-Only Change

`save_terminal_layouts` / `load_terminal_layouts` serialize/deserialize a JSON string. The format change from `Record<string, SplitNode>` to `Record<string, WorktreeSession>` is handled entirely in TypeScript serialization. The Rust side just stores/returns an opaque string.

---

## 4. Session Persistence

### Layout Templates (`~/.grove/terminal-layouts.json`)

**Current format:**
```json
{
  "/path/to/worktree": { "id": "...", "type": "horizontal", "children": [...] }
}
```

**New format:**
```json
{
  "/path/to/worktree": {
    "tabs": [
      { "id": "tab-1", "name": "Terminal 1", "splitRoot": { "id": "...", "type": "leaf" } },
      { "id": "tab-2", "name": "Terminal 2", "splitRoot": { "id": "...", "type": "horizontal", "children": [...] } }
    ],
    "activeTabId": "tab-1"
  }
}
```

The `toLayoutTemplate()` function in `split-tree.ts` strips `ptyId` from each tab's `splitRoot` independently. No change to the strip logic itself — it's called per-tree.

### Session Snapshots

No format change. Snapshots store per-pane data (scrollback, cwd) keyed by `paneId`. During restoration, the `buildTerminalRestorePlan()` function iterates ALL panes across ALL tabs to build the plan. The only change is the iteration pattern — instead of traversing one tree, traverse all tabs' trees.

### Restoration Flow

**Current:**
```
loadLayout(worktreePath) → SplitNode
loadSnapshot(worktreePath) → pane metadata
buildRestorePlan(layout, snapshot)
for each pane: createPty, prime runtime
restoreSession(worktreePath, node)
```

**New:**
```
loadLayout(worktreePath) → WorktreeSession (with tabs)
loadSnapshot(worktreePath) → pane metadata (unchanged)
for each tab:
  buildRestorePlan(tab.splitRoot, snapshot, defaultCwd)
  for each pane in tab: createPty, prime runtime
  assignPtyIds(tab.splitRoot, ptyIds)
restoreSession(worktreePath, restoredSession)
```

The inner loop is identical — it just runs once per tab instead of once per session.

---

## 5. Migration Path

### Forward Migration (existing sessions → tabbed sessions)

When `initLayouts()` loads a legacy layout (raw `SplitNode` instead of `WorktreeSession`), normalize it:

```typescript
function migrateLayout(stored: SplitNode | WorktreeSession): WorktreeSession {
  // If it's already the new format, return as-is
  if ('tabs' in stored) return stored;

  // Wrap legacy SplitNode in a single-tab session
  const tabId = generateId();
  return {
    tabs: [{ id: tabId, name: 'Terminal 1', splitRoot: stored }],
    activeTabId: tabId,
  };
}
```

This runs inside `normalizeSplitTree()` or alongside it during `initLayouts()`. Users see their existing layout appear as "Terminal 1" — no data loss, no behavioral change.

### Backward Compatibility

Not needed. Once migrated, the new format is written on save. There's no scenario where a newer Grove version needs to downgrade.

### Rollout Strategy

The migration is automatic and invisible. No user action required. The first `saveLayouts()` after loading will write the new format.

---

## 6. Files Requiring Modification

### Must Change

| File | Change | Scope |
|------|--------|-------|
| `src/types/terminal.ts` | Add `TerminalTab`, `WorktreeSession` interfaces | Small |
| `src/store/terminal.ts` | Restructure `sessions` type; add tab CRUD actions; update split/close to target active tab | Medium |
| `src/lib/split-tree.ts` | Add `migrateLayout()` for forward migration; possibly extract `toLayoutTemplate` to work per-tab | Small |
| `src/lib/terminal-session.ts` | Update `collectTerminalPanes`, `buildTerminalPaneTopologySignature`, `buildTerminalRestorePlan`, `buildTerminalSnapshotRequest` to iterate across tabs | Small |
| `src/hooks/useTerminal.ts` | Update `createTerminal` to restore multi-tab sessions; add `createTab`, `closeTab` functions | Medium |
| `src/components/terminal/TerminalPanel.tsx` | Add TabBar component; render only active tab's SplitContainer; snapshot logic iterates tabs | Medium |

### New Files

| File | Purpose |
|------|---------|
| `src/components/terminal/TabBar.tsx` | Tab bar UI component (tab switching, add, close, rename, reorder) |

### No Changes Required

| File | Why |
|------|-----|
| `grove-core/src/pty.rs` | PTY layer is tab-unaware |
| `src/lib/terminal-runtime.ts` | Runtime operates on paneId/ptyId, independent of tabs |
| `src/components/terminal/SplitContainer.tsx` | Renders a SplitNode tree — unchanged, just called per-tab |
| `src/components/terminal/TerminalInstance.tsx` | Leaf renderer — unchanged |
| `src/lib/platform/tauri.ts` | IPC abstraction — unchanged |
| `src/lib/platform/electron.ts` | IPC abstraction — unchanged |

---

## 7. Implementation Plan

### Phase 1: State Model (foundation)

1. Add `TerminalTab` and `WorktreeSession` types to `src/types/terminal.ts`
2. Update `src/store/terminal.ts`:
   - Change `sessions` type from `Record<string, SplitNode>` to `Record<string, WorktreeSession>`
   - Add migration in `initLayouts()` / `restoreSession()`
   - Update all actions that read/write `sessions[worktreePath]` to go through active tab
   - Add `createTab`, `closeTab`, `switchTab`, `renameTab`, `moveTab` actions
3. Update `src/lib/split-tree.ts` with `migrateLayout()` normalization
4. Update `src/lib/terminal-session.ts` to iterate panes across all tabs

### Phase 2: Hook Layer

5. Update `src/hooks/useTerminal.ts`:
   - `createTerminal()`: Restore all tabs (not just one tree)
   - Add `createTab()`: Generate IDs, createPty, prime runtime, add to session
   - Add `closeTab()`: Close all PTYs in tab, remove from session
   - Wire `switchTab()` to store action

### Phase 3: UI

6. Create `src/components/terminal/TabBar.tsx`:
   - Render tab list from `session.tabs`
   - Active tab highlight
   - Click to switch, X to close, + to create
   - Optional: double-click to rename, drag to reorder
7. Update `src/components/terminal/TerminalPanel.tsx`:
   - Render TabBar above the SplitContainer area
   - Only mount/show the active tab's SplitContainer
   - Keep inactive tabs' SplitContainers mounted but hidden (CSS `display: none`) to preserve xterm state — same pattern already used for worktree switching

### Phase 4: Persistence & Polish

8. Verify layout save/restore with multi-tab sessions
9. Verify snapshot save/restore across tabs
10. Add keyboard shortcuts (Cmd+T new tab, Cmd+W close tab, Cmd+Shift+[ / ] switch tabs)
11. Tab naming: auto-name from cwd basename, allow user rename

### Ordering Rationale

Phase 1 must come first — everything depends on the state model. Phase 2 can partially overlap with Phase 3 since the hook changes and UI are somewhat independent. Phase 4 is polish and should come last to avoid rework.

### Estimated Complexity

- **Total files changed**: 7 (6 modified + 1 new)
- **Rust changes**: 0
- **State model**: The main complexity — restructuring sessions from single tree to tabbed session
- **UI**: Straightforward — TabBar is a simple list component; SplitContainer is unchanged
- **Migration**: Trivial — wrap existing SplitNode in single-tab session
- **Risk**: Low — the split-tree system and PTY layer are completely unaffected

---

## 8. Design Reference Alignment

The design reference (`~/Downloads/grove-design/components/grove/terminal-panel.tsx`) shows:

| Design Element | Implementation Mapping |
|---------------|----------------------|
| `TerminalTab { id, name, cwd, history, active }` | Maps to our `TerminalTab { id, name, splitRoot }` — `cwd` derived from active pane, `history` is xterm state |
| Tab bar with click-to-switch | `TabBar.tsx` + `switchTab()` store action |
| Close (X) button on active tab | `closeTab()` store action + PTY cleanup |
| Plus (+) button | `createTab()` hook function |
| Split (Columns2) toolbar button | Existing `splitCurrent()` — operates within active tab |
| Maximize (Square) button | Future: toggle single-pane view within tab |
| Settings button | Existing terminal settings (theme, font) |
| Terminal path display | Derived from active tab's focused pane's cwd |

The design's flat `history: string[]` is a mock — real implementation uses xterm.js with PTY-backed scrollback, which we already have.
