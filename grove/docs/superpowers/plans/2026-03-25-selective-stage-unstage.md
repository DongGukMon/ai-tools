# Selective Stage/Unstage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hunk-level and line-level stage/unstage to the diff view, plus multi-file selection with batch actions in the file list.

**Architecture:** Backend (Rust) already has all hunk/line operations. Store (`diff.ts`) has unused `selectedLines`/`toggleLine`/`selectLine`/`clearSelection`. This plan wires them to the UI and adds file-level multi-select. Two new hooks (`useFileSelection`, `useLineSelection`) encapsulate selection logic. Modified components: `DiffHunk`, `DiffViewer`, `ChangesPanel`.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-25-selective-stage-unstage-design.md`

---

### Task 1: Add `selectLineRange` to diff store

**Files:**
- Modify: `src/store/diff.ts:206-221`
- Test: `src/store/diff.test.ts` (create if needed, or add to existing)

- [ ] **Step 1: Write tests for line selection**

```typescript
// In diff.test.ts or a new describe block
describe("line selection", () => {
  beforeEach(() => {
    useDiffStore.setState({ selectedLines: new Set() });
  });

  it("selectLine sets a single line", () => {
    useDiffStore.getState().selectLine(5);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([5]));
  });

  it("toggleLine adds and removes", () => {
    useDiffStore.getState().toggleLine(3);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([3]));
    useDiffStore.getState().toggleLine(3);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set());
  });

  it("selectLineRange selects inclusive range", () => {
    useDiffStore.getState().selectLineRange(2, 5);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selectLineRange works in reverse", () => {
    useDiffStore.getState().selectLineRange(5, 2);
    expect(useDiffStore.getState().selectedLines).toEqual(new Set([2, 3, 4, 5]));
  });

  it("clearSelection empties set", () => {
    useDiffStore.getState().selectLine(1);
    useDiffStore.getState().clearSelection();
    expect(useDiffStore.getState().selectedLines).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter grove test -- --run src/store/diff.test.ts`
Expected: `selectLineRange` is not a function

- [ ] **Step 3: Add `selectLineRange` to store**

In `src/store/diff.ts`, add to the `DiffState` interface (after line 31):

```typescript
selectLineRange: (start: number, end: number) => void;
```

And in the store body (after `clearSelection` at line 221):

```typescript
selectLineRange: (start, end) => {
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const next = new Set<number>();
  for (let i = min; i <= max; i++) {
    next.add(i);
  }
  set({ selectedLines: next });
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter grove test -- --run src/store/diff.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```
feat(grove): add selectLineRange to diff store
```

---

### Task 2: Add hunk action buttons to `DiffHunk`

**Files:**
- Modify: `src/components/diff/DiffHunk.tsx:23-65`
- Modify: `src/components/diff/DiffViewer.tsx:32-46`

- [ ] **Step 1: Update `DiffHunk` props to use all passed props**

In `src/components/diff/DiffHunk.tsx`, change line 32-35 from:

```typescript
export default function DiffHunk({
  hunk,
  isFirst,
}: Props) {
```

to:

```typescript
export default function DiffHunk({
  hunk,
  hunkIndex,
  filePath,
  isFirst,
  selectedLines,
  onToggleLine,
}: Props) {
```

- [ ] **Step 2: Add `isStaged` and action callbacks to props**

Add new props to the `Props` interface:

```typescript
interface Props {
  hunk: DiffHunkType;
  hunkIndex: number;
  filePath: string;
  isFirst: boolean;
  selectedLines: Set<number>;
  onToggleLine: (index: number) => void;
  isStaged: boolean;
  onStageHunk?: (filePath: string, hunkIndex: number) => void;
  onUnstageHunk?: (filePath: string, hunkIndex: number) => void;
  onDiscardHunk?: (filePath: string, hunkIndex: number) => void;
}
```

- [ ] **Step 3: Add hunk action buttons to the header**

In the hunk header div (after the `<span>` for `hunk.header`), add:

```tsx
{/* Hunk actions */}
<div className={cn("flex items-center gap-1 shrink-0")}>
  {isStaged ? (
    <button
      type="button"
      className={cn("px-1.5 py-0.5 text-[10px] rounded border border-border hover:bg-secondary/80 transition-colors text-muted-foreground")}
      onClick={(e) => { e.stopPropagation(); onUnstageHunk?.(filePath, hunkIndex); }}
    >
      Unstage Hunk
    </button>
  ) : (
    <>
      <button
        type="button"
        className={cn("px-1.5 py-0.5 text-[10px] rounded border border-border hover:bg-secondary/80 transition-colors text-muted-foreground")}
        onClick={(e) => { e.stopPropagation(); onStageHunk?.(filePath, hunkIndex); }}
      >
        Stage Hunk
      </button>
      <button
        type="button"
        className={cn("px-1.5 py-0.5 text-[10px] rounded border border-border hover:bg-secondary/80 transition-colors text-muted-foreground")}
        onClick={(e) => { e.stopPropagation(); onDiscardHunk?.(filePath, hunkIndex); }}
      >
        Discard
      </button>
    </>
  )}
</div>
```

- [ ] **Step 4: Update `DiffViewer` to pass new props**

In `src/components/diff/DiffViewer.tsx`, update imports and props:

```typescript
import { useDiffStore } from "../../store/diff";
```

Update the `Props` interface:

```typescript
interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
  isStaged: boolean;
}
```

Update the hunk rendering to pass new props:

```tsx
import { useCallback } from "react";

export default function DiffViewer({ diff, selectedFile, isStaged }: Props) {
  const selectedLines = useDiffStore((s) => s.selectedLines);
  const toggleLine = useDiffStore((s) => s.toggleLine);
  const stageHunk = useDiffStore((s) => s.stageHunk);
  const unstageHunk = useDiffStore((s) => s.unstageHunk);
  const discardHunk = useDiffStore((s) => s.discardHunk);

  // ... empty states unchanged ...

  // Note: selectedFile is guaranteed non-null here (early returns above handle null case)
  return (
    <div className={cn("h-full overflow-y-auto")}>
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={selectedFile!}
          isFirst={i === 0}
          selectedLines={selectedLines}
          onToggleLine={toggleLine}
          isStaged={isStaged}
          onStageHunk={stageHunk}
          onUnstageHunk={unstageHunk}
          onDiscardHunk={discardHunk}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Update `ChangesPanel` to pass `isStaged` to `DiffViewer`**

In `src/components/tab/ChangesPanel.tsx`, update both `DiffViewer` usages:

WorkingChangesView (line 196):
```tsx
<DiffViewer diff={store.currentDiff} selectedFile={store.selectedFile} isStaged={store.isViewingStaged} />
```

CommitChangesView (line 231) — pass `isCommitView` to hide action buttons:
```tsx
<DiffViewer diff={store.currentDiff} selectedFile={store.selectedFile} isStaged={false} isCommitView />
```

Add `isCommitView?: boolean` to `DiffViewer`'s `Props` and skip passing hunk action callbacks when true:
```tsx
onStageHunk={isCommitView ? undefined : stageHunk}
onUnstageHunk={isCommitView ? undefined : unstageHunk}
onDiscardHunk={isCommitView ? undefined : discardHunk}
```

In `DiffHunk`, hide the action buttons when all callbacks are undefined:
```tsx
{(onStageHunk || onUnstageHunk || onDiscardHunk) && (
  <div className={cn("flex items-center gap-1 shrink-0")}>
    {/* ... buttons ... */}
  </div>
)}
```

- [ ] **Step 6: Run lint and verify**

Run: `pnpm --filter grove lint && pnpm --filter grove test`
Expected: Pass

- [ ] **Step 7: Commit**

```
feat(grove): add hunk-level stage/unstage/discard buttons to diff view
```

---

### Task 3: Add line selection to `DiffHunk` gutter

**Files:**
- Create: `src/hooks/useLineSelection.ts`
- Modify: `src/components/diff/DiffHunk.tsx`
- Modify: `src/components/diff/DiffViewer.tsx`

- [ ] **Step 1: Create `useLineSelection` hook**

Create `src/hooks/useLineSelection.ts`:

```typescript
import { useCallback, useRef } from "react";
import { useDiffStore } from "../store/diff";

export function useLineSelection() {
  const toggleLine = useDiffStore((s) => s.toggleLine);
  const selectLineRange = useDiffStore((s) => s.selectLineRange);
  const clearSelection = useDiffStore((s) => s.clearSelection);
  const lastClickedRef = useRef<number | null>(null);
  const dragStartRef = useRef<number | null>(null);

  const handleGutterClick = useCallback(
    (lineIndex: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedRef.current !== null) {
        selectLineRange(lastClickedRef.current, lineIndex);
      } else {
        toggleLine(lineIndex);
      }
      lastClickedRef.current = lineIndex;
    },
    [toggleLine, selectLineRange],
  );

  const handleGutterMouseDown = useCallback(
    (lineIndex: number) => {
      dragStartRef.current = lineIndex;
    },
    [],
  );

  const handleGutterMouseEnter = useCallback(
    (lineIndex: number, buttons: number) => {
      // buttons === 1 means primary button is held
      if (buttons === 1 && dragStartRef.current !== null) {
        selectLineRange(dragStartRef.current, lineIndex);
      }
    },
    [selectLineRange],
  );

  const handleGutterMouseUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  return {
    handleGutterClick,
    handleGutterMouseDown,
    handleGutterMouseEnter,
    handleGutterMouseUp,
    clearSelection,
  };
}
```

- [ ] **Step 2: Add selection highlight and gutter interaction to `DiffHunk`**

In `DiffHunk.tsx`, update the `LineGroupView` to accept and use selection props:

```typescript
function LineGroupView({
  type,
  lines,
  selectedLines,
  onGutterClick,
  onGutterMouseDown,
  onGutterMouseEnter,
  onGutterMouseUp,
}: {
  type: GroupType;
  lines: DiffLineType[];
  selectedLines: Set<number>;
  onGutterClick: (lineIndex: number, shiftKey: boolean) => void;
  onGutterMouseDown: (lineIndex: number) => void;
  onGutterMouseEnter: (lineIndex: number, buttons: number) => void;
  onGutterMouseUp: () => void;
}) {
```

**Important:** `LineGroupView` has **two separate `lines.map` loops** — one for the gutter column (line numbers + prefix) and one for the content column (code text). Apply click/mouse handlers and selection box-shadow to the **gutter** column's map. Apply background highlight to the **content** column's map. The `isSelectable` and `isSelected` logic is computed per-line in both maps.

For the gutter column's `lines.map`, update each line div:

```tsx
{lines.map((line) => {
  const isSelectable = type !== "context";
  const isSelected = isSelectable && selectedLines.has(line.index);

  return (
    <div
      key={line.index}
      className={cn("flex min-h-[20px] leading-[20px] font-mono text-[12px]", {
        "cursor-pointer": isSelectable,
      })}
      style={isSelected ? { boxShadow: `inset 3px 0 0 ${borderColor.replace("0.3", "0.8")}` } : undefined}
      onClick={isSelectable ? (e) => { e.stopPropagation(); onGutterClick(line.index, e.shiftKey); } : undefined}
      onMouseDown={isSelectable ? () => onGutterMouseDown(line.index) : undefined}
      onMouseEnter={isSelectable ? (e) => onGutterMouseEnter(line.index, e.buttons) : undefined}
      onMouseUp={isSelectable ? onGutterMouseUp : undefined}
    >
      {/* existing gutter spans */}
    </div>
  );
})}
```

For the content lines, add selected background:

```tsx
<div
  key={line.index}
  className={cn("min-h-[20px] leading-[20px] font-mono text-[12px] whitespace-pre pr-3", {
    "text-foreground/80": isContext,
  })}
  style={isSelected ? { backgroundColor: isAdd ? "rgba(46, 160, 67, 0.15)" : "rgba(248, 81, 73, 0.15)" } : undefined}
>
```

- [ ] **Step 3: Wire `useLineSelection` in `DiffViewer`**

In `DiffViewer.tsx`, use the hook and pass handlers to `DiffHunk`:

```typescript
import { useLineSelection } from "../../hooks/useLineSelection";

// Inside the component:
const { handleGutterClick, handleGutterMouseDown, handleGutterMouseEnter, handleGutterMouseUp } = useLineSelection();
```

Pass to each `DiffHunk`:
```tsx
onGutterClick={handleGutterClick}
onGutterMouseDown={handleGutterMouseDown}
onGutterMouseEnter={handleGutterMouseEnter}
onGutterMouseUp={handleGutterMouseUp}
```

Update `DiffHunk` props interface to include these, and pass them through to `LineGroupView`.

- [ ] **Step 4: Run lint and verify**

Run: `pnpm --filter grove lint && pnpm --filter grove test`
Expected: Pass

- [ ] **Step 5: Commit**

```
feat(grove): add line selection with click, shift+click, and drag in diff gutter
```

---

### Task 4: Add keyboard shortcuts (Space/Esc) to diff view

**Files:**
- Modify: `src/components/diff/DiffViewer.tsx`

- [ ] **Step 1: Add `onKeyDown` handler to `DiffViewer`**

In `DiffViewer.tsx`, add a keyboard handler and `tabIndex` to the scrollable container:

```typescript
const selectedLines = useDiffStore((s) => s.selectedLines);
const stageLines = useDiffStore((s) => s.stageLines);
const unstageLines = useDiffStore((s) => s.unstageLines);
const stageHunk = useDiffStore((s) => s.stageHunk);
const unstageHunk = useDiffStore((s) => s.unstageHunk);
const clearSelection = useDiffStore((s) => s.clearSelection);

const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    if (!selectedFile) return;

    if (e.key === " ") {
      e.preventDefault();
      if (selectedLines.size > 0) {
        // Group selected lines by hunk index
        const linesByHunk = new Map<number, number[]>();
        for (const lineIdx of selectedLines) {
          // Find which hunk this line belongs to
          if (!diff) continue;
          for (let hi = 0; hi < diff.hunks.length; hi++) {
            const hunk = diff.hunks[hi];
            if (hunk.lines.some((l) => l.index === lineIdx)) {
              const arr = linesByHunk.get(hi) ?? [];
              arr.push(lineIdx);
              linesByHunk.set(hi, arr);
              break;
            }
          }
        }
        // Apply action per hunk
        const action = isStaged ? unstageLines : stageLines;
        for (const [hunkIdx, lines] of linesByHunk) {
          action(selectedFile, hunkIdx, lines);
        }
      } else if (diff && diff.hunks.length > 0) {
        // No selection — act on first hunk (or focused hunk if we add focus tracking later)
        const action = isStaged ? unstageHunk : stageHunk;
        action(selectedFile, 0);
      }
    }

    if (e.key === "Escape") {
      clearSelection();
    }
  },
  [selectedFile, selectedLines, diff, isStaged, stageLines, unstageLines, stageHunk, unstageHunk, clearSelection],
);
```

Add to the container div:

```tsx
<div className={cn("h-full overflow-y-auto outline-none")} tabIndex={0} onKeyDown={handleKeyDown}>
```

- [ ] **Step 2: Run lint and verify**

Run: `pnpm --filter grove lint && pnpm --filter grove test`
Expected: Pass

- [ ] **Step 3: Commit**

```
feat(grove): add Space/Esc keyboard shortcuts for line and hunk stage/unstage
```

---

### Task 5: File list multi-select with `useFileSelection` hook

**Files:**
- Create: `src/hooks/useFileSelection.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useFileSelection.ts`:

```typescript
import { useCallback, useRef, useState } from "react";

interface UseFileSelectionResult<T> {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  handleClick: (id: string, index: number, shiftKey: boolean) => void;
  handleMouseDown: (id: string, index: number) => void;
  handleMouseEnter: (id: string, index: number, buttons: number) => void;
  handleMouseUp: () => void;
  clearSelection: () => void;
}

export function useFileSelection<T>(
  items: T[],
  getId: (item: T) => string,
): UseFileSelectionResult<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);

  const selectRange = useCallback(
    (from: number, to: number) => {
      const min = Math.min(from, to);
      const max = Math.max(from, to);
      const next = new Set<string>();
      for (let i = min; i <= max && i < items.length; i++) {
        next.add(getId(items[i]));
      }
      setSelectedIds(next);
    },
    [items, getId],
  );

  const handleClick = useCallback(
    (id: string, index: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedIndexRef.current !== null) {
        selectRange(lastClickedIndexRef.current, index);
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      }
      lastClickedIndexRef.current = index;
    },
    [selectRange],
  );

  const handleMouseDown = useCallback((_id: string, index: number) => {
    dragStartIndexRef.current = index;
  }, []);

  const handleMouseEnter = useCallback(
    (_id: string, index: number, buttons: number) => {
      if (buttons === 1 && dragStartIndexRef.current !== null) {
        selectRange(dragStartIndexRef.current, index);
      }
    },
    [selectRange],
  );

  const handleMouseUp = useCallback(() => {
    dragStartIndexRef.current = null;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIndexRef.current = null;
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    selectedIds,
    isSelected,
    handleClick,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp,
    clearSelection,
  };
}
```

- [ ] **Step 2: Run lint**

Run: `pnpm --filter grove lint`
Expected: Pass

- [ ] **Step 3: Commit**

```
feat(grove): add useFileSelection hook for multi-select with click, shift, drag
```

---

### Task 6: Wire file multi-select into `ChangesPanel`

**Files:**
- Modify: `src/components/tab/ChangesPanel.tsx`

- [ ] **Step 1: Update `FileItem` for multi-select interactions**

Add new props to `FileItem`:

```typescript
function FileItem({
  file,
  index,
  selected,
  multiSelected,
  onSelect,
  onMultiSelectClick,
  onMultiSelectMouseDown,
  onMultiSelectMouseEnter,
  onMultiSelectMouseUp,
  actions,
}: {
  file: FileStatus;
  index: number;
  selected: boolean;
  multiSelected: boolean;
  onSelect: (path: string, staged: boolean) => void;
  onMultiSelectClick: (id: string, index: number, shiftKey: boolean) => void;
  onMultiSelectMouseDown: (id: string, index: number) => void;
  onMultiSelectMouseEnter: (id: string, index: number, buttons: number) => void;
  onMultiSelectMouseUp: () => void;
  actions?: React.ReactNode;
}) {
```

Add a `draggedRef` to detect drag vs click. Use `onMouseDown` to start tracking, `onMouseMove` to flag drag, and `onClick` to distinguish:

```tsx
const draggedRef = useRef(false);

// On FileItem:
onMouseDown={(e) => {
  draggedRef.current = false;
  onMultiSelectMouseDown(file.path, index);
}}
onMouseMove={() => {
  draggedRef.current = true;
}}
onMouseEnter={(e) => onMultiSelectMouseEnter(file.path, index, e.buttons)}
onMouseUp={onMultiSelectMouseUp}
onClick={(e) => {
  if (draggedRef.current) return; // Was a drag, not a click
  if (e.shiftKey) {
    onMultiSelectClick(file.path, index, true);
  } else {
    onSelect(file.path, file.staged);
  }
}}
```

Note: `draggedRef` is per-item (each `FileItem` tracks its own drag state independently), so define it inside `FileItem`. Add `import { useRef } from "react"` to `ChangesPanel.tsx`.

Add `multiSelected` to the className:

```tsx
className={cn(
  "group flex items-center gap-1.5 w-full px-2 py-0.5 text-xs transition-colors cursor-pointer select-none",
  {
    "bg-accent text-accent-foreground": selected && !multiSelected,
    "bg-blue-500/10 text-foreground": multiSelected,
    "text-foreground hover:bg-muted": !selected && !multiSelected,
  },
)}
style={multiSelected ? { boxShadow: "inset 3px 0 0 rgba(88, 166, 255, 0.5)" } : undefined}
```

- [ ] **Step 2: Update `FileSection` and `WorkingChangesView` to use `useFileSelection`**

In `WorkingChangesView`, add the hook and batch action bar:

```typescript
import { useFileSelection } from "../../hooks/useFileSelection";

function WorkingChangesView({ store, ratios, onCommit }: { ... }) {
  const staged = store.fileStatuses.filter((f) => f.staged);
  const unstaged = store.fileStatuses.filter((f) => !f.staged);

  const stagedSelection = useFileSelection(staged, (f) => f.path);
  const unstagedSelection = useFileSelection(unstaged, (f) => f.path);
```

Add batch action bar component:

```tsx
function BatchActionBar({
  count,
  actions,
}: {
  count: number;
  actions: { label: string; onClick: () => void; variant?: "danger" }[];
}) {
  if (count < 2) return null;
  return (
    <div className={cn("flex items-center justify-between px-2 py-1 border-t border-blue-500/20 bg-blue-500/5")}>
      <span className={cn("text-[11px] text-blue-400")}>{count} files selected</span>
      <div className={cn("flex gap-1")}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={cn("px-2 py-0.5 text-[10px] rounded border transition-colors", {
              "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20": !a.variant,
              "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20": a.variant === "danger",
            })}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Wire batch actions in `WorkingChangesView`. Add handlers after the hook calls:

```typescript
const batchAction = useCallback(async (
  action: (path: string) => Promise<void>,
  selection: ReturnType<typeof useFileSelection<FileStatus>>,
) => {
  const paths = [...selection.selectedIds];
  selection.clearSelection();
  for (const path of paths) {
    await action(path);
  }
}, []);
```

Render `BatchActionBar` at the bottom of each file section:

```tsx
{/* After staged FileSection */}
<BatchActionBar
  count={stagedSelection.selectedIds.size}
  actions={[{ label: "Unstage Selected", onClick: () => batchAction(store.unstageFile, stagedSelection) }]}
/>

{/* After unstaged FileSection */}
<BatchActionBar
  count={unstagedSelection.selectedIds.size}
  actions={[
    { label: "Stage Selected", onClick: () => batchAction(store.stageFile, unstagedSelection) },
    { label: "Discard Selected", onClick: () => batchAction(store.discardFile, unstagedSelection), variant: "danger" },
  ]}
/>
```

- [ ] **Step 3: Add `onKeyDown` for Space/Esc on file list**

Wrap each `FileSection` container with a `tabIndex={0}` and `onKeyDown`:

```tsx
onKeyDown={(e) => {
  if (e.key === " " && selection.selectedIds.size > 0) {
    e.preventDefault();
    batchAction(action, selection); // action = store.stageFile or store.unstageFile
  }
  if (e.key === "Escape") {
    selection.clearSelection();
  }
}}
```

- [ ] **Step 4: Pass selection props through `FileSection` to `FileItem`**

Update `FileSection` to accept and forward multi-select handlers. Add to `FileSection` props:

```typescript
function FileSection({
  title,
  files,
  selectedFile,
  onSelect,
  renderActions,
  selection,
}: {
  title: string;
  files: FileStatus[];
  selectedFile: string | null;
  onSelect: (path: string, staged: boolean) => void;
  renderActions?: (file: FileStatus) => React.ReactNode;
  selection: ReturnType<typeof useFileSelection<FileStatus>>;
}) {
```

In `FileSection`, update the `files.map` to pass index and selection props:

```tsx
{files.map((file, index) => (
  <FileItem
    key={`${file.staged ? "s" : "u"}:${file.path}`}
    file={file}
    index={index}
    selected={file.path === selectedFile}
    multiSelected={selection.isSelected(file.path)}
    onSelect={onSelect}
    onMultiSelectClick={selection.handleClick}
    onMultiSelectMouseDown={selection.handleMouseDown}
    onMultiSelectMouseEnter={selection.handleMouseEnter}
    onMultiSelectMouseUp={selection.handleMouseUp}
    actions={renderActions?.(file)}
  />
))}
```

In `WorkingChangesView`, pass `selection` to each `FileSection`:

```tsx
<FileSection ... selection={stagedSelection} />
<FileSection ... selection={unstagedSelection} />
```

- [ ] **Step 5: Run lint and test**

Run: `pnpm --filter grove lint && pnpm --filter grove test`
Expected: Pass

- [ ] **Step 6: Commit**

```
feat(grove): add file list multi-select with batch stage/unstage actions
```

---

### Task 7: Integration test and polish

**Files:**
- All modified files from above

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter grove lint && pnpm --filter grove test`
Expected: All pass

- [ ] **Step 2: Manual verification checklist**

Verify with `pnpm tauri dev`:

1. Hunk buttons: Stage Hunk / Discard visible on unstaged file diff
2. Hunk buttons: Unstage Hunk visible on staged file diff
3. Click hunk button → diff refreshes, hunk moves between staged/unstaged
4. Gutter click on +/- line → highlight appears
5. Shift+click → range selected
6. Drag over gutter → range selected
7. Space with lines selected → lines staged/unstaged
8. Space with no selection → first hunk staged/unstaged
9. Esc → selection cleared
10. File list: Shift+click → multi-select
11. File list: Drag → multi-select
12. Batch action bar appears when 2+ files selected
13. Space in file list → batch stage/unstage
14. Context lines not selectable

- [ ] **Step 3: Commit any polish fixes**

```
fix(grove): polish selective stage/unstage interactions
```
