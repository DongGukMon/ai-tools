import { useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

interface Props {
  worktree: Worktree;
  projectId: string;
}

function WorktreeItem({ worktree, projectId }: Props) {
  const [removing, setRemoving] = useState(false);
  const { selectedWorktree, selectWorktree, removeWorktree } =
    useProjectStore();
  const { toast } = useToast();
  const isSelected = selectedWorktree?.path === worktree.path;
  const displayName = worktree.branch || worktree.name;

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await removeWorktree(projectId, worktree.name);
      toast("success", `Worktree '${worktree.name}' removed`);
    } catch {
      setRemoving(false);
    }
  };

  const handleSelect = () => {
    if (!removing) {
      selectWorktree(worktree);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect();
    }
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-[20px] border px-3 py-2.5 transition-all duration-150",
        {
          "animate-fade-out pointer-events-none opacity-60": removing,
          "border-[var(--color-primary-border)] bg-[linear-gradient(180deg,white,oklch(0.97_0.02_145))] shadow-sm":
            isSelected,
          "cursor-pointer border-[var(--color-border)] bg-white/70 hover:border-white hover:bg-white hover:shadow-sm":
            !isSelected && !removing,
          "border-[var(--color-border)] bg-white/70": removing,
        },
      )}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={removing ? -1 : 0}
      title={worktree.path}
    >
      <div
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[18px] border shadow-inner transition-colors",
          {
            "border-[var(--color-primary-border)] bg-[var(--color-primary-light)] text-[var(--color-primary)]":
              isSelected,
            "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]":
              !isSelected,
          },
        )}
      >
        <GitBranch className={cn("size-4")} strokeWidth={isSelected ? 2.3 : 2} />
      </div>

      <div className={cn("min-w-0 flex-1")}>
        <div className={cn("flex items-center gap-2")}>
          <span
            className={cn("truncate text-[12px]", {
              "font-semibold text-[var(--color-text)]": isSelected,
              "font-medium text-[var(--color-text)]": !isSelected,
            })}
          >
            {displayName}
          </span>
          {isSelected && (
            <Badge
              variant="success"
              className={cn("rounded-full border-0 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.12em]")}
            >
              Active
            </Badge>
          )}
        </div>
        <p className={cn("mt-1 truncate text-[10px] text-[var(--color-text-tertiary)]")}>
          {worktree.path}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(
          "mt-0.5 rounded-full text-[var(--color-text-tertiary)] transition-opacity",
          {
            "opacity-100 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]":
              isSelected || removing,
            "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]":
              !isSelected && !removing,
          },
        )}
        onClick={handleRemove}
        title="Remove worktree"
        disabled={removing}
      >
        {removing ? <Spinner className={cn("size-3.5")} /> : <X className={cn("size-3.5")} strokeWidth={2.15} />}
      </Button>
    </div>
  );
}

export default WorktreeItem;
