import { useEffect } from "react";
import { useMissionStore } from "../store/mission";

export function useMission() {
  const loading = useMissionStore((s) => s.loading);
  const loadMissions = useMissionStore((s) => s.loadMissions);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  return { loading };
}
