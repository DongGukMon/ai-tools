import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import CommitList from "./CommitList";
import FileList from "./FileList";
import DiffViewer from "./DiffViewer";

export default function DiffPanel() {
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const store = useDiff(selectedWorktree?.path ?? null);

  if (!selectedWorktree) {
    return (
      <div className="diff-panel" style={styles.empty}>
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          Select a worktree to view changes
        </span>
      </div>
    );
  }

  return (
    <div className="diff-panel" style={styles.container}>
      <CommitList
        commits={store.commits}
        fileStatuses={store.fileStatuses}
        selectedView={store.selectedView}
        onSelectView={store.selectView}
      />
      {store.selectedView === "changes" && (
        <FileList
          fileStatuses={store.fileStatuses}
          selectedFile={store.selectedFile}
          isViewingStaged={store.isViewingStaged}
          onSelectFile={store.selectFile}
          onStageFile={store.stageFile}
          onUnstageFile={store.unstageFile}
          onDiscardFile={store.discardFile}
        />
      )}
      <DiffViewer
        diff={store.currentDiff}
        selectedFile={store.selectedFile}
        isViewingStaged={store.isViewingStaged}
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

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    overflow: "hidden",
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
};
