import { useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";

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

  const displayName = worktree.branch || worktree.name;

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2.5 h-[30px] rounded-lg cursor-pointer select-none transition-all duration-100",
        {
          "animate-fade-out pointer-events-none opacity-50": removing,
          "bg-white shadow-sm text-[var(--color-primary)]": isSelected,
          "text-[#6b7280] hover:bg-white/60 hover:text-[#374151]": !isSelected,
        },
      )}
      onClick={() => !removing && selectWorktree(worktree)}
      title={worktree.path}
    >
      <GitBranch
        size={13}
        strokeWidth={isSelected ? 2.5 : 2}
        className={cn("shrink-0", {
          "text-[var(--color-primary)]": isSelected,
          "text-[#9ca3af]": !isSelected,
        })}
      />
      <span
        className={cn("min-w-0 flex-1 text-[13px] truncate", {
          "font-semibold": isSelected,
          "font-medium": !isSelected,
        })}
      >
        {displayName}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "w-[18px] h-[18px] rounded-md",
          {
            "opacity-50 hover:opacity-100 text-[var(--color-primary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]":
              isSelected,
            "opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]":
              !isSelected,
          },
        )}
        onClick={handleRemove}
        title="Remove worktree"
      >
        <X size={11} strokeWidth={2} />
      </Button>
    </div>
  );
}

export default WorktreeItem;
