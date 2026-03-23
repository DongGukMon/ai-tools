import { useEffect } from "react";
import { useProjectStore } from "../store/project";
import { registerSyncJob, startSyncManager, stopSyncManager } from "../lib/sync-manager";

export function useProject() {
  const store = useProjectStore();

  useEffect(() => {
    registerSyncJob(
      "projects",
      () => useProjectStore.getState().syncProjects(),
      10_000,
    );

    // Initial load (blocking for first render)
    store.loadProjects().then(() => {
      startSyncManager({ runImmediately: false });
    });

    return () => {
      stopSyncManager();
    };
  }, []);

  return store;
}
