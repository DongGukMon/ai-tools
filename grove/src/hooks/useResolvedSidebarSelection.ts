import { useMemo } from "react";
import { useMissionStore } from "../store/mission";
import { usePanelLayoutStore } from "../store/panel-layout";
import { useProjectStore } from "../store/project";
import { resolveSidebarSelection } from "../lib/sidebar-selection";

export function useResolvedSidebarSelection() {
  const sidebarMode = usePanelLayoutStore((s) => s.sidebarMode);
  const selectedWorktreePath = useProjectStore((s) => s.selectedWorktree?.path ?? null);
  const missionSelectedItem = useMissionStore((s) => s.selectedItem);
  const missions = useMissionStore((s) => s.missions);

  return useMemo(
    () =>
      resolveSidebarSelection({
        sidebarMode,
        selectedWorktreePath,
        missionSelectedItem,
        missions,
      }),
    [sidebarMode, selectedWorktreePath, missionSelectedItem, missions],
  );
}
