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
      <div className="flex items-center justify-center h-full border-l border-[var(--color-border)] bg-[var(--color-bg)]">
        <span className="text-[13px] text-[var(--color-text-tertiary)]">
          Select a worktree to view changes
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-bg)]">
      <CommitList
        commits={store.commits}
        fileStatuses={store.fileStatuses}
        selectedView={store.selectedView}
        onSelectView={store.selectView}
      />
      {store.selectedView === "changes" ? (
        <FileList
          fileStatuses={store.fileStatuses}
          selectedFile={store.selectedFile}
          isViewingStaged={store.isViewingStaged}
          onSelectFile={store.selectFile}
          onStageFile={store.stageFile}
          onUnstageFile={store.unstageFile}
          onDiscardFile={store.discardFile}
        />
      ) : (
        // Commit file list
        store.commitDiffs.length > 0 && (
          <div className="border-b border-[var(--color-border)] shrink-0 max-h-[200px] overflow-y-auto">
            <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-text-tertiary)] px-3 pt-2.5 pb-1 select-none">
              Files ({store.commitDiffs.length})
            </div>
            {store.commitDiffs.map((d) => {
              const isSelected = store.selectedFile === d.path;
              return (
                <div
                  key={d.path}
                  className={`flex items-center gap-2 px-3 h-[28px] cursor-pointer text-[12px] select-none transition-colors duration-100 ${
                    isSelected
                      ? "bg-[var(--color-primary-light)] border-l-[3px] border-l-[var(--color-primary)]"
                      : "hover:bg-[var(--color-bg-tertiary)] border-l-[3px] border-l-transparent"
                  }`}
                  onClick={() => store.selectFile(d.path)}
                >
                  <span
                    className="font-mono font-semibold text-[11px] w-3.5 text-center shrink-0"
                    style={{
                      color:
                        d.status === "added"
                          ? "var(--color-success)"
                          : d.status === "deleted"
                            ? "var(--color-danger)"
                            : "var(--color-warning)",
                    }}
                  >
                    {d.status[0].toUpperCase()}
                  </span>
                  <span className={`truncate ${isSelected ? "text-[var(--color-text)] font-medium" : "text-[var(--color-text)]"}`}>
                    {d.path}
                  </span>
                </div>
              );
            })}
          </div>
        )
      )}
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
