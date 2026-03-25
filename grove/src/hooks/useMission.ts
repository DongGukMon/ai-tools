import { useEffect } from "react";
import { useMissionStore } from "../store/mission";

export function useMission() {
  const store = useMissionStore();
  useEffect(() => { store.loadMissions(); }, []);
  return store;
}
