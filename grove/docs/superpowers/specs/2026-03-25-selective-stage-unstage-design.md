# Selective Stage/Unstage in Working File Changes

**Issue**: [#52](https://github.com/bang9/ai-tools/issues/52)
**Date**: 2026-03-25

## Summary

Add hunk-level and line-level stage/unstage/discard operations to the Changes tab diff view, plus multi-file selection with batch actions in the file list. Keyboard-first interaction (Space key) with mouse support (click, shift+click, drag).

## Current State

- **Backend (Rust)**: Hunk and line-level operations fully implemented in `grove-core/src/git_diff.rs` — `stageHunk`, `unstageHunk`, `discardHunk`, `stageLines`, `unstageLines`, `discardLines` all work via selective git patches.
- **Store**: `diff.ts` has `selectedLines: Set<number>`, `toggleLine()`, `selectLine()` — defined but never wired to UI.
- **UI**: Only file-level stage/unstage/discard exposed in `src/components/tab/ChangesPanel.tsx`. `DiffViewer` passes empty `selectedLines` and no-op `onToggleLine`. `DiffHunk` receives `hunkIndex`, `filePath`, `selectedLines`, `onToggleLine` props but doesn't use them.

No keyboard navigation exists anywhere in the diff views.

## Design

### 1. File List Multi-Select

**Scope**: Staged and Unstaged file lists in `ChangesPanel.tsx`.

**Selection model**:
- Click — single select (also updates diff view to show that file)
- Shift+click — range select (from last clicked to current)
- Drag — range select (mousedown + mousemove over file items)
- Esc — clear selection

**Batch action bar**: When 2+ files are selected, a sticky bar appears at the bottom of the file list section:
- Shows count: "N files selected"
- Unstaged list: **Stage Selected** / **Discard Selected** buttons
- Staged list: **Unstage Selected** button
- Space key triggers the primary action (stage or unstage depending on section)

**State**: Selection state is local to `ChangesPanel` (not persisted). Managed via a `useFileSelection` hook that tracks `selectedFileIds: Set<string>` and `lastClickedIndex: number`.

### 2. Diff View — Hunk Actions

**Scope**: `DiffHunk.tsx` hunk header.

**Buttons**: Always visible on the right side of each hunk header.
- Viewing unstaged file: **Stage Hunk** / **Discard** buttons
- Viewing staged file: **Unstage Hunk** button

**Backend calls**: `stageHunk(worktreePath, filePath, hunkIndex)`, `unstageHunk(...)`, `discardHunk(...)` — already implemented.

**After action**: Auto-refresh diff. If hunk disappears (fully staged/unstaged), diff collapses smoothly.

### 3. Diff View — Line Selection & Actions

**Scope**: `DiffHunk.tsx` line rows (add/remove lines only, not context lines).

**Selection model**:
- Gutter click — toggle single line selection
- Shift+click — range select (from last clicked line to current)
- Gutter drag — range select (mousedown + mousemove over gutter area)
- Only +/- lines are selectable (context lines are inert)
- Selection visualized as: left highlight bar (3px, accent color) + slightly intensified row background

**Keyboard**:
- Space — stage/unstage selected lines. If no lines selected, stage/unstage the focused hunk.
- Esc — clear line selection

**Action determination**: Automatic based on the file being viewed.
- Viewing unstaged diff → Space = `stageLines`
- Viewing staged diff → Space = `unstageLines`

**Backend calls**: `stageLines(worktreePath, filePath, hunkIndex, lineIndices)`, `unstageLines(...)` — already implemented. `lineIndices` maps to the `selectedLines: Set<number>` in the store.

**State**: Line selection managed in `diff.ts` store (existing `selectedLines` + `toggleLine` + `selectLine`). Clear selection on file change or after action completes.

### 4. Selection Visuals

**File list selection**: Blue accent — `rgba(88, 166, 255, 0.12)` background + `3px` left border bar in `rgba(88, 166, 255, 0.5)`.

**Diff line selection**: Intensified row background + `3px` left inset box-shadow in the line's diff color (green for adds, red for removes). Uses existing diff color palette, just more prominent when selected.

### 5. Keyboard Summary

| Context | Key | Action |
|---------|-----|--------|
| File list | Space | Stage/unstage selected files |
| File list | Esc | Clear file selection |
| Diff view | Space | Stage/unstage selected lines (or focused hunk if no selection) |
| Diff view | Esc | Clear line selection |

## Architecture

### New hooks

- `useFileSelection(items)` — manages multi-select for file lists (click, shift+click, drag). Returns `{ selectedIds, handlers, clearSelection }`.
- `useLineSelection()` — manages line selection for diff view (click, shift+click, drag on gutter). Wraps existing `diff.ts` store methods.

### Modified components

- `ChangesPanel.tsx` — wire `useFileSelection` to file items, add batch action bar, keyboard handler
- `DiffHunk.tsx` — add hunk action buttons to header, wire line selection to gutter, selection highlight styles
- `DiffViewer.tsx` — pass real `selectedLines` and handlers instead of empty set / no-op

### Store changes

- `diff.ts` — add `selectLineRange(start, end)`. Existing `selectedLines`, `toggleLine`, `selectLine`, and `clearSelection` are already there.

### No backend changes

All Rust operations (`stageHunk`, `unstageHunk`, `discardHunk`, `stageLines`, `unstageLines`, `discardLines`) are already implemented and exposed via IPC.

## Out of Scope

- j/k keyboard navigation between lines/hunks (can add later)
- Cmd+click for non-contiguous multi-select (shift+click and drag cover the primary use cases)
- Discard for line-level selection (stage/unstage only — discard is destructive and hunk-level is sufficient)
- Context menu (right-click) — buttons and keyboard cover the workflows
