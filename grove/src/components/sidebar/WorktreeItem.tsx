import { useState } from "react";
import { GitBranch, Loader2, X } from "lucide-react";
import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";
import { useTerminalStore } from "../../store/terminal";
import { useToast } from "../../store/toast";
import { overlay } from "../../lib/overlay";
import { collectTerminalPanes } from "../../lib/terminal-session";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
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
  const hasBell = useTerminalStore((state) => {
    const session = state.sessions[worktree.path];
    if (!session || state.bellPtyIds.size === 0) {
      return false;
    }

    return collectTerminalPanes(session).some(
      ({ ptyId }) => !!ptyId && state.bellPtyIds.has(ptyId),
    );
  });
  const displayName = worktree.branch || worktree.name;

  const handleRemoveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await overlay.open<boolean>(({ resolve, close }) => (
      <Dialog open onClose={close} title="Remove worktree?" className={cn("max-w-sm")}>
        <div className={cn("space-y-4")}>
          <p className={cn("text-sm leading-relaxed text-muted-foreground")}>
            Worktree{" "}
            <span className={cn("font-semibold text-foreground")}>{displayName}</span>{" "}
            and its local branch, terminal sessions, and layouts will be removed.
          </p>
          <div className={cn("flex justify-end gap-2")}>
            <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => resolve(true)}>Delete</Button>
          </div>
        </div>
      </Dialog>
    ));

    if (!confirmed) return;

    setRemoving(true);
    try {
      await removeWorktree(projectId, worktree.name);
      toast("success", `Worktree '${worktree.name}' removed`);
    } catch {
      setRemoving(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer select-none",
        {
          "pointer-events-none opacity-50": removing,
          "bg-selected text-foreground": isSelected && !removing,
          "text-muted-foreground hover:bg-secondary/50 hover:text-foreground": !isSelected && !removing,
        },
      )}
      onClick={() => !removing && selectWorktree(worktree)}
      title={worktree.path}
    >
      <GitBranch className={cn("h-3.5 w-3.5 shrink-0")} />
      <span className={cn("min-w-0 flex-1 truncate")}>{displayName}</span>
      {hasBell && (
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full bg-orange-500")}
          aria-label="Terminal bell pending"
          title="Terminal bell pending"
        />
      )}
      {removing ? (
        <Loader2 className={cn("h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground")} />
      ) : (
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
          <X className={cn("h-3 w-3")} />
        </button>
      )}
    </div>
  );
}

export default WorktreeItem;
