import { Command, FolderGit2, GitBranch } from "lucide-react";
import { cn } from "../../lib/cn";
import { useProjectStore } from "../../store/project";
import { Badge } from "../ui/badge";

export function TitleBar() {
  const projects = useProjectStore((s) => s.projects);
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);

  const selectedProject = selectedWorktree
    ? projects.find((project) =>
        project.worktrees.some((worktree) => worktree.path === selectedWorktree.path),
      ) ?? null
    : null;

  const totalWorktrees = projects.reduce(
    (count, project) => count + project.worktrees.length,
    0,
  );

  const contextLabel = selectedProject
    ? `${selectedProject.org}/${selectedProject.repo}`
    : projects.length > 0
      ? "Select a worktree"
      : "No repository selected";

  const detailLabel = selectedWorktree
    ? selectedWorktree.branch
    : projects.length > 0
      ? "Choose a worktree in the sidebar"
      : "Add your first repository to begin";

  return (
    <div
      className={cn(
        "flex h-14 items-center gap-3 border-b border-[var(--color-border-light)] bg-white/75 px-4 backdrop-blur-sm",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-4")}>
        <div className={cn("flex items-center gap-2")} aria-hidden="true">
          {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
            <span
              key={color}
              className={cn(
                "h-3 w-3 rounded-full border border-black/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        <div className={cn("flex min-w-0 items-center gap-3")}>
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-[0_8px_20px_rgba(52,135,73,0.16)]",
            )}
          >
            <Command className={cn("h-4 w-4")} />
          </div>

          <div className={cn("min-w-0")}>
            <div className={cn("text-[13px] font-semibold text-[var(--color-text)]")}>
              Grove
            </div>
            <div
              className={cn(
                "truncate text-[11px] text-[var(--color-text-secondary)]",
              )}
            >
              Git project manager
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "hidden min-w-0 flex-1 items-center justify-center px-4 md:flex",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 max-w-xl items-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 shadow-[0_1px_2px_oklch(0.15_0_0_/_0.04)]",
          )}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-success)]",
            )}
          />
          <span
            className={cn(
              "truncate text-[12px] font-medium text-[var(--color-text)]",
            )}
          >
            {contextLabel}
          </span>
          <span className={cn("shrink-0 text-[var(--color-text-muted)]")}>
            /
          </span>
          <span
            className={cn(
              "truncate text-[12px] text-[var(--color-text-secondary)]",
            )}
          >
            {detailLabel}
          </span>
        </div>
      </div>

      <div className={cn("ml-auto flex items-center gap-2")}>
        <Badge
          variant="secondary"
          className={cn(
            "hidden rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] shadow-[0_1px_2px_oklch(0.15_0_0_/_0.04)] sm:inline-flex",
          )}
        >
          <FolderGit2
            className={cn("h-3.5 w-3.5 text-[var(--color-primary)]")}
          />
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </Badge>

        <Badge
          variant="outline"
          className={cn(
            "rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] shadow-[0_1px_2px_oklch(0.15_0_0_/_0.04)]",
          )}
        >
          <GitBranch
            className={cn("h-3.5 w-3.5 text-[var(--color-primary)]")}
          />
          {totalWorktrees} worktree{totalWorktrees === 1 ? "" : "s"}
        </Badge>
      </div>
    </div>
  );
}
