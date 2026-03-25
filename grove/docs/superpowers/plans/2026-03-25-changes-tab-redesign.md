# Changes Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Changes tab to unify file selection and diff viewing, add marquee drag selection, and render multi-file diffs in one scrollable view.

**Architecture:** File selection becomes component-local state in `WorkingChangesView`. Selected files' diffs are loaded in parallel (`Promise.all` over `getWorkingDiff`) and passed as `FileDiff[]` to a redesigned `DiffViewer`. Line selection is scoped per-file via `Map<string, Set<number>>`. A new `useMarqueeSelection` hook handles rectangle drawing and hit-testing. Design tokens from the approved mockup replace the current styling.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-25-changes-tab-redesign.md`

---

### Task 1: Scope `selectedLines` per file in diff store

**Files:**
- Modify: `src/store/diff.ts`
- Modify: `src/store/diff.test.ts`

Currently `selectedLines: Set<number>` is a flat set. Multi-file diff needs per-file scoping to avoid index collisions.

- [ ] **Step 1: Update tests for per-file line selection**

In `src/store/diff.test.ts`, update existing tests:

```typescript
describe("line selection", () => {
  beforeEach(() => {
    useDiffStore.setState({ selectedLines: new Map() });
  });

  it("selectLine sets a single line for a file", () => {
    useDiffStore.getState().selectLine("file-a", 5);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([5]));
  });

  it("toggleLine adds and removes for a file", () => {
    useDiffStore.getState().toggleLine("file-a", 3);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([3]));
    useDiffStore.getState().toggleLine("file-a", 3);
    expect(useDiffStore.getState().selectedLines.get("file-a")?.size ?? 0).toBe(0);
  });

  it("selectLineRange selects inclusive range for a file", () => {
    useDiffStore.getState().selectLineRange("file-a", 2, 5);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selectLineRange works in reverse", () => {
    useDiffStore.getState().selectLineRange("file-a", 5, 2);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([2, 3, 4, 5]));
  });

  it("selections are independent per file", () => {
    useDiffStore.getState().selectLine("file-a", 1);
    useDiffStore.getState().selectLine("file-b", 2);
    expect(useDiffStore.getState().selectedLines.get("file-a")).toEqual(new Set([1]));
    expect(useDiffStore.getState().selectedLines.get("file-b")).toEqual(new Set([2]));
  });

  it("clearSelection empties all files", () => {
    useDiffStore.getState().selectLine("file-a", 1);
    useDiffStore.getState().selectLine("file-b", 2);
    useDiffStore.getState().clearSelection();
    expect(useDiffStore.getState().selectedLines.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter grove test -- --run src/store/diff.test.ts`

- [ ] **Step 3: Update store**

In `src/store/diff.ts`:

Interface changes:
```typescript
selectedLines: Map<string, Set<number>>;
// ...
selectLine: (filePath: string, index: number) => void;
toggleLine: (filePath: string, index: number) => void;
selectLineRange: (filePath: string, start: number, end: number) => void;
```

Implementation changes — update initial state and all methods:
```typescript
selectedLines: new Map(),

selectLine: (filePath, index) => {
  const next = new Map(get().selectedLines);
  next.set(filePath, new Set([index]));
  set({ selectedLines: next });
},

toggleLine: (filePath, index) => {
  const prev = get().selectedLines;
  const next = new Map(prev);
  const fileSet = new Set(prev.get(filePath) ?? []);
  if (fileSet.has(index)) {
    fileSet.delete(index);
  } else {
    fileSet.add(index);
  }
  next.set(filePath, fileSet);
  set({ selectedLines: next });
},

selectLineRange: (filePath, start, end) => {
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const fileSet = new Set<number>();
  for (let i = min; i <= max; i++) {
    fileSet.add(i);
  }
  const next = new Map(get().selectedLines);
  next.set(filePath, fileSet);
  set({ selectedLines: next });
},

clearSelection: () => set({ selectedLines: new Map() }),
```

