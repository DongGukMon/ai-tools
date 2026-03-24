import { useCallback, useMemo } from "react";
import { writePty } from "../lib/platform";
import { runCommandSafely } from "../lib/command";
import {
  executeTerminalCommand,
  isTerminalCommandEnabled,
  type TerminalCommandDefinition,
} from "../lib/terminal-command-pipeline";
import { useTerminalStore } from "../store/terminal";
import { useProjectStore } from "../store/project";
import { usePanelLayoutStore } from "../store/panel-layout";
import { useBroadcastStore } from "../store/broadcast";
import { getRuntimeSize, captureRuntimeSnapshot } from "../lib/terminal-runtime";
import { collectTerminalPanes } from "../lib/terminal-session";
import { TERMINAL_TOOLBAR_COMMANDS } from "../lib/terminal-command-registry";
import { useTerminal } from "./useTerminal";
import { countLeaves } from "../lib/split-tree";

interface Options {
  openThemeSettings: () => void;
}

export function useTerminalCommandPipeline({ openThemeSettings }: Options) {
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const focusedPtyId = useTerminalStore((s) => s.focusedPtyId);
  const activeSession = useTerminalStore((s) =>
    s.activeWorktree ? (s.sessions[s.activeWorktree] ?? null) : null,
  );
  const { splitCurrent, closeCurrent } = useTerminal();

  const terminalCount = useMemo(() => {
    return activeSession ? countLeaves(activeSession) : 0;
  }, [activeSession]);

  const sendText = useCallback(
    async (text: string, options?: { addNewline?: boolean }) => {
      if (!focusedPtyId) {
        return;
      }

      const payload =
        options?.addNewline === false ? text : `${text}\r`;
      const bytes = Array.from(new TextEncoder().encode(payload));

      await runCommandSafely(() => writePty(focusedPtyId, bytes), {
        errorToast: "Failed to send terminal command",
      });
    },
    [focusedPtyId],
  );

  const mirrorTerminal = useCallback(() => {
    const ptyId = useTerminalStore.getState().focusedPtyId;
    if (!ptyId) return;

    const { active, isBroadcasting, startBroadcast } = useBroadcastStore.getState();
    if (active || isBroadcasting(ptyId)) return;

    // Find paneId for the focused pty
    const sessions = useTerminalStore.getState().sessions;
    let paneId = "";
    for (const node of Object.values(sessions)) {
      for (const pane of collectTerminalPanes(node)) {
        if (pane.ptyId === ptyId) { paneId = pane.paneId; break; }
      }
      if (paneId) break;
    }
    if (!paneId) return;

    const worktree = useProjectStore.getState().selectedWorktree;
    const projects = useProjectStore.getState().projects;
    const project = worktree
      ? projects.find((p) => p.worktrees.some((w) => w.path === worktree.path))
      : null;
    const label = project ? `${project.org}/${project.repo}` : "Terminal";
    const title = worktree ? `${label} > ${worktree.name}` : label;

    const { cols, rows } = getRuntimeSize(paneId);
    const snapshot = captureRuntimeSnapshot(paneId);
    startBroadcast(ptyId, paneId, "mirror", cols, rows, snapshot);
    usePanelLayoutStore.getState().addGlobalTerminalMirrorTab(title, ptyId);
  }, []);

  const context = useMemo(
    () => ({
      activeWorktree,
      focusedPtyId,
      terminalCount,
      openThemeSettings,
      splitTerminal: splitCurrent,
      closeTerminal: closeCurrent,
      mirrorTerminal,
      sendText,
    }),
    [
      activeWorktree,
      closeCurrent,
      focusedPtyId,
      mirrorTerminal,
      terminalCount,
      openThemeSettings,
      sendText,
      splitCurrent,
    ],
  );

  const executeCommand = useCallback(
    async (command: TerminalCommandDefinition) => {
      await executeTerminalCommand(command, context);
    },
    [context],
  );

  const isCommandEnabled = useCallback(
    (command: TerminalCommandDefinition) =>
      isTerminalCommandEnabled(command, context),
    [context],
  );

  return {
    commands: TERMINAL_TOOLBAR_COMMANDS,
    executeCommand,
    isCommandEnabled,
  };
}
