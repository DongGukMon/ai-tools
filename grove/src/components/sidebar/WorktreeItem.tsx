import { useState } from "react";
import { GitBranch, Loader2, X } from "lucide-react";
import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";
import type { AiSession, AiTool } from "../../store/terminal";
import { useToast } from "../../store/toast";
import { overlay } from "../../lib/overlay";
import { cn } from "../../lib/cn";
import claudeCodeColor from "../../assets/claudecode-color.png";
import codexColor from "../../assets/codex-color.png";
import { useSidebarLeafActivation } from "../../hooks/useSidebarLeafActivation";
import SidebarLeafItem from "./SidebarLeafItem";
import {
  useAiWorktreeSessions,
  useWorktreeBell,
} from "./worktree-status";
import SidebarContextMenu from "./SidebarContextMenu";
import { getNoteKey, NoteIndicator } from "./NotePopover";

// ── Icon mapping ──

const AI_ICON: Record<AiTool, string> = {
  claude: claudeCodeColor,
  codex: codexColor,
};

// ── AI status icons ──

export function AiStatusIcons({ sessions }: { sessions: AiSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <span
      className={cn("flex shrink-0 items-center gap-1")}
      aria-label={`AI: ${sessions.length} session(s)`}
    >
      {sessions.map(({ tool, status }, i) => (
        <img
          key={i}
          src={AI_ICON[tool]}
          alt={tool}
          className={cn("h-[13px] w-[13px]", {
            "animate-glow": status === "running",
            "animate-glow-claude": status === "running" && tool === "claude",
            "animate-glow-codex": status === "running" && tool === "codex",
            "animate-bounce-dock": status === "attention",
          })}
        />
      ))}
    </span>
  );
}

// ── WorktreeItem ──

interface Props {
  worktree: Worktree;
  projectId: string;
}

function WorktreeItem({
  worktree,
  projectId,
}: Props) {
  const [removing, setRemoving] = useState(false);
  const isSelected = useProjectStore((s) => s.selectedWorktree?.path === worktree.path);
  const selectWorktree = useProjectStore((s) => s.selectWorktree);
  const removeWorktree = useProjectStore((s) => s.removeWorktree);
  const { toast } = useToast();
  const hasBell = useWorktreeBell(worktree.path);
  const aiSessions = useAiWorktreeSessions(worktree.path);
  const displayName = worktree.branch || worktree.name;
  const noteKey = getNoteKey({ type: "worktree", projectId, worktreeName: worktree.name });
  const handleActivate = useSidebarLeafActivation({
    disabled: removing,
    isSelected,
    onSelect: () => selectWorktree(worktree),
  });

  const handleRemove = async () => {
    const confirmed = await overlay.confirm({
      title: "Remove worktree?",
      description: (
        <>
          Worktree{" "}
          <span className={cn("font-semibold text-foreground")}>{displayName}</span>{" "}
          and its local branch, terminal sessions, and layouts will be removed.
        </>
      ),
      confirmLabel: "Delete",
      variant: "destructive",
    });

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
    <SidebarContextMenu path={worktree.path} noteKey={noteKey}>
      <SidebarLeafItem
        icon={(
          <GitBranch className={cn("h-[13px] w-[13px] shrink-0", {
            "text-orange-500": hasBell,
          })} />
        )}
        label={displayName}
        title={worktree.path}
        isSelected={isSelected}
        disabled={removing}
        onActivate={handleActivate}
        status={
          <>
            <NoteIndicator noteKey={noteKey} label={displayName} />
            <AiStatusIcons sessions={aiSessions} />
          </>
        }
        action={removing ? (
          <Loader2 className={cn("h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground")} />
        ) : (
          <button
            type="button"
            className={cn(
              "h-4 w-4 flex items-center justify-center rounded-sm transition-colors hover:text-foreground",
            )}
            onClick={(e) => { e.stopPropagation(); handleRemove(); }}
            title="Remove worktree"
          >
            <X className={cn("h-3 w-3")} />
          </button>
        )}
      />
    </SidebarContextMenu>
  );
}

export default WorktreeItem;
