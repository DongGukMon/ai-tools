import { useShallow } from "zustand/react/shallow";
import { collectTerminalPanes } from "../../lib/terminal-session";
import type { SplitNode } from "../../types";
import type { AiSession } from "../../store/terminal";
import { useTerminalStore } from "../../store/terminal";

const EMPTY_SESSIONS: AiSession[] = [];

interface WorktreeStatusState {
  sessions: Record<string, SplitNode>;
  bellPtyIds: Set<string>;
  aiSessions: Record<string, AiSession>;
}

export function selectAiWorktreeSessions(
  state: WorktreeStatusState,
  worktreePath: string,
): AiSession[] {
  const session = state.sessions[worktreePath];
  if (!session) {
    return EMPTY_SESSIONS;
  }

  return collectTerminalPanes(session).flatMap(({ ptyId }) => {
    const ai = ptyId ? state.aiSessions[ptyId] : undefined;
    return ai ? [ai] : EMPTY_SESSIONS;
  });
}

export function useAiWorktreeSessions(worktreePath: string): AiSession[] {
  return useTerminalStore(
    useShallow((state) => selectAiWorktreeSessions(state, worktreePath)),
  );
}

/** @deprecated Use useAiWorktreeSessions */
export function useClaudeWorktreeStatus(worktreePath: string): AiSession[] {
  return useAiWorktreeSessions(worktreePath);
}

export function selectWorktreeBell(
  state: WorktreeStatusState,
  worktreePath: string,
): boolean {
  const session = state.sessions[worktreePath];
  if (!session || state.bellPtyIds.size === 0) {
    return false;
  }

  return collectTerminalPanes(session).some(
    ({ ptyId }) => !!ptyId && state.bellPtyIds.has(ptyId),
  );
}

export function useWorktreeBell(worktreePath: string): boolean {
  return useTerminalStore((state) => selectWorktreeBell(state, worktreePath));
}
