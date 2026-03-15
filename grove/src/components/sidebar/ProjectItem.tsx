import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { cn } from "../../lib/cn";
import WorktreeItem from "./WorktreeItem";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";

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

  const { selectedWorktree, addWorktree, removeProject, refreshProject } =
    useProjectStore();
  const { toast } = useToast();
  const hasSelectedWorktree = project.worktrees.some(
    (worktree) => worktree.path === selectedWorktree?.path,
  );

  useEffect(() => {
    if (hasSelectedWorktree) {
      setExpanded(true);
    }
  }, [hasSelectedWorktree]);

  const handleAddWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = worktreeName.trim();
    if (!name) {
      return;
    }

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

  const handleRemoveProject = (e: React.MouseEvent) => {
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

  const handleToggle = () => {
    setExpanded((value) => !value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[24px] border bg-white/80 shadow-sm backdrop-blur-sm transition-[border-color,box-shadow]",
        {
          "border-[var(--color-primary-border)] shadow-[0_10px_24px_-18px_oklch(0.55_0.18_145_/_0.55)]":
            hasSelectedWorktree,
          "border-white/80": !hasSelectedWorktree,
        },
      )}
    >
      <div className={cn("flex items-start gap-3 px-3 py-3")}>
        <div
          className={cn("flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-[20px] px-1 py-1 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25")}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[18px] border shadow-inner transition-colors",
              {
                "border-[var(--color-primary-border)] bg-[var(--color-primary-light)] text-[var(--color-primary)]":
                  expanded || hasSelectedWorktree,
                "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]":
                  !expanded && !hasSelectedWorktree,
              },
            )}
          >
            {expanded ? (
              <ChevronDown className={cn("size-4")} strokeWidth={2.25} />
            ) : (
              <ChevronRight className={cn("size-4")} strokeWidth={2.25} />
            )}
          </div>

          <div className={cn("min-w-0 flex-1")}>
            <div className={cn("flex items-center gap-2")}>
              <span className={cn("truncate text-[13px] font-semibold text-[var(--color-text)]")}>
                {project.repo}
              </span>
              <Badge
                variant={hasSelectedWorktree ? "success" : "secondary"}
                className={cn("rounded-full border-0 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.12em]")}
              >
                {project.worktrees.length}
              </Badge>
            </div>
            <div className={cn("mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]")}>
              <Folder className={cn("size-3.5 shrink-0")} strokeWidth={2.2} />
              <span className={cn("truncate")}>{project.org}</span>
            </div>
          </div>
        </div>

        <div className={cn("flex items-center gap-1")}>
          <ActionButton
            title="Refresh project source"
            onClick={handleRefreshProject}
            disabled={refreshing || deleting}
          >
            {refreshing ? (
              <Spinner className={cn("size-3.5")} />
            ) : (
              <RotateCw className={cn("size-3.5")} strokeWidth={2.15} />
            )}
          </ActionButton>
          <ActionButton
            title="Remove project"
            onClick={handleRemoveProject}
            disabled={refreshing}
            destructive
          >
            <X className={cn("size-3.5")} strokeWidth={2.15} />
          </ActionButton>
        </div>
      </div>

      {expanded && (
        <div className={cn("px-3 pb-3")}>
          <Separator className={cn("mb-3 bg-[var(--color-border-light)]")} />

          <div className={cn("mb-2 flex items-center justify-between px-1")}>
            <span className={cn("text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]")}>
              Worktrees
            </span>
            {!adding && (
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 rounded-full px-2.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-primary)]")}
                onClick={() => setAdding(true)}
              >
                <Plus className={cn("size-3.5")} strokeWidth={2.25} />
                Add
              </Button>
            )}
          </div>

          <div className={cn("space-y-2")}>
            {project.worktrees.length === 0 && !adding && (
              <div className={cn("rounded-[20px] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-4 text-center")}>
                <p className={cn("text-[12px] font-medium text-[var(--color-text)]")}>
                  No worktrees yet
                </p>
                <p className={cn("mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]")}>
                  Create a branch worktree to start working from this source clone.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("mt-3 rounded-full border-[var(--color-primary-border)] bg-white px-3 text-[12px] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]")}
                  onClick={() => setAdding(true)}
                >
                  <Plus className={cn("size-3.5")} strokeWidth={2.25} />
                  Add worktree
                </Button>
              </div>
            )}

            {project.worktrees.map((worktree) => (
              <WorktreeItem
                key={worktree.path}
                worktree={worktree}
                projectId={project.id}
              />
            ))}

            {adding && (
              <form
                onSubmit={handleAddWorktree}
                className={cn("rounded-[20px] border border-[var(--color-primary-border)] bg-[linear-gradient(180deg,white,oklch(0.975_0.01_145))] p-3 shadow-sm")}
              >
                <label
                  htmlFor={`new-worktree-${project.id}`}
                  className={cn("mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]")}
                >
                  New worktree
                </label>
                <Input
                  id={`new-worktree-${project.id}`}
                  type="text"
                  placeholder="branch name"
                  value={worktreeName}
                  onChange={(e) => setWorktreeName(e.target.value)}
                  autoFocus
                  disabled={addingLoading}
                  className={cn("h-10 rounded-[18px] border-[var(--color-primary-border)] bg-white px-3 text-[13px] shadow-none")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && !addingLoading) {
                      setAdding(false);
                      setWorktreeName("");
                    }
                  }}
                />

                <p className={cn("mt-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]")}>
                  Grove creates a matching branch-named worktree from the shared source repo.
                </p>

                <div className={cn("mt-3 flex items-center justify-end gap-2")}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAdding(false);
                      setWorktreeName("");
                    }}
                    disabled={addingLoading}
                    className={cn("rounded-full border-[var(--color-border)] bg-white px-3 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    disabled={addingLoading || !worktreeName.trim()}
                    className={cn("rounded-full px-3 text-[12px] shadow-sm")}
                  >
                    {addingLoading ? (
                      <Spinner className={cn("size-3.5")} />
                    ) : (
                      <Plus className={cn("size-3.5")} strokeWidth={2.25} />
                    )}
                    {addingLoading ? "Creating..." : "Create worktree"}
                  </Button>
                </div>
              </form>
            )}
          </div>
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
        className={cn(
          "max-w-sm rounded-[28px] border-0 bg-white p-0 shadow-[0_24px_70px_-24px_oklch(0.15_0_0_/_0.24)]",
        )}
      >
        <div className={cn("space-y-4")}>
          <p className={cn("text-[13px] leading-relaxed text-[var(--color-text-secondary)]")}>
            Refresh will hard-sync the hidden source repo for{" "}
            <span className={cn("font-semibold text-[var(--color-text)]")}>
              {project.org}/{project.repo}
            </span>
            .
          </p>
          <p className={cn("text-[12px] leading-relaxed text-[var(--color-text-tertiary)]")}>
            Local changes and untracked files inside the internal source repo will
            be removed. Your visible worktrees are not deleted.
          </p>
          <div className={cn("flex justify-end gap-2")}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingRefresh(false)}
              disabled={refreshing}
              className={cn("rounded-full")}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={confirmRefreshProject}
              disabled={refreshing}
              className={cn("rounded-full")}
            >
              {refreshing ? <Spinner className={cn("size-3.5")} /> : null}
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
        className={cn(
          "max-w-sm rounded-[28px] border-0 bg-white p-0 shadow-[0_24px_70px_-24px_oklch(0.15_0_0_/_0.24)]",
        )}
      >
        <div className={cn("space-y-4")}>
          <p className={cn("text-[13px] leading-relaxed text-[var(--color-text-secondary)]")}>
            <span className={cn("font-semibold text-[var(--color-text)]")}>
              {project.org}/{project.repo}
            </span>{" "}
            and all associated worktrees will be deleted.
          </p>
          <p className={cn("text-[12px] leading-relaxed text-[var(--color-text-tertiary)]")}>
            This also removes the hidden source repository. Use refresh if you only
            need to sync the project contents.
          </p>
          <div className={cn("flex justify-end gap-2")}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className={cn("rounded-full")}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmRemoveProject}
              disabled={deleting}
              className={cn("rounded-full")}
            >
              {deleting ? <Spinner className={cn("size-3.5")} /> : null}
              {deleting ? "Removing..." : "Delete project"}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

interface ActionButtonProps {
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}

function ActionButton({
  children,
  destructive = false,
  disabled = false,
  onClick,
  title,
}: ActionButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn(
        "rounded-full border border-transparent bg-transparent text-[var(--color-text-tertiary)] hover:bg-white",
        {
          "hover:border-[var(--color-primary-border)] hover:text-[var(--color-primary)]":
            !destructive,
          "hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]":
            destructive,
        },
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

export default ProjectItem;
