import { useState } from "react";
import { Plus } from "lucide-react";
import { useProject } from "../../hooks/useProject";
import { cn } from "../../lib/cn";
import AddProjectDialog from "./AddProjectDialog";
import ProjectTree from "./ProjectTree";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

function Sidebar() {
  const { projects, loading } = useProject();
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,247,249,0.98))]",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,_oklch(0.95_0.04_145)_0%,transparent_68%)] opacity-90")} />

      <div className={cn("relative shrink-0 border-b border-[var(--color-border)] px-3 pt-3 pb-4")}>
        <div className={cn("flex items-start justify-between gap-3")}>
          <div className={cn("min-w-0")}>
            <span className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]")}>
              Projects
            </span>
            <h2 className={cn("mt-1 text-[15px] font-semibold text-[var(--color-text)]")}>
              Workspace sources
            </h2>
            <p className={cn("mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]")}>
              Clone repositories once, then select and manage worktrees here.
            </p>
          </div>

          <div className={cn("flex items-center gap-2")}>
            {!loading && projects.length > 0 && (
              <Badge
                variant="secondary"
                className={cn("rounded-full border-0 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)] shadow-xs")}
              >
                {projects.length}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("rounded-full border border-white/80 bg-white/80 text-[var(--color-text-secondary)] shadow-xs hover:border-[var(--color-primary-border)] hover:bg-white hover:text-[var(--color-primary)]")}
              onClick={() => setShowAddDialog((value) => !value)}
              title="Add project"
            >
              <Plus className={cn("size-4")} strokeWidth={2.25} />
            </Button>
          </div>
        </div>

        {showAddDialog && (
          <div className={cn("mt-4")}>
            <AddProjectDialog onClose={() => setShowAddDialog(false)} />
          </div>
        )}
      </div>

      <div className={cn("relative flex-1 overflow-y-auto px-3 py-3")}>
        {loading ? (
          <LoadingSidebar />
        ) : projects.length === 0 ? (
          <EmptyState onAddProject={() => setShowAddDialog(true)} />
        ) : (
          <>
            <div className={cn("mb-3 flex items-center justify-between px-1")}>
              <span className={cn("text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]")}>
                Active repositories
              </span>
              <Badge
                variant="secondary"
                className={cn("rounded-full border-0 bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)] shadow-xs")}
              >
                {projects.length}
              </Badge>
            </div>
            <ProjectTree projects={projects} />
          </>
        )}
      </div>
    </aside>
  );
}

function LoadingSidebar() {
  return (
    <div className={cn("space-y-3 pb-4")}>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className={cn("rounded-[22px] border border-white/70 bg-white/75 p-3 shadow-sm backdrop-blur-sm")}
        >
          <div className={cn("flex items-start gap-3")}>
            <Skeleton className={cn("size-9 rounded-[18px]")} />
            <div className={cn("min-w-0 flex-1 space-y-2")}>
              <Skeleton className={cn("h-3.5 w-[62%] rounded-full")} />
              <Skeleton className={cn("h-3 w-[34%] rounded-full")} />
            </div>
          </div>

          <div className={cn("mt-3 space-y-2")}>
            {[1, 2].map((row) => (
              <div
                key={`${item}-${row}`}
                className={cn("flex items-center gap-2 rounded-[18px] border border-[var(--color-border-light)] bg-[var(--color-bg)] px-3 py-2")}
              >
                <Skeleton className={cn("size-7 rounded-[16px]")} />
                <div className={cn("min-w-0 flex-1 space-y-1.5")}>
                  <Skeleton className={cn("h-3 w-[55%] rounded-full")} />
                  <Skeleton className={cn("h-2.5 w-[78%] rounded-full")} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  onAddProject: () => void;
}

function EmptyState({ onAddProject }: EmptyStateProps) {
  return (
    <div className={cn("flex h-full items-center justify-center pb-6")}>
      <div className={cn("w-full rounded-[26px] border border-dashed border-[var(--color-primary-border)] bg-white/75 p-5 text-center shadow-sm backdrop-blur-sm")}>
        <div className={cn("mx-auto flex size-11 items-center justify-center rounded-[20px] bg-[var(--color-primary-light)] text-[var(--color-primary)]")}>
          <Plus className={cn("size-5")} strokeWidth={2.4} />
        </div>
        <h3 className={cn("mt-3 text-[14px] font-semibold text-[var(--color-text)]")}>
          No repositories yet
        </h3>
        <p className={cn("mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)]")}>
          Add a Git remote to create the first project source for this workspace.
        </p>
        <Button
          variant="outline"
          size="sm"
          className={cn("mt-4 rounded-full border-[var(--color-primary-border)] bg-white px-3 text-[12px] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]")}
          onClick={onAddProject}
        >
          <Plus className={cn("size-3.5")} strokeWidth={2.25} />
          Add project
        </Button>
      </div>
    </div>
  );
}

export default Sidebar;