Also update every place that resets `selectedLines` (search for `selectedLines: new Set()`) to `selectedLines: new Map()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter grove test -- --run src/store/diff.test.ts`

- [ ] **Step 5: Update `useLineSelection` hook to pass filePath**

In `src/hooks/useLineSelection.ts`, add `filePath` parameter:

```typescript
export function useLineSelection(filePath: string) {
  const selectLine = useDiffStore((s) => s.selectLine);
  const selectLineRange = useDiffStore((s) => s.selectLineRange);
  const clearSelection = useDiffStore((s) => s.clearSelection);
  const lastClickedRef = useRef<number | null>(null);
  const dragStartRef = useRef<number | null>(null);

  const handleGutterClick = useCallback(
    (lineIndex: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedRef.current !== null) {
        selectLineRange(filePath, lastClickedRef.current, lineIndex);
      } else {
        selectLine(filePath, lineIndex);
      }
      lastClickedRef.current = lineIndex;
    },
    [filePath, selectLine, selectLineRange],
  );

  const handleGutterMouseEnter = useCallback(
    (lineIndex: number, buttons: number) => {
      if (buttons === 1 && dragStartRef.current !== null) {
        selectLineRange(filePath, dragStartRef.current, lineIndex);
      }
    },
    [filePath, selectLineRange],
  );
  // ... rest unchanged
```

- [ ] **Step 6: Run full lint + test**

Run: `pnpm --filter grove lint && pnpm --filter grove test`

- [ ] **Step 7: Commit**

```
refactor(grove): scope selectedLines per file for multi-file diff support
```

---

### Task 2: Redesign `DiffViewer` for multi-file rendering

**Files:**
- Modify: `src/components/diff/DiffViewer.tsx`

- [ ] **Step 1: Update Props to accept `FileDiff[]`**

```typescript
interface Props {
  diffs: FileDiff[];
  isStaged: boolean;
  isCommitView?: boolean;
}
```

- [ ] **Step 2: Rewrite render to group by file**

```tsx
export default function DiffViewer({ diffs, isStaged, isCommitView }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLines = useDiffStore((s) => s.selectedLines);
  const stageHunk = useDiffStore((s) => s.stageHunk);
  const unstageHunk = useDiffStore((s) => s.unstageHunk);
  const discardHunk = useDiffStore((s) => s.discardHunk);
  const stageLines = useDiffStore((s) => s.stageLines);
  const unstageLines = useDiffStore((s) => s.unstageLines);
  const clearSelection = useDiffStore((s) => s.clearSelection);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        // Find first file with selected lines and act on those
        for (const diff of diffs) {
          const fileLines = selectedLines.get(diff.path);
          if (fileLines && fileLines.size > 0) {
            const linesByHunk = new Map<number, number[]>();
            for (const lineIdx of fileLines) {
              for (let hi = 0; hi < diff.hunks.length; hi++) {
                if (diff.hunks[hi].lines.some((l) => l.index === lineIdx)) {
                  const arr = linesByHunk.get(hi) ?? [];
                  arr.push(lineIdx);
                  linesByHunk.set(hi, arr);
                  break;
                }
              }
            }
            const action = isStaged ? unstageLines : stageLines;
            for (const [hunkIdx, lines] of linesByHunk) {
              action(diff.path, hunkIdx, lines);
            }
            break; // Act on first file with selection
          }
        }
      }
      if (e.key === "Escape") {
        clearSelection();
      }
    },
    [diffs, selectedLines, isStaged, stageLines, unstageLines, clearSelection],
  );

  if (diffs.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full")}>
        <span className={cn("text-sm text-muted-foreground")}>Select files to view diff</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("h-full overflow-y-auto outline-none")} tabIndex={0} onKeyDown={handleKeyDown}>
      {diffs.map((diff, fi) => (
        <FileDiffSection
          key={diff.path}
          diff={diff}
          isFirst={fi === 0}
          isStaged={isStaged}
          isCommitView={isCommitView}
          selectedLines={selectedLines.get(diff.path) ?? EMPTY_SET}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}

const EMPTY_SET = new Set<number>();
```

