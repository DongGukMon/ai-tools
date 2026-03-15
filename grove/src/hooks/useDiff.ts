import { useEffect, useRef } from "react";
import { useDiffStore } from "../store/diff";
import { registerSyncJob, unregisterSyncJob } from "../lib/sync-manager";

export function useDiff(worktreePath: string | null) {
  const store = useDiffStore();
  const prevStatusRef = useRef<string>("");

  // Sync worktree path
  useEffect(() => {
    store.setWorktreePath(worktreePath);
    if (worktreePath) {
      store.loadStatus();
      store.loadCommits();
    }
  }, [worktreePath]);

  // Poll for status changes every 2s
  useEffect(() => {
    if (!worktreePath) return;

    const interval = setInterval(async () => {
      const state = useDiffStore.getState();
      await state.loadStatus();
      const newStatus = JSON.stringify(useDiffStore.getState().fileStatuses);
      if (newStatus !== prevStatusRef.current) {
        prevStatusRef.current = newStatus;
        // Refresh current view on change
        if (state.selectedFile && state.selectedView === "changes") {
          state.loadWorkingDiff(state.selectedFile, state.isViewingStaged);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [worktreePath]);

  // Sync commits via sync manager
  useEffect(() => {
    if (!worktreePath) return;

    registerSyncJob(
      "commits",
      () => useDiffStore.getState().loadCommits(),
      10_000,
    );

    return () => {
      unregisterSyncJob("commits");
    };
  }, [worktreePath]);

  return store;
}
