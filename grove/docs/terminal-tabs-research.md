# Terminal Tabs Research

## Recommendation

Grove should model tabs as the top-level terminal unit inside each worktree, with each tab owning exactly one split tree.

Recommended shape:

- `worktree -> terminal session`
- `terminal session -> ordered tabs[] + activeTabId`
- `tab -> title + split tree + active pane`
- `split tree -> existing `SplitNode` structure`

Do not try to graft tabs directly onto `SplitNode`. The current code assumes one split tree per worktree in too many places, and other products consistently treat splits as something that lives inside a tab, not as a peer of the tab strip.

## What Comparable Products Do

### VS Code

Patterns that matter:

- The integrated terminal exposes multiple terminals as tabs/list items and also supports split terminals.
- Terminals can be renamed.
- Tabs can be moved around, including dragging terminals into editor tabs or across windows.
- Terminal UI behavior is tuned around visibility and customization instead of rebuilding the terminal every switch.

Why this matters for Grove:

- VS Code treats tab identity separately from split identity. That is the cleanest fit for Grove too.
- It also demonstrates that terminal tabs and split panes can coexist without sharing one tree structure.

Sources:

- https://code.visualstudio.com/docs/terminal/appearance
- https://code.visualstudio.com/docs/terminal/getting-started
- https://code.visualstudio.com/updates/v1_59
- https://code.visualstudio.com/updates/v1_93

### iTerm2

Patterns that matter:

- A window can have tabs, and each tab can contain many split panes.
- Tabs are draggable and reorderable.
- iTerm2 explicitly provides overflow aids for many tabs, such as tab bar placement on the left and "Open Quickly".
- Pane maximization is scoped to the current tab, not the whole window.

Why this matters for Grove:

- iTerm2 reinforces the same hierarchy: tabs are the top-level session grouping, panes are local to a tab.
- Overflow and discoverability become important once tabs exceed the width of the panel.

Sources:

- https://iterm2.com/documentation-general-usage.html
- https://iterm2.com/3.3/documentation-one-page.html
- https://iterm2.com/3.3/documentation-tmux-integration.html

### Warp

Patterns that matter:

- Warp persists windows, tabs, and panes together.
- Warp supports custom tab titles and pane-based session layouts.
- Warp warns when closing tabs with active work.
- Warp’s launch/session features treat tabs and panes as separate layers in the saved model.

Why this matters for Grove:

- Grove already persists layouts and scrollback, so Warp is the closest UX match on persistence expectations.
- The main lesson is that tab metadata must be first-class in persistence, not inferred from panes.

Sources:

- https://docs.warp.dev/features/sessions/session-restoration
- https://docs.warp.dev/features/sessions/launch-configurations
- https://docs.warp.dev/changelog

### Hyper

Patterns that matter:

- Hyper renders a tab header at the top of the window and tracks the active tab separately from split groups.
- Its reducer keeps a top-level `activeRootGroup` and stores split panes as a child tree under each root.
- Split operations mutate the active root group, not the tab list itself.

Why this matters for Grove:

- Hyper’s state model is the closest architectural analogue to what Grove needs.
- Grove should copy the hierarchy, not the implementation details.

Sources:

- https://github.com/vercel/hyper/blob/main/lib/components/header.tsx
- https://github.com/vercel/hyper/blob/main/lib/reducers/term-groups.ts
- https://github.com/vercel/hyper/blob/main/app/keymaps/darwin.json

## Current Grove Constraints

### UI layer

The current panel is split-only:

- [`src/components/terminal/TerminalPanel.tsx`](../src/components/terminal/TerminalPanel.tsx) renders a toolbar and then one `SplitContainer` per worktree, hiding inactive worktrees with `display: none`.
- [`src/components/terminal/TerminalToolbar.tsx`](../src/components/terminal/TerminalToolbar.tsx) only knows about theme settings, split, and close actions.
- [`src/components/terminal/SplitContainer.tsx`](../src/components/terminal/SplitContainer.tsx) recursively renders `SplitNode` and has no notion of a tab container.

The design reference at `~/Downloads/grove-design/components/grove/terminal-panel.tsx` assumes a simpler model: a tab strip on the left, toolbar actions on the right, then one active terminal view below it.

### State layer

The current Zustand shape is the main blocker:

- [`src/store/terminal.ts`](../src/store/terminal.ts) stores `sessions: Record<string, SplitNode>`, keyed only by `worktreePath`.
- `activeWorktree` and `focusedPtyId` are global.
- `createSession`, `restoreSession`, `splitTerminal`, `closeTerminal`, and `updateSizes` all assume a single split tree per worktree.
- Layout persistence serializes only a `SplitNode` template per worktree.

That means tabs cannot be added as a small UI feature. Tabs need a new session shape.

### Restore/persistence layer

Current persistence is pane-centric:

