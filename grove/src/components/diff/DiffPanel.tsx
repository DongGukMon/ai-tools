import { useEffect, useRef, useCallback } from "react";
import type { MouseEvent } from "react";
import { Allotment } from "allotment";
import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import { usePanelLayoutStore } from "../../store/panel-layout";
import type { FileStatus } from "../../types";
import CommitList from "./CommitList";
import FileList from "./FileList";
import DiffViewer from "./DiffViewer";

export default function DiffPanel() {
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const store = useDiff(selectedWorktree?.path ?? null);
  const diffSizes = usePanelLayoutStore((s) => s.diff);
  const updateDiff = usePanelLayoutStore((s) => s.updateDiff);
  const dragging = useRef(false);
  const pendingSizesRef = useRef<number[] | null>(null);
  const resetPendingRef = useRef(false);
  const resetClearTimerRef = useRef<number | null>(null);

  const clearResetPending = useCallback(() => {
    if (resetClearTimerRef.current !== null) {
      window.clearTimeout(resetClearTimerRef.current);
      resetClearTimerRef.current = null;
    }
    resetPendingRef.current = false;
  }, []);

  useEffect(() => clearResetPending, [clearResetPending]);

  const handleDragStart = useCallback(() => {
    dragging.current = true;
    pendingSizesRef.current = null;
    clearResetPending();
  }, [clearResetPending]);

  const handleSashDoubleClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-testid='sash']")) {
        return;
      }

      clearResetPending();
      resetPendingRef.current = true;
      resetClearTimerRef.current = window.setTimeout(() => {
        resetPendingRef.current = false;
        resetClearTimerRef.current = null;
      }, 0);
    },
    [clearResetPending],
  );

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length === 0) return;

      if (dragging.current) {
        pendingSizesRef.current = sizes.slice();
        return;
      }

      if (!resetPendingRef.current) {
        return;
      }

      clearResetPending();
      updateDiff(sizes);
    },
    [clearResetPending, updateDiff],
  );

  const handleDragEnd = useCallback((sizes: number[]) => {
    dragging.current = false;

    const finalSizes = sizes.length > 0 ? sizes : pendingSizesRef.current;
    pendingSizesRef.current = null;
    if (finalSizes && finalSizes.length > 0) {
      updateDiff(finalSizes);
    }
    clearResetPending();
  }, [clearResetPending, updateDiff]);

  if (!selectedWorktree) {
    return (
      <div className="flex items-center justify-center h-full bg-sidebar">
        <span className="text-sm text-muted-foreground">
          Select a worktree to view changes
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-sidebar"
      onDoubleClickCapture={handleSashDoubleClickCapture}
    >
      <Allotment
        vertical
        defaultSizes={diffSizes.map((r) => r * 1000)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onChange={handleChange}
      >
        <Allotment.Pane minSize={80}>
          <CommitList
            commits={store.commits}
            changeCount={store.fileStatuses.length}
            selectedView={store.selectedView}
            onSelectView={store.selectView}
            behindCount={store.behindCount}
            merging={store.merging}
            onMerge={store.mergeDefaultBranch}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={60}>
          <FileList
            fileStatuses={
              store.selectedView === "changes"
                ? store.fileStatuses
                : store.commitDiffs.map((d) => ({
                    path: d.path,
                    status: d.status as FileStatus["status"],
                    staged: false,
                  }))
            }
            selectedFile={store.selectedFile}
            onSelectFile={store.selectFile}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={100}>
          <DiffViewer
            diff={store.currentDiff}
            selectedFile={store.selectedFile}
          />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}
