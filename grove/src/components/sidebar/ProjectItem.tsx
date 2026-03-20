import { memo, useState } from "react";
import {
  X,
  GitFork,
  GitBranch,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { overlay } from "../../lib/overlay";
import DefaultBranchItem from "./DefaultBranchItem";
import WorktreeItem from "./WorktreeItem";
import { Button, IconButton } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { cn } from "../../lib/cn";
import { sanitizeBranchName } from "../../lib/git-utils";

interface Props {
  project: Project;
}

const ProjectItem = memo(function ProjectItem({ project }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);
  const [worktreeName, setWorktreeName] = useState("");
  const { addWorktree, removeProject } = useProjectStore();
  const { toast } = useToast();

  const handleAddWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = worktreeName.trim();
    if (!name) return;
    setAddingLoading(true);
    try {
      await addWorktree(project.id, name);
      toast("success", `Worktree '${name}' created`);
      setWorktreeName("");
      setAdding(false);
    } catch {
      // Toasts are handled by the command layer.
    } finally {
      setAddingLoading(false);
    }
  };

  const handleRemoveProject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await overlay.open<boolean>(({ resolve, close }) => (
      <Dialog open onClose={close} title="Remove project?" className="max-w-sm">
        <div className="space-y-4">
          <p className={cn("text-sm leading-relaxed text-muted-foreground")}>
            <span className={cn("font-semibold text-foreground")}>
              {project.org}/{project.repo}
            </span>{" "}
            project folder and all worktrees will be deleted.
          </p>
          <p className={cn("text-xs leading-relaxed text-muted-foreground/70")}>
            This removes the hidden source repository too. Use sync source if
            you only want to reset the source repo to the remote default
            branch.
          </p>
          <div className={cn("flex justify-end gap-2")}>
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => resolve(true)}
            >
              Delete project
            </Button>
          </div>
        </div>
      </Dialog>
    ));

    if (!confirmed) return;

    try {
      await removeProject(project.id);
      toast("success", `Project '${project.repo}' removed`);
    } catch {
      // Toasts are handled by the command layer.
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="px-2">
      {/* Project header */}
      <div
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground hover:bg-secondary/50 transition-colors cursor-pointer select-none",
        )}
        onClick={() => setExpanded(!expanded)}
        {...attributes}
        {...listeners}
      >
        <GitFork className={cn("h-[15px] w-[15px] shrink-0", {
          "text-accent": expanded,
          "text-muted-foreground": !expanded,
        })} />
        <span className={cn("truncate font-medium")}>
          {project.org}/{project.repo}
        </span>
        <div className={cn("ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity")}>
          <IconButton
            onClick={handleRemoveProject}
            title="Remove project"
          >
            <X className={cn("h-[13px] w-[13px]")} />
          </IconButton>
        </div>
      </div>

      {/* Worktree list */}
      <div className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        { "grid-rows-[1fr]": expanded, "grid-rows-[0fr]": !expanded },
      )}>
        <div className={cn("overflow-hidden")}>
        <div className={cn("ml-3 border-l border-border pl-2")}>
          <DefaultBranchItem project={project} />
          {/* Phase 2: 드래그 재정렬 — <WorktreeItem>을 드래그 가능하게 만들고,
              드래그 완료 시 setWorktreeOrder(project.id, newOrder) 호출.
              react-dnd 또는 @dnd-kit/sortable 권장. */}
          {project.worktrees.map((wt) => (
            <WorktreeItem
              key={wt.path}
              worktree={wt}
              projectId={project.id}
            />
          ))}
          {adding ? (
            <form onSubmit={handleAddWorktree}>
              <div className={cn("relative flex items-center gap-2 rounded-md px-2 py-1")}>
                <GitBranch className={cn("h-[13px] w-[13px] shrink-0 text-muted-foreground")} />
                <input
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none",
                    "placeholder:text-muted-foreground/50 disabled:opacity-50",
                  )}
                  type="text"
                  placeholder="branch name"
                  value={worktreeName}
                  onChange={(e) => setWorktreeName(sanitizeBranchName(e.target.value))}
                  autoFocus
                  disabled={addingLoading}
                  onBlur={() => {
                    if (!worktreeName.trim() && !addingLoading) setAdding(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && !addingLoading) setAdding(false);
                  }}
                />
                {addingLoading && (
                  <span className={cn("text-xs text-muted-foreground animate-pulse shrink-0")}>
                    Creating...
                  </span>
                )}
              </div>
            </form>
          ) : (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors",
                "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
              onClick={() => setAdding(true)}
            >
              <span>Add worktree</span>
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
});

export default ProjectItem;
