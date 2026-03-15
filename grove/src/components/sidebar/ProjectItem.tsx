import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  X,
  GitFork,
  GitBranch,
  RotateCw,
} from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import WorktreeItem from "./WorktreeItem";
import { Button, IconButton } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { cn } from "../../lib/cn";

interface Props {
  project: Project;
}

function ProjectItem({ project }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingRefresh, setConfirmingRefresh] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [worktreeName, setWorktreeName] = useState("");
  const { addWorktree, removeProject, refreshProject } = useProjectStore();
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
    setConfirmingDelete(true);
  };

  const confirmRemoveProject = async () => {
    setDeleting(true);
    try {
      await removeProject(project.id);
      toast("success", `Project '${project.repo}' removed`);
      setConfirmingDelete(false);
    } catch {
      // Toasts are handled by the command layer.
    } finally {
      setDeleting(false);
    }
  };

  const handleRefreshProject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingRefresh(true);
  };

  const confirmRefreshProject = async () => {
    setConfirmingRefresh(false);
    setRefreshing(true);
    try {
      await refreshProject(project.id);
      toast("success", `Project '${project.repo}' refreshed`);
    } catch {
      // Toasts are handled by the command layer.
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="px-2">
      {/* Project header */}
      <div
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-secondary/50 transition-colors cursor-pointer select-none",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <GitFork className={cn("h-4 w-4 shrink-0", {
          "text-accent": expanded,
          "text-muted-foreground": !expanded,
        })} />
        <span className="truncate font-medium">
          {project.org}/{project.repo}
        </span>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {project.sourceDirty && (
            <IconButton
              onClick={handleRefreshProject}
              title="Refresh project source"
              disabled={refreshing || deleting}
            >
              <RotateCw
                className={cn("h-4 w-4", { "animate-spin": refreshing })}
              />
            </IconButton>
          )}
          <IconButton
            onClick={handleRemoveProject}
            title="Remove project"
            disabled={refreshing}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Worktree list */}
      {expanded && (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-3">
          {project.worktrees.map((wt) => (
            <WorktreeItem
              key={wt.path}
              worktree={wt}
              projectId={project.id}
            />
          ))}
          {adding ? (
            <form onSubmit={handleAddWorktree}>
              <div className="relative flex items-center gap-2 rounded-md px-2 py-1">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none",
                    "placeholder:text-muted-foreground/50 disabled:opacity-50",
                  )}
                  type="text"
                  placeholder="branch name"
                  value={worktreeName}
                  onChange={(e) => setWorktreeName(e.target.value)}
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
                  <span className="text-xs text-muted-foreground animate-pulse shrink-0">
                    Creating...
                  </span>
                )}
              </div>
            </form>
          ) : (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
              onClick={() => setAdding(true)}
            >
              <span>Add worktree</span>
            </button>
          )}
        </div>
      )}
      <Dialog
        open={confirmingRefresh}
        onClose={() => { if (!refreshing) setConfirmingRefresh(false); }}
        title="Refresh project source?"
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This will hard-sync the source repo for{" "}
            <span className="font-semibold text-foreground">
              {project.org}/{project.repo}
            </span>
            . Local changes will be removed.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmingRefresh(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmRefreshProject} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={confirmingDelete}
        onClose={() => {
          if (!deleting) {
            setConfirmingDelete(false);
          }
        }}
        title="Remove project?"
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {project.org}/{project.repo}
            </span>{" "}
            project folder and all worktrees will be deleted.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground/70">
            This removes the hidden source repository too. Use refresh if you only
            want to sync the project.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmRemoveProject}
              disabled={deleting}
              className={cn({ "animate-pulse-subtle": deleting })}
            >
              {deleting ? "Removing..." : "Delete project"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default ProjectItem;