- [`src/lib/terminal-session.ts`](../src/lib/terminal-session.ts) builds restore/snapshot plans from pane IDs only.
- [`grove-core/src/config.rs`](../grove-core/src/config.rs) persists `terminal-layouts.json` and `terminal-session-snapshots.json`.
- [`grove-core/src/pty.rs`](../grove-core/src/pty.rs) snapshots runtime state per pane and stores snapshots under a worktree.

There is currently nowhere to persist:

- tab order
- active tab
- tab title
- per-tab active pane

### Backend/PTy layer

The backend is not the hard part:

- [`grove-core/src/pty.rs`](../grove-core/src/pty.rs) already creates one tmux-backed PTY per pane.
- PTY identity is per `paneId`/`ptyId`, not per worktree tree node.

That is good news. Tabs do not require a different PTY backend model. They mostly require new frontend state and new persistence metadata.

## Recommended Interaction Model

### Tab + split hierarchy

Use this model:

1. A selected worktree opens one terminal session.
2. That session contains ordered tabs.
3. The active tab owns one split tree.
4. Split commands operate only inside the active tab.

This is the best fit because it matches:

- the design reference
- iTerm2/Warp/Hyper behavior
- Grove’s current per-pane PTY backend

### What a new tab should create

A new tab should create:

- a new `tabId`
- a default title like `Terminal 2`
- a fresh root `SplitNode` with one leaf
- a new `paneId` + `ptyId`

### What closing should do

Recommended behavior:

- Closing a pane behaves exactly like today inside a tab.
- Closing the last pane in a tab closes the tab.
- Closing the last tab in a worktree should leave the worktree in an empty terminal state, not auto-recreate immediately.

Important implication:

The current `TerminalPanel` auto-create effect recreates a session whenever `activeWorktree` exists and `sessions[activeWorktree]` is missing. That behavior must change or "close last tab" will be impossible.

## UI/UX Recommendation

### Header layout

Recommended component layout:

1. `TerminalPanel`
2. `TerminalHeader`
3. `TerminalTabBar` on the left
4. `TerminalToolbar` on the right
5. Optional path/status row below the header
6. Active tab content below that

This is the closest match to the design reference and keeps the toolbar visible even when tabs overflow.

### Toolbar behavior

Recommended toolbar scope:

- Theme/settings remain session-level.
- Split buttons act on the active pane in the active tab.
- Close button should close the active pane when there are multiple panes, otherwise close the active tab.
- Add-tab belongs in the tab strip, not the toolbar.

### Overflow behavior

Recommended v1 behavior:

- horizontally scrollable tab strip
- fixed minimum tab width
- trailing overflow menu listing all tabs

Do not try to auto-compress tab labels too aggressively. Once tabs are too narrow, the model stops being legible.

Future-friendly additions:

- activity dot on inactive tabs
- dirty/running indicator
- drag handle region for reordering

### Renaming

Recommended v1:

- double-click tab title to rename
- Enter commits, Escape cancels
- if title is empty after trimming, fall back to auto-generated default

This matches Warp and common terminal behavior and avoids inventing a new interaction.

## Component-Level Changes

### Files that must change

- [`src/types/terminal.ts`](../src/types/terminal.ts)
  Add tab/session types, not just `SplitNode`.
- [`src/store/terminal.ts`](../src/store/terminal.ts)
  Replace `worktree -> SplitNode` with `worktree -> session-with-tabs`.
- [`src/hooks/useTerminal.ts`](../src/hooks/useTerminal.ts)
  Create/restore tabs, split within active tab, close active tab or pane.
- [`src/hooks/useTerminalCommandPipeline.ts`](../src/hooks/useTerminalCommandPipeline.ts)
  Command enablement currently derives from one worktree tree and one `focusedPtyId`.
- [`src/components/terminal/TerminalPanel.tsx`](../src/components/terminal/TerminalPanel.tsx)
  Render active worktree session, active tab, tab header, and empty state.
- [`src/components/terminal/TerminalToolbar.tsx`](../src/components/terminal/TerminalToolbar.tsx)
  Should become tab-aware and probably narrower in responsibility.
- [`src/components/terminal/SplitContainer.tsx`](../src/components/terminal/SplitContainer.tsx)
  Needs to update sizes for the active tab’s tree, not a worktree-global tree.
- [`src/lib/terminal-session.ts`](../src/lib/terminal-session.ts)
  Snapshot/restore helpers must become tab-aware.
- [`src/lib/split-tree.ts`](../src/lib/split-tree.ts)
  Likely reusable as-is for per-tab trees.
- [`src/lib/platform/tauri.ts`](../src/lib/platform/tauri.ts)
  Type definitions for layout/snapshot payloads will need updates.
- [`src/lib/platform/electron.ts`](../src/lib/platform/electron.ts)
  Same as Tauri types.
