import { useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";
import { useToast } from "../../store/toast";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { cn } from "../../lib/cn";

interface Props {
  worktree: Worktree;
  projectId: string;
}

function WorktreeItem({ worktree, projectId }: Props) {
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { selectedWorktree, selectWorktree, removeWorktree } =
    useProjectStore();
  const { toast } = useToast();
  const isSelected = selectedWorktree?.path === worktree.path;

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirming(true);
  };

  const confirmRemove = async () => {
    setConfirming(false);
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
    <>
      <div
        className={cn(
          "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer select-none",
          {
            "animate-fade-out pointer-events-none opacity-50": removing,
            "bg-selected text-foreground": isSelected && !removing,
            "text-muted-foreground hover:bg-secondary/50 hover:text-foreground": !isSelected && !removing,
          },
        )}
        onClick={() => !removing && selectWorktree(worktree)}
        title={worktree.path}
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        <button
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded-sm transition-colors",
            {
              "opacity-50 hover:opacity-100 hover:text-foreground": isSelected,
              "opacity-0 group-hover:opacity-100 hover:text-foreground": !isSelected,
            },
          )}
          onClick={handleRemoveClick}
          title="Remove worktree"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Remove worktree?"
        className="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Worktree{" "}
            <span className="font-semibold text-foreground">
              {displayName}
            </span>{" "}
            will be deleted from disk.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmRemove}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default WorktreeItem;
