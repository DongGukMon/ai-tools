import { useTerminalStore } from "../store/terminal";
import { countLeaves, assignPtyIds } from "../lib/split-tree";
import { createPty as ipcCreatePty, closePty as ipcClosePty } from "../lib/tauri";
import { runCommand, runCommandSafely } from "../lib/command";

export function useTerminal() {
  const store = useTerminalStore();

  const createTerminal = async (worktreePath: string) => {
    const createPty = (ptyId: string) =>
      runCommand(() => ipcCreatePty(ptyId, worktreePath, 80, 24), {
        errorToast: false,
      });

    // Check for saved layout
    const savedLayout = store.getSavedLayout(worktreePath);
    if (savedLayout) {
      const leafCount = countLeaves(savedLayout);
      const ptyIds: string[] = [];
      // Create PTYs for each leaf
      for (let i = 0; i < leafCount; i++) {
        const ptyId = crypto.randomUUID();
        await createPty(ptyId);
        ptyIds.push(ptyId);
      }
      const restored = assignPtyIds(structuredClone(savedLayout), [...ptyIds]);
      store.restoreSession(worktreePath, restored);
      return ptyIds[0];
    }

    // No saved layout — single terminal
    const ptyId = crypto.randomUUID();
    await createPty(ptyId);
    store.createSession(worktreePath, ptyId);
    return ptyId;
  };

  const splitCurrent = async (direction: "horizontal" | "vertical") => {
    const { activeWorktree, focusedPtyId } = useTerminalStore.getState();
    if (!activeWorktree || !focusedPtyId) return;
    const newPtyId = crypto.randomUUID();
    const created = await runCommandSafely(async () => {
      await ipcCreatePty(newPtyId, activeWorktree, 80, 24);
      return true;
    }, {
      errorToast: "Failed to split terminal",
    });
    if (created) {
      store.splitTerminal(activeWorktree, focusedPtyId, direction, newPtyId);
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
