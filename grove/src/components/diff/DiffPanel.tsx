import { useRef, useCallback } from "react";
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
  const { diff: diffSizes, updateDiff } = usePanelLayoutStore();
  const dragging = useRef(false);

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (dragging.current && sizes.length > 0) {
        updateDiff(sizes);
      }
    },
    [updateDiff],
  );

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
    <div className="flex flex-col h-full overflow-hidden bg-sidebar">
      <Allotment
        vertical
        defaultSizes={diffSizes.map((r) => r * 1000)}
        onDragStart={() => { dragging.current = true; }}
        onDragEnd={() => { dragging.current = false; }}
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
