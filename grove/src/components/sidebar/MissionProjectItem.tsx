import { FolderGit2, X } from "lucide-react";
import type { MissionProject } from "../../types";
import { useMissionStore } from "../../store/mission";
import { useProjectStore } from "../../store/project";
import { useTerminalStore } from "../../store/terminal";
import { cn } from "../../lib/cn";

interface Props {
  missionId: string;
  project: MissionProject;
}

function MissionProjectItem({ missionId, project }: Props) {
  const selectedItem = useMissionStore((s) => s.selectedItem);
  const selectItem = useMissionStore((s) => s.selectItem);
  const removeProject = useMissionStore((s) => s.removeProject);
  const projects = useProjectStore((s) => s.projects);

  const isSelected =
    selectedItem?.missionId === missionId &&
    selectedItem?.projectId === project.projectId;

  const projectData = projects.find((p) => p.id === project.projectId);
  const displayName = projectData
    ? `${projectData.org}/${projectData.repo}`
    : project.branch;

  const handleClick = () => {
    selectItem(missionId, project.projectId);
    useTerminalStore.getState().setActiveWorktree(project.path);
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Remove "${displayName}" from this mission?`,
    );
    if (!confirmed) return;
    await removeProject(missionId, project.projectId);
  };

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-all duration-150 cursor-pointer select-none",
        {
          "bg-selected text-foreground": isSelected,
          "text-muted-foreground hover:bg-secondary/50 hover:text-foreground":
            !isSelected,
        },
      )}
      onClick={handleClick}
      title={project.path}
    >
      <FolderGit2 className={cn("h-[13px] w-[13px] shrink-0")} />
      <span className={cn("min-w-0 flex-1 truncate")}>{displayName}</span>
      <button
        className={cn(
          "h-4 w-4 cursor-pointer items-center justify-center rounded-sm transition-colors",
          {
            "flex opacity-50 hover:opacity-100 hover:text-foreground": isSelected,
            "hidden group-hover:flex hover:text-foreground": !isSelected,
          },
        )}
        onClick={handleRemove}
        title="Remove from mission"
      >
        <X className={cn("h-3 w-3")} />
      </button>
    </div>
  );
}

export default MissionProjectItem;
