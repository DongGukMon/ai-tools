import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import { usePanelLayoutStore } from "../../store/panel-layout";
import type { FileStatus } from "../../types";
import { cn } from "../../lib/cn";
import ResizablePanelGroup from "../ui/resizable-panel-group";
import CommitList from "./CommitList";
import FileList from "./FileList";
import DiffViewer from "./DiffViewer";

export default function DiffPanel() {
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const store = useDiff(selectedWorktree?.path ?? null);
  const diffSizes = usePanelLayoutStore((s) => s.diff);
  const updateDiff = usePanelLayoutStore((s) => s.updateDiff);

  if (!selectedWorktree) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-sidebar")}>
        <span className={cn("text-sm text-muted-foreground")}>
          Select a worktree to view changes
        </span>
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className={cn("flex flex-col h-full overflow-hidden bg-sidebar")}
      vertical
      ratios={diffSizes}
      onCommit={updateDiff}
    >
      <ResizablePanelGroup.Pane minSize={80}>
        <CommitList
          commits={store.commits}
          changeCount={store.fileStatuses.length}
          selectedView={store.selectedView}
          onSelectView={store.selectView}
          behindCount={store.behindCount}
          merging={store.merging}
          onMerge={store.mergeDefaultBranch}
        />
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={60}>
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
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane minSize={100}>
        <DiffViewer
          diff={store.currentDiff}
          selectedFile={store.selectedFile}
        />
      </ResizablePanelGroup.Pane>
    </ResizablePanelGroup>
  );
}
