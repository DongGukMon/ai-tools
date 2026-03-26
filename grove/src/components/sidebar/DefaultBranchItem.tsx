import { useState } from "react";
import { GitBranch, Loader2, RotateCw } from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { cn } from "../../lib/cn";
import { useSidebarLeafActivation } from "../../hooks/useSidebarLeafActivation";
import { AiStatusIcons } from "./WorktreeItem";
import SidebarLeafItem from "./SidebarLeafItem";
import { useAiWorktreeSessions, useWorktreeBell } from "./worktree-status";

interface Props {
  project: Project;
}

function DefaultBranchItem({ project }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const { selectedWorktree, selectWorktree, refreshProject } =
    useProjectStore();
  const { toast } = useToast();

  const sourceWorktree = {
    name: "source",
    path: project.sourcePath,
    branch: "main",
  };
  const isSelected = selectedWorktree?.path === project.sourcePath;
  const hasBell = useWorktreeBell(project.sourcePath);
  const aiSessions = useAiWorktreeSessions(project.sourcePath);
  const handleActivate = useSidebarLeafActivation({
    disabled: refreshing,
    isSelected,
    onSelect: () => selectWorktree(sourceWorktree),
  });

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      await refreshProject(project.id);
      toast("success", `Project '${project.repo}' source synced`);
    } catch {
      // Toasts are handled by the command layer.
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SidebarLeafItem
      icon={(
        <GitBranch className={cn("h-[13px] w-[13px] shrink-0", {
          "text-orange-500": hasBell,
        })} />
      )}
      label="main"
      title={project.sourcePath}
      isSelected={isSelected}
      disabled={refreshing}
      onActivate={handleActivate}
      status={<AiStatusIcons sessions={aiSessions} />}
      action={refreshing ? (
        <Loader2 className={cn("h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground")} />
      ) : (
        <button
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded-sm transition-colors",
            {
              "opacity-30 cursor-not-allowed": project.sourceHasChanges,
              "opacity-100 text-accent hover:text-foreground":
                !project.sourceHasChanges && project.sourceBehindRemote,
              "opacity-50 hover:opacity-100 hover:text-foreground":
                !project.sourceHasChanges &&
                !project.sourceBehindRemote &&
                isSelected,
              "opacity-0 group-hover:opacity-100 hover:text-foreground":
                !project.sourceHasChanges &&
                !project.sourceBehindRemote &&
                !isSelected,
            },
          )}
          onClick={handleRefresh}
          disabled={project.sourceHasChanges}
          title={
            project.sourceHasChanges
              ? "Commit or stash working changes before syncing"
              : "Sync source repo"
          }
        >
          <RotateCw className={cn("h-3 w-3")} />
        </button>
      )}
    />
  );
}

export default DefaultBranchItem;