- [ ] **Step 3: Create `FileDiffSection` component**

New component inside `DiffViewer.tsx` (or extract to a separate file if large):

```tsx
function FileDiffSection({
  diff,
  isFirst,
  isStaged,
  isCommitView,
  selectedLines,
  containerRef,
}: {
  diff: FileDiff;
  isFirst: boolean;
  isStaged: boolean;
  isCommitView?: boolean;
  selectedLines: Set<number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { handleGutterClick: rawGutterClick, handleGutterMouseDown, handleGutterMouseEnter, handleGutterMouseUp } =
    useLineSelection(diff.path);

  const handleGutterClick = useCallback(
    (lineIndex: number, shiftKey: boolean) => {
      rawGutterClick(lineIndex, shiftKey);
      containerRef.current?.focus();
    },
    [rawGutterClick, containerRef],
  );

  const stageHunk = useDiffStore((s) => s.stageHunk);
  const unstageHunk = useDiffStore((s) => s.unstageHunk);
  const discardHunk = useDiffStore((s) => s.discardHunk);

  // Compute +/- stats
  const added = diff.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "add").length, 0);
  const removed = diff.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "remove").length, 0);

  const statusColor = {
    modified: "rgba(234, 179, 8, 0.7)",
    added: "rgba(63, 185, 80, 0.7)",
    deleted: "rgba(248, 81, 73, 0.7)",
    renamed: "rgba(99, 163, 255, 0.7)",
    untracked: "rgba(63, 185, 80, 0.7)",
  }[diff.status] ?? "rgba(255, 255, 255, 0.4)";

  return (
    <div className={cn({ "mt-2": !isFirst })}>
      {/* File header */}
      <div
        className={cn("flex items-center gap-1.5 px-3 py-1.5 sticky top-0 z-10 border-b border-white/[0.06]")}
        style={{ background: "rgba(99, 163, 255, 0.06)" }}
      >
        <span className={cn("text-[10px] font-semibold uppercase")} style={{ color: statusColor }}>
          {diff.status[0]}
        </span>
        <span className={cn("text-[11px] text-white/70 font-sans truncate flex-1")}>
          {diff.path.split("/").pop()}
        </span>
        <span className={cn("text-[10px] text-white/30")}>
          {added > 0 && `+${added}`}{added > 0 && removed > 0 && " "}{removed > 0 && `-${removed}`}
        </span>
      </div>

      {/* Hunks */}
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={diff.path}
          isFirst={false}
          selectedLines={selectedLines}
          isStaged={isStaged}
          onStageHunk={isCommitView ? undefined : stageHunk}
          onUnstageHunk={isCommitView ? undefined : unstageHunk}
          onDiscardHunk={isCommitView ? undefined : discardHunk}
          onGutterClick={handleGutterClick}
          onGutterMouseDown={handleGutterMouseDown}
          onGutterMouseEnter={handleGutterMouseEnter}
          onGutterMouseUp={handleGutterMouseUp}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run lint + test**

Run: `pnpm --filter grove lint && pnpm --filter grove test`

- [ ] **Step 5: Commit**

```
feat(grove): redesign DiffViewer for multi-file rendering with file headers
```

---

### Task 3: Redesign `WorkingChangesView` with unified selection + multi-file diff loading

**Files:**
- Modify: `src/components/tab/ChangesPanel.tsx`

This is the biggest change. `WorkingChangesView` no longer uses `store.selectFile` / `store.currentDiff`. Instead it manages selection locally and loads diffs at component level.

- [ ] **Step 1: Simplify `FileItem`**

Remove all multi-select mouse handlers from the first iteration. FileItem becomes simple:

```typescript
function FileItem({
  file,
  selected,
  onSelect,
  actions,
}: {
  file: FileStatus;
  selected: boolean;
  onSelect: () => void;
  actions?: React.ReactNode;
}) {
```

Click handler: just `onClick={onSelect}`. Shift+click handled at FileSection level. No drag handlers (marquee replaces that).

Styling uses the redesign tokens:
```tsx
className={cn(
  "group flex items-center gap-1.5 w-full px-2 py-0.5 text-xs transition-colors cursor-pointer select-none",
  {
    "text-foreground": selected,
    "text-muted-foreground hover:bg-muted": !selected,
  },
)}
style={selected ? {
  background: "rgba(99, 163, 255, 0.08)",
  borderLeft: "2px solid rgba(99, 163, 255, 0.5)",
} : undefined}
```

- [ ] **Step 2: Simplify `FileSection`**

Remove `selection` prop. Add `selectedPaths: Set<string>` and `onSelectFile: (path: string, shiftKey: boolean) => void`:

```typescript
function FileSection({
  title,
  files,
  selectedPaths,
  onSelectFile,
  renderActions,
}: {
  title: string;
  files: FileStatus[];
  selectedPaths: Set<string>;
  onSelectFile: (path: string, shiftKey: boolean) => void;
  renderActions?: (file: FileStatus) => React.ReactNode;
}) {
```

Each FileItem's `onSelect` passes the path and shift state:
```tsx
<FileItem
  key={file.path}
  file={file}
  selected={selectedPaths.has(file.path)}
  onSelect={() => onSelectFile(file.path, false)}
  actions={renderActions?.(file)}
/>
```

The section div captures shift+click:
```tsx
<div
  className={cn("flex-1 overflow-y-auto")}
  onClick={(e) => {
    // Let FileItem handle individual clicks
  }}
>
```

Actually, simpler: pass the event from FileItem:
```tsx
onClick={(e) => onSelectFile(file.path, e.shiftKey)}
```

- [ ] **Step 3: Rewrite `WorkingChangesView` with local selection + diff loading**

```typescript
function WorkingChangesView({ store, ratios, onCommit }: { ... }) {
  const staged = store.fileStatuses.filter((f) => f.staged);
  const unstaged = store.fileStatuses.filter((f) => !f.staged);

  // Local selection state (not in store)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedSection, setSelectedSection] = useState<"staged" | "unstaged">("unstaged");
  const lastClickedRef = useRef<{ section: "staged" | "unstaged"; index: number } | null>(null);

  // Multi-file diffs loaded at component level
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const worktreePath = store.worktreePath;

  // Load diffs for selected files
  useEffect(() => {
    if (selectedPaths.size === 0 || !worktreePath) {
      setDiffs([]);
      return;
    }

    let cancelled = false;
    const isStaged = selectedSection === "staged";
    const paths = [...selectedPaths];

    Promise.all(
      paths.map((path) => {
        const queryPath = isStaged ? `staged:${path}` : path;
        return runCommandSafely(() => tauri.getWorkingDiff(worktreePath, queryPath), {
          errorToast: false,
        });
      }),
    ).then((results) => {
      if (cancelled) return;
      setDiffs(results.filter((d): d is FileDiff => d !== null));
    });

    return () => { cancelled = true; };
  }, [selectedPaths, selectedSection, worktreePath]);

  // Selection handlers
  const handleSelectFile = useCallback(
    (section: "staged" | "unstaged", files: FileStatus[], path: string, shiftKey: boolean) => {
      const idx = files.findIndex((f) => f.path === path);
      if (shiftKey && lastClickedRef.current?.section === section && lastClickedRef.current !== null) {
        const from = lastClickedRef.current.index;
        const to = idx;
        const min = Math.min(from, to);
        const max = Math.max(from, to);
        const next = new Set<string>();
        for (let i = min; i <= max && i < files.length; i++) {
          next.add(files[i].path);
        }
        setSelectedPaths(next);
      } else {
        setSelectedPaths(new Set([path]));
      }
      setSelectedSection(section);
      lastClickedRef.current = { section, index: idx };
    },
    [],
  );

  const isStaged = selectedSection === "staged";

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " && selectedPaths.size > 0) {
        e.preventDefault();
        const action = isStaged ? store.unstageFile : store.stageFile;
        const paths = [...selectedPaths];
        setSelectedPaths(new Set());
        (async () => {
          for (const path of paths) {
            await action(path);
          }
        })();
      }
      if (e.key === "Escape") {
        setSelectedPaths(new Set());
      }
    },
    [selectedPaths, isStaged, store],
  );
