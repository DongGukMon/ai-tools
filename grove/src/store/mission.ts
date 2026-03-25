import { create } from "zustand";
import type { Mission } from "../types";
import * as tauri from "../lib/platform";
import { runCommand, runCommandSafely } from "../lib/command";
import { useTerminalStore } from "./terminal";

interface MissionState {
  missions: Mission[];
  selectedItem: { missionId: string; projectId?: string } | null;
  collapsedMissions: Record<string, boolean>;
  deletingMissions: Record<string, boolean>;
  loading: boolean;

  loadMissions: () => Promise<void>;
  createMission: (name: string) => Promise<Mission>;
  deleteMission: (id: string) => Promise<void>;
  addProject: (missionId: string, projectId: string) => Promise<void>;
  removeProject: (missionId: string, projectId: string) => Promise<void>;
  selectItem: (missionId: string, projectId?: string) => void;
  toggleCollapse: (missionId: string) => void;
  getSelectedPath: () => string | null;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  missions: [],
  selectedItem: null,
  collapsedMissions: {},
  deletingMissions: {},
  loading: false,

  loadMissions: async () => {
    set({ loading: true });
    try {
      const missions = await runCommandSafely(() => tauri.listMissions(), {
        errorToast: "Failed to load missions",
      });
      if (missions) {
        set({ missions });
      }
    } finally {
      set({ loading: false });
    }
  },

  createMission: async (name: string) => {
    const mission = await runCommand(() => tauri.createMission(name), {
      errorToast: "Failed to create mission",
    });
    set((state) => ({ missions: [...state.missions, mission] }));
    return mission;
  },

  deleteMission: async (id: string) => {
    set((state) => ({
      deletingMissions: { ...state.deletingMissions, [id]: true },
    }));

    try {
      const mission = get().missions.find((m) => m.id === id);
      if (mission) {
        for (const project of mission.projects) {
          useTerminalStore.getState().removeSession(project.path);
        }
      }

      await runCommand(() => tauri.deleteMission(id), {
        errorToast: "Failed to delete mission",
      });

      set((state) => {
        const { [id]: _, ...remainingDeleting } = state.deletingMissions;
        const { [id]: __, ...remainingCollapsed } = state.collapsedMissions;
        const nextSelected =
          state.selectedItem?.missionId === id ? null : state.selectedItem;
        return {
          missions: state.missions.filter((m) => m.id !== id),
          selectedItem: nextSelected,
          deletingMissions: remainingDeleting,
          collapsedMissions: remainingCollapsed,
        };
      });
    } catch (error) {
      set((state) => {
        const { [id]: _, ...remainingDeleting } = state.deletingMissions;
        return { deletingMissions: remainingDeleting };
      });
      throw error;
    }
  },

  addProject: async (missionId: string, projectId: string) => {
    const missionProject = await runCommand(
      () => tauri.addProjectToMission(missionId, projectId),
      { errorToast: "Failed to add project to mission" },
    );
    set((state) => ({
      missions: state.missions.map((m) =>
        m.id === missionId
          ? { ...m, projects: [...m.projects, missionProject] }
          : m,
      ),
    }));
  },

  removeProject: async (missionId: string, projectId: string) => {
    const mission = get().missions.find((m) => m.id === missionId);
    const removedProject = mission?.projects.find(
      (p) => p.projectId === projectId,
    );

    if (removedProject) {
      useTerminalStore.getState().removeSession(removedProject.path);
    }

    await runCommand(
      () => tauri.removeProjectFromMission(missionId, projectId),
      { errorToast: "Failed to remove project from mission" },
    );

    set((state) => {
      const nextMissions = state.missions.map((m) =>
        m.id === missionId
          ? { ...m, projects: m.projects.filter((p) => p.projectId !== projectId) }
          : m,
      );

      // Fall back selection to mission dir if removed project was selected
      const wasSelected =
        state.selectedItem?.missionId === missionId &&
        state.selectedItem?.projectId === projectId;
      const nextSelected = wasSelected
        ? { missionId }
        : state.selectedItem;

      return {
        missions: nextMissions,
        selectedItem: nextSelected,
      };
    });
  },

  selectItem: (missionId: string, projectId?: string) => {
    set({
      selectedItem: projectId ? { missionId, projectId } : { missionId },
    });
  },

  toggleCollapse: (missionId: string) => {
    set((state) => ({
      collapsedMissions: {
        ...state.collapsedMissions,
        [missionId]: !state.collapsedMissions[missionId],
      },
    }));
  },

  getSelectedPath: () => {
    const { selectedItem, missions } = get();
    if (!selectedItem) return null;

    const mission = missions.find((m) => m.id === selectedItem.missionId);
    if (!mission) return null;

    if (selectedItem.projectId) {
      const project = mission.projects.find(
        (p) => p.projectId === selectedItem.projectId,
      );
      return project?.path ?? null;
    }

    return mission.missionDir;
  },
}));
