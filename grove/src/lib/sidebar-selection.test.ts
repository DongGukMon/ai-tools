import { describe, expect, it } from "vitest";
import { resolveSidebarSelection } from "./sidebar-selection";

const missions = [
  {
    id: "m1",
    name: "Mission 1",
    missionDir: "/tmp/missions/m1",
    collapsed: false,
    projects: [
      {
        projectId: "p1",
        branch: "mission/m1",
        path: "/tmp/missions/m1/project-1",
      },
    ],
  },
];

describe("resolveSidebarSelection", () => {
  it("returns the selected project worktree in projects mode", () => {
    expect(
      resolveSidebarSelection({
        sidebarMode: "projects",
        selectedWorktreePath: "/tmp/source",
        missionSelectedItem: { missionId: "m1" },
        missions,
      }),
    ).toEqual({
      terminalPath: "/tmp/source",
      worktreePath: "/tmp/source",
    });
  });

  it("returns the mission project path for both terminal and worktree in missions mode", () => {
    expect(
      resolveSidebarSelection({
        sidebarMode: "missions",
        selectedWorktreePath: "/tmp/source",
        missionSelectedItem: { missionId: "m1", projectId: "p1" },
        missions,
      }),
    ).toEqual({
      terminalPath: "/tmp/missions/m1/project-1",
      worktreePath: "/tmp/missions/m1/project-1",
    });
  });

  it("returns the mission dir for terminal and null worktree when only the mission is selected", () => {
    expect(
      resolveSidebarSelection({
        sidebarMode: "missions",
        selectedWorktreePath: "/tmp/source",
        missionSelectedItem: { missionId: "m1" },
        missions,
      }),
    ).toEqual({
      terminalPath: "/tmp/missions/m1",
      worktreePath: null,
    });
  });

  it("returns null paths when mission selection cannot be resolved", () => {
    expect(
      resolveSidebarSelection({
        sidebarMode: "missions",
        selectedWorktreePath: "/tmp/source",
        missionSelectedItem: { missionId: "missing", projectId: "p1" },
        missions,
      }),
    ).toEqual({
      terminalPath: null,
      worktreePath: null,
    });
  });
});