- [`grove-core/src/lib.rs`](../grove-core/src/lib.rs)
  Add tab-aware snapshot/layout structs.
- [`grove-core/src/config.rs`](../grove-core/src/config.rs)
  Persist new schema and migrate old schema.
- [`grove-core/src/pty.rs`](../grove-core/src/pty.rs)
  Mostly snapshot input/output changes, not PTY lifecycle changes.

### New components worth adding

- `src/components/terminal/TerminalHeader.tsx`
- `src/components/terminal/TerminalTabBar.tsx`
- `src/components/terminal/TerminalTab.tsx`
- `src/components/terminal/TerminalTabOverflow.tsx`

This keeps `TerminalPanel` from becoming a 300-line coordinator.

## xterm.js Considerations

### Visibility and sizing

xterm.js requires the host element to be visible when `open()` runs. The official API explicitly says the parent element "must be visible (have dimensions)" when `open` is called.

Relevant current behavior:

- [`src/lib/terminal-runtime.ts`](../src/lib/terminal-runtime.ts) already protects against zero-sized hosts with `hasLayoutDimensions()`.
- It calls `term.open(container)` only after layout dimensions are available.
- It uses `FitAddon` and a `ResizeObserver` to keep the PTY size in sync.

Implication for tabs:

- Hiding inactive tabs with `display: none` is fine, but the active tab must trigger a fit/sync on reveal.
- Relying only on initial mount is too risky; tab activation should explicitly force a layout sync.

### Hidden terminals still cost memory/CPU

Current runtime behavior keeps more state alive than the UI suggests:

- every pane has a `Terminal` instance
- every pane listens for PTY output
- every pane keeps buffered scrollback/hydration state
- every pane tries to load `WebglAddon`

If Grove keeps all tabs mounted and hidden, tab switching will be fast, but memory and GPU usage will grow with:

- number of tabs
- number of panes per tab
- number of worktrees currently rendered

Recommended v1 tradeoff:

- keep inactive tabs mounted within the active worktree for correctness and fast switching
- do not add more runtime caching layers yet
- if performance becomes an issue later, add LRU disposal for inactive tabs backed by existing tmux/snapshot restore

### WebGL renderer pressure

[`src/lib/terminal-runtime.ts`](../src/lib/terminal-runtime.ts) loads `WebglAddon` once per pane. That is fine for a few panes but scales poorly if users open many tabs with many panes.

Recommendation:

- keep the current behavior for v1
- add instrumentation or at least log counts during development
- be prepared to fall back to canvas/DOM rendering if many hidden panes become a problem

## Persistence and Migration

### Recommended new persisted shape

At minimum, persist:

- `tabs[]`
- `activeTabId`
- per-tab `title`
- per-tab `layout`
- per-tab `activePaneId`

Snapshots should also become tab-aware, for example:

- `worktree`
- `tabs[]`
- `tabId`
- `panes[]`

### Backward compatibility

Migrate old data like this:

1. If a saved worktree entry is a raw `SplitNode`, wrap it in one default tab.
2. Preserve the old root node and pane IDs unchanged.
3. Set `activeTabId` to the migrated default tab.

This keeps old layouts and scrollback valid.

## Edge Cases

### Drag-and-drop reordering

Recommended v1:

- reorder within one worktree only
- persist tab order immediately
- do not support cross-worktree dragging

### Keyboard shortcuts

Recommended shortcuts:

- `Cmd/Ctrl+T`: new tab
- `Cmd/Ctrl+Shift+]`: next tab
- `Cmd/Ctrl+Shift+[` : previous tab
- `Cmd/Ctrl+1..9`: jump to tab
- keep pane split shortcuts scoped to the active tab

### Activity indicators

Grove already emits pane activity through `subscribeTerminalPaneActivity`. Use that to mark inactive tabs as active/running when any pane under that tab receives output.

### Overflow

Once tabs exceed available width:

- keep the active tab fully visible
- horizontally scroll the strip
- expose a searchable overflow menu

### Tab titles

Initial titles should be simple and deterministic:

- `Terminal 1`
- `Terminal 2`

Later enhancement:

- derive default titles from active pane cwd or command name if shell integration is added

## Suggested Implementation Order

1. Introduce tab-aware types and session store shape.
2. Add migration from old `SplitNode` persistence to one default tab.
3. Render a tab strip and make split actions operate on `activeTab`.
4. Persist tab metadata and active tab.
5. Add rename, reorder, overflow, and activity indicators.

## Final Recommendation

Grove should adopt a `tab -> split tree` model, not a tabbed `SplitNode`.

That direction is:

- aligned with the design reference
- aligned with VS Code, iTerm2, Warp, and Hyper
- compatible with Grove’s existing pane/PTy backend
- low-risk if implemented as a state-model migration plus a new header layer

The biggest work is not xterm.js or tmux. The biggest work is replacing the assumption that a worktree owns exactly one split tree.
