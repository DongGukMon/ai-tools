import type { Mission } from "../types";

export type SidebarMode = "projects" | "missions";

export interface MissionSelectionItem {
  missionId: string;
  projectId?: string;
}

export interface ResolveSidebarSelectionInput {
  sidebarMode: SidebarMode;
  selectedWorktreePath: string | null;
  missionSelectedItem: MissionSelectionItem | null;
  missions: Mission[];
}

export interface ResolvedSidebarSelection {
  terminalPath: string | null;
  worktreePath: string | null;
}

export function resolveSidebarSelection({
  sidebarMode,
  selectedWorktreePath,
  missionSelectedItem,
  missions,
}: ResolveSidebarSelectionInput): ResolvedSidebarSelection {
  if (sidebarMode === "projects") {
    return {
      terminalPath: selectedWorktreePath,
      worktreePath: selectedWorktreePath,
    };
  }

  if (!missionSelectedItem) {
    return { terminalPath: null, worktreePath: null };
  }

  const mission = missions.find((item) => item.id === missionSelectedItem.missionId);
  if (!mission) {
    return { terminalPath: null, worktreePath: null };
  }

  if (missionSelectedItem.projectId) {
    const project = mission.projects.find(
      (item) => item.projectId === missionSelectedItem.projectId,
    );
    const path = project?.path ?? null;
    return {
      terminalPath: path,
      worktreePath: path,
    };
  }

  return {
    terminalPath: mission.missionDir || null,
    worktreePath: null,
  };
}
