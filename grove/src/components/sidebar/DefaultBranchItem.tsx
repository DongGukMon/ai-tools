import { useRef, useState } from "react";
import { GitBranch, Loader2, RotateCw } from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { cn } from "../../lib/cn";
import { useSidebarLeafActivation } from "../../hooks/useSidebarLeafActivation";
import { AiStatusIcons } from "./WorktreeItem";
import SidebarLeafItem from "./SidebarLeafItem";
import { useAiWorktreeSessions, useWorktreeBell } from "./worktree-status";
import { BranchSelector } from "./BranchSelector";

interface Props {
  project: Project;
}

function DefaultBranchItem({ project }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const branchLabelRef = useRef<HTMLSpanElement>(null);
  const { selectedWorktree, selectWorktree, refreshProject, setBaseBranch } =
    useProjectStore();
  const { toast } = useToast();

  const displayBranch = project.resolvedDefaultBranch;
  const sourceWorktree = {
    name: "source",
    path: project.sourcePath,
    branch: displayBranch,
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

  const handleBranchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectorOpen(true);
  };

  const handleBranchSelect = async (branch: string | null) => {
    setSelectorOpen(false);
    try {
      await setBaseBranch(project.id, branch);
      toast(
        "success",
        branch
          ? `Base branch set to '${branch}'`
          : "Base branch reset to auto-detect",
      );
    } catch {
      // Toasts are handled by the command layer.
    }
  };

  return (
    <div>
      <SidebarLeafItem
        icon={
          <GitBranch
            className={cn("h-[13px] w-[13px] shrink-0", {
              "text-orange-500": hasBell,
            })}
          />
        }
        label={
          <span
            ref={branchLabelRef}
            className={cn("min-w-0 flex-1 truncate cursor-pointer", {
              "hover:underline": !refreshing,
            })}
            onClick={handleBranchClick}
            title="Click to change base branch"
          >
            {displayBranch}
            <span className={cn("ml-1 text-muted-foreground")}>(source)</span>
          </span>
        }
        title={project.sourcePath}
        isSelected={isSelected}
        disabled={refreshing}
        onActivate={handleActivate}
        status={<AiStatusIcons sessions={aiSessions} />}
        action={
          refreshing ? (
            <Loader2
              className={cn(
                "h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground",
              )}
            />
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
          )
        }
      />

      {selectorOpen && (
        <BranchSelector
          projectId={project.id}
          currentBranch={project.baseBranch}
          resolvedDefaultBranch={project.resolvedDefaultBranch}
          anchorRef={branchLabelRef}
          onSelect={handleBranchSelect}
          onClose={() => setSelectorOpen(false)}
        />
      )}
    </div>
  );
}

export default DefaultBranchItem;
