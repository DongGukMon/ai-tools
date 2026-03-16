import { useState } from "react";
import { GitBranch, Loader2, RotateCw } from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { cn } from "../../lib/cn";

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
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer select-none",
        {
          "pointer-events-none opacity-50": refreshing,
          "bg-selected text-foreground": isSelected && !refreshing,
          "text-muted-foreground hover:bg-secondary/50 hover:text-foreground":
            !isSelected && !refreshing,
        },
      )}
      onClick={() => !refreshing && selectWorktree(sourceWorktree)}
      title={project.sourcePath}
    >
      <GitBranch className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">main</span>
      {refreshing ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <button
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded-sm transition-colors",
            {
              "opacity-100 text-accent hover:text-foreground":
                project.sourceDirty,
              "opacity-50 hover:opacity-100 hover:text-foreground":
                !project.sourceDirty && isSelected,
              "opacity-0 group-hover:opacity-100 hover:text-foreground":
                !project.sourceDirty && !isSelected,
            },
          )}
          onClick={handleRefresh}
          title="Sync source repo"
        >
          <RotateCw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default DefaultBranchItem;
