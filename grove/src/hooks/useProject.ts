import { useEffect } from "react";
import { useProjectStore } from "../store/project";
import { registerSyncJob, startSyncManager, stopSyncManager } from "../lib/sync-manager";
import { useToastStore } from "../store/toast";
import * as tauri from "../lib/platform";

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

  // Clone event listeners
  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    tauri.onCloneCompleted(({ id, project }) => {
      if (cancelled) return;
      const { cloningProjects } = useProjectStore.getState();
      if (!cloningProjects.some((c) => c.id === id)) return;

      useProjectStore.setState((state) => ({
        cloningProjects: state.cloningProjects.filter((c) => c.id !== id),
        projects: [...state.projects, project],
      }));
      useToastStore.getState().addToast("success", "Project cloned successfully");
    }).then((fn) => {
      if (cancelled) fn();
      else cleanups.push(fn);
    });

    tauri.onCloneFailed(({ id, error }) => {
      if (cancelled) return;
      const { cloningProjects } = useProjectStore.getState();
      if (!cloningProjects.some((c) => c.id === id)) return;

      useProjectStore.setState((state) => ({
        cloningProjects: state.cloningProjects.filter((c) => c.id !== id),
      }));
      useToastStore.getState().addToast("error", `Clone failed: ${error}`);
    }).then((fn) => {
      if (cancelled) fn();
      else cleanups.push(fn);
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return store;
}
