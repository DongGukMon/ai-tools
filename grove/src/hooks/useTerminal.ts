import { useTerminalStore } from "../store/terminal";
import {
  createPty as ipcCreatePty,
  closePty as ipcClosePty,
  loadTerminalSessionSnapshot,
  type CreatePtyRequest,
  type CreatePtyRestore,
} from "../lib/tauri";
import { runCommand, runCommandSafely } from "../lib/command";
import {
  buildTerminalRestorePlan,
  restoreLayoutWithPtyIds,
} from "../lib/terminal-session";
import { primeTerminalPane } from "../lib/terminal-runtime";

export function useTerminal() {
  const store = useTerminalStore();

  const createTerminal = async (worktreePath: string) => {
    const createPty = (
      request: Omit<CreatePtyRequest, "cols" | "rows" | "restore">,
      restore?: CreatePtyRestore,
    ) =>
      runCommand(() => ipcCreatePty({
        ...request,
        cols: 80,
        rows: 24,
        restore,
      }), {
        errorToast: false,
      });

    // Check for saved layout
    const savedLayout = store.getSavedLayout(worktreePath);
    if (savedLayout) {
      // Snapshot data seeds cwd/scrollback only when a Grove-managed tmux session
      // is missing. Existing tmux sessions remain the primary restore path.
      const snapshot = await runCommandSafely(
        () => loadTerminalSessionSnapshot(worktreePath),
        { errorToast: false },
      );
      const restorePlan = buildTerminalRestorePlan(
        structuredClone(savedLayout),
        snapshot,
        worktreePath,
      );
      const panePtyIds = new Map<string, string>();

      for (const pane of restorePlan) {
        const ptyId = crypto.randomUUID();
        const { sessionState } = await createPty({
          ptyId,
          paneId: pane.paneId,
          worktreePath,
          cwd: pane.restoreCwd,
        }, {
          lastKnownCwd:
            pane.restoreCwdSource === "lastKnownCwd"
              ? pane.lastKnownCwd
              : undefined,
          scrollback: pane.scrollback,
          scrollbackTruncated: pane.scrollbackTruncated,
        });
        panePtyIds.set(pane.paneId, ptyId);
        primeTerminalPane(pane.paneId, {
          ptyId,
          launchCwd: pane.launchCwd,
          initialScrollback:
            sessionState === "created" ? pane.scrollback : undefined,
        });
      }

      const restored = restoreLayoutWithPtyIds(
        structuredClone(savedLayout),
        panePtyIds,
      );
      store.restoreSession(worktreePath, restored);
      return restorePlan[0]
        ? panePtyIds.get(restorePlan[0].paneId) ?? null
        : null;
    }

    // No saved layout — single terminal
    const paneId = crypto.randomUUID();
    const ptyId = crypto.randomUUID();
    await createPty({ ptyId, paneId, worktreePath, cwd: worktreePath });
    store.createSession(worktreePath, paneId, ptyId);
    return ptyId;
  };

  const splitCurrent = async (direction: "horizontal" | "vertical") => {
    const { activeWorktree, focusedPtyId } = useTerminalStore.getState();
    if (!activeWorktree || !focusedPtyId) return;
    const newPaneId = crypto.randomUUID();
    const newPtyId = crypto.randomUUID();
    const created = await runCommandSafely(async () => {
      await ipcCreatePty({
        ptyId: newPtyId,
        paneId: newPaneId,
        worktreePath: activeWorktree,
        cwd: activeWorktree,
        cols: 80,
        rows: 24,
      });
      return true;
    }, {
      errorToast: "Failed to split terminal",
    });
    if (created) {
      store.splitTerminal(
        activeWorktree,
        focusedPtyId,
        direction,
        newPaneId,
        newPtyId,
      );
    }
  };

  const closeCurrent = async () => {
    const { activeWorktree, focusedPtyId } = useTerminalStore.getState();
    if (!activeWorktree || !focusedPtyId) return;
    store.closeTerminal(activeWorktree, focusedPtyId);
    await runCommandSafely(() => ipcClosePty(focusedPtyId), {
      errorToast: "Failed to close terminal",
    });
  };

  return {
    ...store,
    createTerminal,
    splitCurrent,
    closeCurrent,
  };
}
