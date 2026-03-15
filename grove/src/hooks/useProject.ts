import { useEffect, useRef } from "react";
import { useProjectStore } from "../store/project";

const SYNC_INTERVAL_MS = 5000;

export function useProject() {
  const store = useProjectStore();
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    store.loadProjects();

    syncTimer.current = setInterval(() => {
      useProjectStore.getState().syncProjects();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncTimer.current) {
        clearInterval(syncTimer.current);
      }
    };
  }, []);

  return store;
}
