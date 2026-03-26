# Changes Tab Redesign — Unified Selection + Multi-File Diff

**Issue**: [#52](https://github.com/bang9/ai-tools/issues/52)
**Date**: 2026-03-25
**Supersedes**: `2026-03-25-selective-stage-unstage-design.md` (first iteration, UX rejected)

## Summary

Redesign the Changes tab to unify file viewing and stage selection into a single interaction model. Selected files show their diffs in one scrollable view grouped by file. File selection uses marquee (lasso) drag like desktop OS file managers. Hunk and line-level stage/unstage from the first iteration are preserved.

## Problems with First Iteration

1. **Split mental model**: clicking a file shows its diff, but staging requires a separate shift+click multi-select flow. Two different selection modes for the same files.
2. **Linear drag**: dragging over file items selects a contiguous range top-to-bottom. Users expect desktop-style marquee rectangle selection.
3. **Design mismatch**: selection highlight colors and action bar styling don't match the app's visual language.

## Design

### 1. Unified File Selection

One selection model for both viewing and staging:

- **Click** → select that file only (deselect rest), show its diff
- **Shift+click** → range select from last clicked, show all selected diffs
- **Marquee drag** → draw rectangle over file list area, all files intersecting the rectangle are selected, show all selected diffs
- **Esc** → deselect all, clear diff view
- **Space** → stage/unstage all selected files (file-level batch action)

Selection state is local to the `WorkingChangesView` component (React state, not in diff store). Staged and Unstaged sections each have independent selection. The store's `selectedFile` is no longer used for working changes — selection is fully component-local. Clicking a file does NOT call `store.selectFile`; instead it updates local `selectedFiles` state and triggers diff loading at the component level.

### 2. Marquee Drag Selection

Desktop-style rectangle selection on the file list:

- `mousedown` on empty space (not on a file item) starts the marquee
- `mousemove` while held draws a semi-transparent blue rectangle overlay
- Files whose bounding boxes intersect the rectangle become selected
- `mouseup` ends the marquee, selected files remain highlighted
- Marquee rectangle: `border: 1px solid rgba(99, 163, 255, 0.5)`, `background: rgba(99, 163, 255, 0.06)`, `border-radius: 2px`

Implementation: a `useMarqueeSelection` hook that manages the rectangle state and hit-testing against file item refs.

### 3. Multi-File Diff View

`DiffViewer` currently shows one file's diff. Redesign to accept multiple files:

```
[File A header — filename, status badge, +N -M stats]
  [@@ hunk 1 @@]  [Stage] [Discard]
    diff lines...
  [@@ hunk 2 @@]  [Stage] [Discard]
    diff lines...
[File B header]
  [@@ hunk 1 @@]  [Stage] [Discard]
    diff lines...
[File C header]
  ...
```

- Single scrollable view with all selected files concatenated
- **File header**: sticky within its section, shows filename, status color (M/A/D), `+N -M` line stats
- **Hunk headers**: same as current, with Stage/Unstage/Discard buttons
- **Line selection**: gutter click/shift+click/drag, same as first iteration
- **Keyboard**: Space stages/unstages selected lines (or focused hunk if no lines selected), Esc clears line selection

Data flow: `WorkingChangesView` calls `getWorkingDiff` for each selected file (in parallel via `Promise.all`), collects results into `FileDiff[]`, passes to `DiffViewer` as a prop. Diff loading is component-level (not stored in `diff.ts`) — each selection change triggers a fresh load. The store's `currentDiff` / `selectedFile` / `loadWorkingDiff` are no longer used for working changes view; they remain for commit view only.

**Line selection scoping**: `selectedLines` in the store is a flat `Set<number>`. Since diff line indices are globally unique within a single `getWorkingDiff` response, but may collide across files, line selection is scoped per-file: `selectedLines` becomes `Map<string, Set<number>>` keyed by file path. `selectLine`, `toggleLine`, `selectLineRange`, `clearSelection` all take an optional `filePath` parameter. `useLineSelection` passes the current file path context from the `DiffHunk` it's operating within.

### 4. Action Bar

When files are selected, a bottom bar shows:
- File count: "N files"
- Hint: "Space: Stage" or "Space: Unstage" (context-dependent)
- Visible only when selection exists

### 5. Design Tokens

Match the mockup aesthetic (dark, subtle, low-contrast accents):

- **File selection highlight**: `bg: rgba(99, 163, 255, 0.08)`, left border `2px solid rgba(99, 163, 255, 0.5)`
- **Marquee rectangle**: `border: 1px solid rgba(99, 163, 255, 0.5)`, `bg: rgba(99, 163, 255, 0.06)`
- **Action bar**: `bg: rgba(99, 163, 255, 0.06)`, `border-top: 1px solid rgba(99, 163, 255, 0.15)`
- **File header in diff**: `bg: rgba(99, 163, 255, 0.06)`, sticky
- **Hunk header**: `bg: rgba(99, 163, 255, 0.04)`
- **Hunk action buttons**: `border: 1px solid rgba(255, 255, 255, 0.08)`, `color: rgba(255, 255, 255, 0.4)`
- **Diff add lines**: `bg: rgba(63, 185, 80, 0.07)`, left border `2px solid rgba(63, 185, 80, 0.3)`
- **Diff remove lines**: `bg: rgba(248, 81, 73, 0.07)`, left border `2px solid rgba(248, 81, 73, 0.3)`
- **Line numbers**: `color: rgba(255, 255, 255, 0.15)`, selected line number uses the line color at 0.4 opacity

## Architecture

### New

- `useMarqueeSelection(containerRef, itemRefs)` — manages rectangle drawing, hit-testing, returns `selectedIds`

### Modified

- `DiffViewer` — accepts `diffs: FileDiff[]` (array) instead of `diff: FileDiff | null`. Renders file headers + hunks per file.
- `ChangesPanel` / `WorkingChangesView` — loads diffs for all selected files, passes array to `DiffViewer`. Marquee container wraps file list.
- `useFileSelection` — simplified: single click = select only, shift = range. Drag removed (marquee replaces it). Fix: remove the `useEffect` that clears selection when `items` changes (the 2-second polling in `useDiff` re-fetches `fileStatuses` which triggers items change, wiping selection). Instead, only clear selection on explicit worktree change.

### Preserved from First Iteration

- `useLineSelection` — gutter click/shift/drag for line selection (unchanged)
- `DiffHunk` — hunk action buttons + line selection highlight (unchanged)
- `diff.ts` store — `selectLineRange`, all mutation actions (preserved). `selectedLines` changes from `Set<number>` to `Map<string, Set<number>>` (keyed by filePath) and selection methods gain a `filePath` parameter.
- Backend (Rust) — all hunk/line operations (unchanged)

### Removed

- `BatchActionBar` component (replaced by simpler action bar)
- `useFileSelection`'s linear drag logic (replaced by marquee)
- `FileItem`'s `onMouseDown`/`onMouseMove`/`onMouseEnter`/`onMouseUp` drag handlers

## Out of Scope

- Cmd+click for non-contiguous multi-select
- Collapse/expand file sections in multi-file diff view
- File header as tab bar (switching between files)
- Commit view multi-select (commit view is read-only, no stage actions)
