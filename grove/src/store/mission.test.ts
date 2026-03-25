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
});