```

Render:
```tsx
return (
  <ResizablePanelGroup className={cn("h-full")} ratios={ratios} onCommit={onCommit}>
    <ResizablePanelGroup.Pane minSize={160}>
      <div
        className={cn("flex flex-col h-full bg-sidebar overflow-hidden outline-none")}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <FileSection
          title="Staged"
          files={staged}
          selectedPaths={selectedPaths}
          onSelectFile={(path, shiftKey) => handleSelectFile("staged", staged, path, shiftKey)}
          renderActions={(file) => (
            <ActionButton icon={Minus} title="Unstage" onClick={() => store.unstageFile(file.path)} />
          )}
        />
        <div className={cn("border-t border-border")} />
        <FileSection
          title="Unstaged"
          files={unstaged}
          selectedPaths={selectedPaths}
          onSelectFile={(path, shiftKey) => handleSelectFile("unstaged", unstaged, path, shiftKey)}
          renderActions={(file) => (
            <>
              <ActionButton icon={Plus} title="Stage" onClick={() => store.stageFile(file.path)} />
              <ActionButton icon={Undo2} title="Discard" onClick={() => store.discardFile(file.path)} />
            </>
          )}
        />
        {/* Action bar */}
        {selectedPaths.size > 0 && (
          <div
            className={cn("flex items-center justify-between px-2 py-1.5 shrink-0")}
            style={{ background: "rgba(99, 163, 255, 0.06)", borderTop: "1px solid rgba(99, 163, 255, 0.15)" }}
          >
            <span className={cn("text-[10px]")} style={{ color: "rgba(99, 163, 255, 0.7)" }}>
              {selectedPaths.size} file{selectedPaths.size > 1 ? "s" : ""}
            </span>
            <span className={cn("text-[10px]")} style={{
              padding: "2px 8px",
              borderRadius: "3px",
              background: "rgba(99, 163, 255, 0.1)",
              border: "1px solid rgba(99, 163, 255, 0.2)",
              color: "rgba(99, 163, 255, 0.7)",
            }}>
              Space: {isStaged ? "Unstage" : "Stage"}
            </span>
          </div>
        )}
      </div>
    </ResizablePanelGroup.Pane>
    <ResizablePanelGroup.Pane minSize={200}>
      <DiffViewer diffs={diffs} isStaged={isStaged} />
    </ResizablePanelGroup.Pane>
  </ResizablePanelGroup>
);
```

- [ ] **Step 4: Update `CommitChangesView`**

Pass `diffs` as array:
```tsx
<DiffViewer diffs={store.currentDiff ? [store.currentDiff] : store.commitDiffs} isStaged={false} isCommitView />
```

- [ ] **Step 5: Remove dead code**

Remove `BatchActionBar`, `useFileSelection` import, old `FileItem` multi-select props, `noopSelection`. Remove unused `useFileSelection` from imports.

- [ ] **Step 6: Add required imports**

Add `useState`, `useEffect` to imports. Add `import * as tauri from "../../lib/platform"` and `import { runCommandSafely } from "../../lib/command"` for direct diff loading.

- [ ] **Step 7: Run lint + test**

Run: `pnpm --filter grove lint && pnpm --filter grove test`

- [ ] **Step 8: Commit**

```
feat(grove): unified file selection with multi-file diff loading
```

---

### Task 4: Add marquee (lasso) drag selection

**Files:**
- Create: `src/hooks/useMarqueeSelection.ts`
- Modify: `src/components/tab/ChangesPanel.tsx`

- [ ] **Step 1: Create `useMarqueeSelection` hook**

```typescript
import { useCallback, useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseMarqueeResult {
  rect: Rect | null;
  isActive: boolean;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
  };
}

