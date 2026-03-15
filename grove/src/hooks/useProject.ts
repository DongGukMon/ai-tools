import { useEffect } from "react";
import { useProjectStore } from "../store/project";

export function useProject() {
  const store = useProjectStore();

  useEffect(() => {
    store.loadProjects();
  }, []);

  return store;
}
