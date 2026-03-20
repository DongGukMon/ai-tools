import { useShallow } from "zustand/react/shallow";
import { collectTerminalPanes } from "../../lib/terminal-session";
import type { SplitNode } from "../../types";
import type { ClaudeSessionStatus } from "../../store/terminal";
import { useTerminalStore } from "../../store/terminal";

const EMPTY_STATUSES: ClaudeSessionStatus[] = [];

interface WorktreeStatusState {
  sessions: Record<string, SplitNode>;
  bellPtyIds: Set<string>;
  claudeStatus: Record<string, ClaudeSessionStatus>;
}

export function selectClaudeWorktreeStatuses(
  state: WorktreeStatusState,
  worktreePath: string,
): ClaudeSessionStatus[] {
  const session = state.sessions[worktreePath];
  if (!session) {
    return EMPTY_STATUSES;
  }

  return collectTerminalPanes(session).flatMap(({ ptyId }) => {
    const status = ptyId ? state.claudeStatus[ptyId] : undefined;
    return status ? [status] : EMPTY_STATUSES;
  });
}

export function useClaudeWorktreeStatus(
  worktreePath: string,
): ClaudeSessionStatus[] {
  return useTerminalStore(
    useShallow((state) => selectClaudeWorktreeStatuses(state, worktreePath)),
  );
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
