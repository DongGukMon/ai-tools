import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import type { FileStatus } from "../../types";
import CommitList from "./CommitList";
import FileList from "./FileList";
import DiffViewer from "./DiffViewer";

export default function DiffPanel() {
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const store = useDiff(selectedWorktree?.path ?? null);

  if (!selectedWorktree) {
    return (
      <div className="flex items-center justify-center h-full border-l border-border bg-sidebar">
        <span className="text-sm text-muted-foreground">
          Select a worktree to view changes
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-border bg-sidebar">
      <CommitList
        commits={store.commits}
        selectedView={store.selectedView}
        onSelectView={store.selectView}
      />
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
      <DiffViewer
        diff={store.currentDiff}
        selectedFile={store.selectedFile}
        isViewingStaged={store.isViewingStaged}
        readOnly={store.selectedView !== "changes"}
        selectedLines={store.selectedLines}
        onToggleLine={store.toggleLine}
        onClearSelection={store.clearSelection}
        onStageHunk={store.stageHunk}
        onUnstageHunk={store.unstageHunk}
        onDiscardHunk={store.discardHunk}
        onStageLines={store.stageLines}
        onUnstageLines={store.unstageLines}
        onDiscardLines={store.discardLines}
      />
    </div>
  );
}
