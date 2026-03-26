import { useCallback } from "react";
import { useProjectStore } from "../../store/project";
import { useDiff } from "../../hooks/useDiff";
import { useTabStore } from "../../store/tab";
import { cn } from "../../lib/cn";
import CommitList from "./CommitList";
import type { CommitInfo } from "../../types";

export default function CommitHistoryPanel() {
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const store = useDiff(selectedWorktree?.path ?? null);
  const addTab = useTabStore((s) => s.addTab);

  const handleSelectView = useCallback(
    (view: "changes" | CommitInfo) => {
      store.selectView(view);
      addTab("changes", "Changes");
    },
    [store.selectView, addTab],
  );

  if (!selectedWorktree) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-sidebar")}>
        <span className={cn("text-sm text-muted-foreground")}>
          Select a worktree
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-sidebar")}>
      <CommitList
        commits={store.commits}
        changeCount={store.fileStatuses.length}
        selectedView={store.selectedView}
        onSelectView={handleSelectView}
        behindCount={store.behindCount}
        merging={store.merging}
        onMerge={store.mergeDefaultBranch}
      />
    </div>
  );
}