export function useMarqueeSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  itemRefs: React.MutableRefObject<Map<string, HTMLElement>>,
  onSelectionChange: (selectedIds: Set<string>) => void,
): UseMarqueeResult {
  const [rect, setRect] = useState<Rect | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);

  const hitTest = useCallback(
    (marqueeRect: Rect) => {
      const selected = new Set<string>();
      const container = containerRef.current;
      if (!container) return selected;
      const containerBounds = container.getBoundingClientRect();

      for (const [id, el] of itemRefs.current) {
        const itemBounds = el.getBoundingClientRect();
        // Convert to container-relative coordinates
        const itemRelY = itemBounds.top - containerBounds.top + container.scrollTop;
        const itemRelX = itemBounds.left - containerBounds.left;

        const intersects =
          marqueeRect.x < itemRelX + itemBounds.width &&
          marqueeRect.x + marqueeRect.width > itemRelX &&
          marqueeRect.y < itemRelY + itemBounds.height &&
          marqueeRect.y + marqueeRect.height > itemRelY;

        if (intersects) selected.add(id);
      }
      return selected;
    },
    [containerRef, itemRefs],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only start marquee on direct container click (not on file items)
      if (e.target !== e.currentTarget && (e.target as HTMLElement).closest("[data-file-item]")) return;
      const container = containerRef.current;
      if (!container) return;

      const containerBounds = container.getBoundingClientRect();
      const x = e.clientX - containerBounds.left;
      const y = e.clientY - containerBounds.top + container.scrollTop;
      startRef.current = { x, y };
      activeRef.current = false;
      setRect(null);
    },
    [containerRef],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!startRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const containerBounds = container.getBoundingClientRect();
      const currentX = e.clientX - containerBounds.left;
      const currentY = e.clientY - containerBounds.top + container.scrollTop;

      const x = Math.min(startRef.current.x, currentX);
      const y = Math.min(startRef.current.y, currentY);
      const width = Math.abs(currentX - startRef.current.x);
      const height = Math.abs(currentY - startRef.current.y);

      // Only activate after minimum drag distance
      if (!activeRef.current && (width > 4 || height > 4)) {
        activeRef.current = true;
      }

      if (activeRef.current) {
        const newRect = { x, y, width, height };
        setRect(newRect);
        onSelectionChange(hitTest(newRect));
      }
    },
    [containerRef, hitTest, onSelectionChange],
  );

  const onMouseUp = useCallback(() => {
    startRef.current = null;
    activeRef.current = false;
    setRect(null);
  }, []);

  return {
    rect,
    isActive: activeRef.current,
    handlers: { onMouseDown, onMouseMove, onMouseUp },
  };
}
```

- [ ] **Step 2: Wire marquee into `FileSection`**

In `ChangesPanel.tsx`, update `FileSection` to:
1. Accept `containerRef` and `itemRefs` for marquee
2. Wrap file list in a `position: relative` container for the marquee overlay
3. Add `data-file-item` attribute to `FileItem` root div
4. Register each FileItem's ref in `itemRefs`
5. Render the marquee rectangle overlay when active

```tsx
// In FileSection:
const sectionRef = useRef<HTMLDivElement>(null);
const itemRefsMap = useRef<Map<string, HTMLElement>>(new Map());

