import { useTerminalStore } from "../store/terminal";
import { countLeaves, assignPtyIds } from "../lib/split-tree";
import {
  createPty as ipcCreatePty,
  closePty as ipcClosePty,
} from "../lib/tauri";

export function useTerminal() {
  const store = useTerminalStore();

  const createTerminal = async (worktreePath: string) => {
    // Check for saved layout
    const savedLayout = store.getSavedLayout(worktreePath);
    if (savedLayout) {
      const leafCount = countLeaves(savedLayout);
      const ptyIds: string[] = [];
      // Create PTYs for each leaf
      for (let i = 0; i < leafCount; i++) {
        const ptyId = crypto.randomUUID();
        await ipcCreatePty(ptyId, worktreePath, 80, 24);
        ptyIds.push(ptyId);
      }
      const restored = assignPtyIds(structuredClone(savedLayout), [...ptyIds]);
      store.restoreSession(worktreePath, restored);
      return ptyIds[0];
    }

    // No saved layout — single terminal
    const ptyId = crypto.randomUUID();
    await ipcCreatePty(ptyId, worktreePath, 80, 24);
    store.createSession(worktreePath, ptyId);
    return ptyId;
  };

  const splitCurrent = async (direction: "horizontal" | "vertical") => {
    const { activeWorktree, focusedPtyId } = useTerminalStore.getState();
    if (!activeWorktree || !focusedPtyId) return;
    const newPtyId = crypto.randomUUID();
    await ipcCreatePty(newPtyId, activeWorktree, 80, 24);
    store.splitTerminal(activeWorktree, focusedPtyId, direction, newPtyId);
  };

  const closeCurrent = async () => {
    const { activeWorktree, focusedPtyId } = useTerminalStore.getState();
    if (!activeWorktree || !focusedPtyId) return;
    store.closeTerminal(activeWorktree, focusedPtyId);
    await ipcClosePty(focusedPtyId);
  };

  return {
    ...store,
    createTerminal,
    splitCurrent,
    closeCurrent,
  };
}
