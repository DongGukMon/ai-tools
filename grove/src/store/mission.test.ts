import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mission, MissionProject } from "../types";

const runCommandMock = vi.fn();
const runCommandSafelyMock = vi.fn();

vi.mock("../lib/command", () => ({
  runCommand: (...args: Parameters<typeof runCommandMock>) =>
    runCommandMock(...args),
  runCommandSafely: (...args: Parameters<typeof runCommandSafelyMock>) =>
    runCommandSafelyMock(...args),
}));

vi.mock("../lib/platform", () => ({
  listMissions: vi.fn(),
  createMission: vi.fn(),
  deleteMission: vi.fn(),
  addProjectToMission: vi.fn(),
  removeProjectFromMission: vi.fn(),
}));

import * as tauri from "../lib/platform";
import { useMissionStore } from "./mission";
import { useTerminalStore } from "./terminal";

function makeMissionProject(
  projectId: string,
  path = `/tmp/${projectId}`,
): MissionProject {
  return { projectId, branch: "main", path };
}

function makeMission(
  id: string,
  projects: MissionProject[] = [],
): Mission {
  return {
    id,
    name: `Mission ${id}`,
    projects,
    missionDir: `/tmp/missions/${id}`,
  };
}

describe("useMissionStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCommandMock.mockImplementation(async (action: () => Promise<unknown>) =>
      action(),
    );
    runCommandSafelyMock.mockImplementation(
      async (action: () => Promise<unknown>) => action(),
    );
    useMissionStore.setState({
      missions: [],
      selectedItem: null,
      collapsedMissions: {},
      deletingMissions: {},
      deletingMissionProjects: {},
      loading: false,
    });
    useTerminalStore.setState({
      sessions: {},
      activeWorktree: null,
      focusedPtyId: null,
      bellPtyIds: new Set<string>(),
      aiSessions: {},
      theme: null,
      detectedTheme: null,
    });
  });

  describe("toggleCollapse", () => {
    it("toggles collapsed state for a mission", () => {
      useMissionStore.getState().toggleCollapse("m1");
      expect(useMissionStore.getState().collapsedMissions["m1"]).toBe(true);

      useMissionStore.getState().toggleCollapse("m1");
      expect(useMissionStore.getState().collapsedMissions["m1"]).toBe(false);
    });
  });

  describe("selectItem", () => {
    it("selects a mission without projectId", () => {
      useMissionStore.getState().selectItem("m1");
      expect(useMissionStore.getState().selectedItem).toEqual({
        missionId: "m1",
      });
    });

    it("selects a mission with projectId", () => {
      useMissionStore.getState().selectItem("m1", "p1");
      expect(useMissionStore.getState().selectedItem).toEqual({
        missionId: "m1",
        projectId: "p1",
      });
    });
  });

  describe("getSelectedPath", () => {
    it("returns null when nothing is selected", () => {
      expect(useMissionStore.getState().getSelectedPath()).toBeNull();
    });

    it("returns missionDir when mission is selected without project", () => {
      const mission = makeMission("m1");
      useMissionStore.setState({ missions: [mission] });
      useMissionStore.getState().selectItem("m1");

      expect(useMissionStore.getState().getSelectedPath()).toBe(
        "/tmp/missions/m1",
      );
    });

    it("returns project path when project is selected", () => {
      const project = makeMissionProject("p1", "/tmp/p1");
      const mission = makeMission("m1", [project]);
      useMissionStore.setState({ missions: [mission] });
      useMissionStore.getState().selectItem("m1", "p1");

      expect(useMissionStore.getState().getSelectedPath()).toBe("/tmp/p1");
    });

    it("returns null when selected mission does not exist", () => {
      useMissionStore.getState().selectItem("nonexistent");
      expect(useMissionStore.getState().getSelectedPath()).toBeNull();
    });
  });

  describe("removeProject", () => {
    it("falls back to the mission terminal when removing the selected mission project", async () => {
      const project = makeMissionProject("p1", "/tmp/p1");
      const mission = makeMission("m1", [project]);
      useMissionStore.setState({
        missions: [mission],
        selectedItem: { missionId: "m1", projectId: "p1" },
      });
      useTerminalStore.setState({
        sessions: {
          "/tmp/p1": { id: "pane-project", type: "leaf", ptyId: "pty-project" },
          "/tmp/missions/m1": { id: "pane-mission", type: "leaf", ptyId: "pty-mission" },
        },
        activeWorktree: "/tmp/p1",
        focusedPtyId: "pty-project",
        focusedPaneIdByWorktree: {
          "/tmp/p1": "pane-project",
          "/tmp/missions/m1": "pane-mission",
        },
      });

      vi.mocked(tauri.removeProjectFromMission).mockResolvedValue();

      await useMissionStore.getState().removeProject("m1", "p1");

      expect(useMissionStore.getState().selectedItem).toEqual({ missionId: "m1" });
      expect(useMissionStore.getState().missions[0]?.projects).toEqual([]);
      expect(useTerminalStore.getState().sessions["/tmp/p1"]).toBeUndefined();
      expect(useTerminalStore.getState().activeWorktree).toBe("/tmp/missions/m1");
      expect(useTerminalStore.getState().focusedPtyId).toBe("pty-mission");
      expect(useMissionStore.getState().deletingMissionProjects).toEqual({});
    });

    it("marks the mission project as deleting while removal is in flight", async () => {
      let resolveRemoval: (() => void) | undefined;
      vi.mocked(tauri.removeProjectFromMission).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveRemoval = resolve;
          }),
      );

      useMissionStore.setState({
        missions: [makeMission("m1", [makeMissionProject("p1", "/tmp/p1")])],
        deletingMissionProjects: {},
      });

      const pending = useMissionStore.getState().removeProject("m1", "p1");

      expect(useMissionStore.getState().deletingMissionProjects).toEqual({
        "m1:p1": true,
      });

      resolveRemoval?.();
      await pending;

      expect(useMissionStore.getState().deletingMissionProjects).toEqual({});
    });
  });

  describe("deleteMission", () => {
    it("marks the mission and its projects as deleting while removal is in flight", async () => {
      let resolveDeletion: (() => void) | undefined;
      vi.mocked(tauri.deleteMission).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDeletion = resolve;
          }),
      );

      useMissionStore.setState({
        missions: [
          makeMission("m1", [
            makeMissionProject("p1", "/tmp/p1"),
            makeMissionProject("p2", "/tmp/p2"),
          ]),
        ],
        deletingMissions: {},
        deletingMissionProjects: {},
      });

      const pending = useMissionStore.getState().deleteMission("m1");

      expect(useMissionStore.getState().deletingMissions).toEqual({
        m1: true,
      });
      expect(useMissionStore.getState().deletingMissionProjects).toEqual({
        "m1:p1": true,
        "m1:p2": true,
      });

      resolveDeletion?.();
      await pending;

      expect(useMissionStore.getState().deletingMissions).toEqual({});
      expect(useMissionStore.getState().deletingMissionProjects).toEqual({});
    });
  });
});