const marquee = useMarqueeSelection(sectionRef, itemRefsMap, (ids) => {
  onMarqueeSelect(ids);
});

// Render:
<div
  ref={sectionRef}
  className={cn("flex-1 overflow-y-auto relative")}
  {...marquee.handlers}
>
  {files.map((file) => (
    <div
      key={file.path}
      data-file-item
      ref={(el) => {
        if (el) itemRefsMap.current.set(file.path, el);
        else itemRefsMap.current.delete(file.path);
      }}
    >
      <FileItem ... />
    </div>
  ))}

  {/* Marquee overlay */}
  {marquee.rect && (
    <div
      className={cn("absolute pointer-events-none")}
      style={{
        left: marquee.rect.x,
        top: marquee.rect.y,
        width: marquee.rect.width,
        height: marquee.rect.height,
        border: "1px solid rgba(99, 163, 255, 0.5)",
        background: "rgba(99, 163, 255, 0.06)",
        borderRadius: 2,
      }}
    />
  )}
</div>
```

- [ ] **Step 3: Connect marquee to selection state**

Add `onMarqueeSelect` callback to `FileSection` props. In `WorkingChangesView`:

```typescript
const handleMarqueeSelect = useCallback(
  (section: "staged" | "unstaged", ids: Set<string>) => {
    setSelectedPaths(ids);
    setSelectedSection(section);
  },
  [],
);
```

Pass to each FileSection:
```tsx
<FileSection
  ...
  onMarqueeSelect={(ids) => handleMarqueeSelect("staged", ids)}
