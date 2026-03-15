import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  GitFork,
  RotateCw,
} from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import WorktreeItem from "./WorktreeItem";
import { Button } from "../ui/button";
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

  const handleRefreshProject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingRefresh(true);
  };

  const confirmRefreshProject = async () => {
    setRefreshing(true);
    try {
      await refreshProject(project.id);
      toast("success", `Project '${project.repo}' refreshed`);
      setConfirmingRefresh(false);
    } catch {
      // Toasts are handled by the command layer.
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="mb-1">
      {/* Project header */}
      <div
        className="group flex items-center gap-2 px-2 h-[34px] rounded-lg cursor-pointer select-none hover:bg-white/80 transition-all duration-100"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center justify-center w-4 shrink-0 text-[#9ca3af]">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <GitFork size={14} className={cn("shrink-0", expanded ? "text-[var(--color-primary)]" : "text-[#9ca3af]")} />
        <span className="min-w-0 flex-1 text-[13px] truncate font-semibold text-[#374151]">
          {project.org}/{project.repo}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="w-[20px] h-[20px] rounded-md opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-[var(--color-primary)] hover:bg-white"
          onClick={handleRefreshProject}
          title="Refresh project source"
          disabled={refreshing || deleting}
        >
          <RotateCw
            size={12}
            strokeWidth={2}
            className={cn(refreshing && "animate-spin")}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-[20px] h-[20px] rounded-md opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
          onClick={handleRemoveProject}
          title="Remove project"
          disabled={refreshing}
        >
          <X size={12} strokeWidth={2} />
        </Button>
      </div>

      {/* Worktree list */}
      {expanded && (
        <div className="ml-5 mr-1 mt-0.5 space-y-0.5">
          {project.worktrees.map((wt) => (
            <WorktreeItem
              key={wt.path}
              worktree={wt}
              projectId={project.id}
            />
          ))}
          {adding ? (
            <div>
              <form onSubmit={handleAddWorktree} className="px-1 py-1">
                <div className="relative">
                  <input
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--color-primary)] bg-white text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary-bg)] shadow-sm transition-all disabled:opacity-50"
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
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                      <span className="text-[11px] text-[var(--color-text-muted)] animate-pulse">
                        Creating worktree...
                      </span>
                    </div>
                  )}
                </div>
              </form>
              {addingLoading && (
                <div className="flex items-center gap-2 px-2.5 h-[30px]">
                  <div className="skeleton w-3 h-3 rounded-full shrink-0" />
                  <div className="skeleton flex-1 h-3" />
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-[#9ca3af] hover:text-[var(--color-primary)] rounded-lg hover:bg-white/80"
              onClick={() => setAdding(true)}
            >
              <Plus size={12} strokeWidth={2} />
              <span>Add worktree</span>
            </Button>
          )}
        </div>
      )}
      <Dialog
        open={confirmingRefresh}
        onClose={() => {
          if (!refreshing) {
            setConfirmingRefresh(false);
          }
        }}
        title="Refresh project source?"
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            Refresh will hard-sync the hidden source repo for{" "}
            <span className="font-semibold text-[var(--color-text)]">
              {project.org}/{project.repo}
            </span>
            .
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
            Local changes and untracked files inside the internal source repo will
            be removed. Your visible worktrees are not deleted.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingRefresh(false)}
              disabled={refreshing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={confirmRefreshProject}
              disabled={refreshing}
              className={cn(refreshing && "animate-pulse-subtle")}
            >
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
          <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text)]">
              {project.org}/{project.repo}
            </span>{" "}
            project folder and all worktrees will be deleted.
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">
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
              className={cn(deleting && "animate-pulse-subtle")}
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
