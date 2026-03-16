import { useCallback, useMemo } from "react";
import { writePty } from "../lib/platform";
import { runCommandSafely } from "../lib/command";
import {
  executeTerminalCommand,
  isTerminalCommandEnabled,
  type TerminalCommandDefinition,
} from "../lib/terminal-command-pipeline";
import { TERMINAL_TOOLBAR_COMMANDS } from "../lib/terminal-command-registry";
import { useTerminal } from "./useTerminal";
import { countLeaves } from "../lib/split-tree";

interface Options {
  openThemeSettings: () => void;
}

export function useTerminalCommandPipeline({ openThemeSettings }: Options) {
  const { activeWorktree, focusedPtyId, sessions, splitCurrent, closeCurrent } =
    useTerminal();

  const terminalCount = useMemo(() => {
    if (!activeWorktree) return 0;
    const root = sessions[activeWorktree];
    return root ? countLeaves(root) : 0;
  }, [activeWorktree, sessions]);

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

  const context = useMemo(
    () => ({
      activeWorktree,
      focusedPtyId,
      terminalCount,
      openThemeSettings,
      splitTerminal: splitCurrent,
      closeTerminal: closeCurrent,
      sendText,
    }),
    [
      activeWorktree,
      closeCurrent,
      focusedPtyId,
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