/>
```

- [ ] **Step 4: Run lint + test**

Run: `pnpm --filter grove lint && pnpm --filter grove test`

- [ ] **Step 5: Commit**

```
feat(grove): add marquee drag selection for file list
```

---

### Task 5: Apply design tokens and polish

**Files:**
- Modify: `src/components/diff/DiffHunk.tsx` — update hunk header and line styling
- Modify: `src/components/diff/DiffViewer.tsx` — verify file header design
- Modify: `src/components/tab/ChangesPanel.tsx` — verify file selection and action bar styling

- [ ] **Step 1: Update DiffHunk styling**

Hunk header background:
```tsx
style={{ background: "rgba(99, 163, 255, 0.04)" }}
```

Hunk action buttons:
```tsx
className={cn("px-1.5 py-0.5 text-[9px] rounded")}
style={{ border: "1px solid rgba(255, 255, 255, 0.08)", color: "rgba(255, 255, 255, 0.4)" }}
```

Diff line backgrounds:
- Add: `background: rgba(63, 185, 80, 0.07)`, `borderLeft: 2px solid rgba(63, 185, 80, 0.3)`
- Remove: `background: rgba(248, 81, 73, 0.07)`, `borderLeft: 2px solid rgba(248, 81, 73, 0.3)`

Line numbers: `color: rgba(255, 255, 255, 0.15)`

- [ ] **Step 2: Run lint + test**

Run: `pnpm --filter grove lint && pnpm --filter grove test`

- [ ] **Step 3: Commit**

```
style(grove): apply redesign tokens to diff view
```

---

### Task 6: Cleanup and integration

**Files:**
- Delete or simplify: `src/hooks/useFileSelection.ts` (remove linear drag, keep only for CommitChangesView if needed)
- All modified files

- [ ] **Step 1: Clean up `useFileSelection`**

Remove the `useEffect` that clears on items change (polling bug). Remove `handleMouseDown`, `handleMouseEnter`, `handleMouseUp` (marquee replaces drag). Keep `handleClick` for shift+click in CommitChangesView if needed, or remove entirely if CommitChangesView uses its own simple selection.

- [ ] **Step 2: Run full test suite**

Run: `pnpm --filter grove lint && pnpm --filter grove test`
Expected: All pass

- [ ] **Step 3: Commit**

```
refactor(grove): cleanup file selection and remove dead code
```
