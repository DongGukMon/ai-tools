import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, SplitNode, Worktree } from "../types";

const runCommandMock = vi.fn();
const runCommandSafelyMock = vi.fn();

vi.mock("../lib/command", () => ({
  runCommand: (...args: Parameters<typeof runCommandMock>) =>
    runCommandMock(...args),
  runCommandSafely: (...args: Parameters<typeof runCommandSafelyMock>) =>
    runCommandSafelyMock(...args),
}));

vi.mock("../lib/platform", () => ({
  listProjects: vi.fn(),
  refreshProject: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  addWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  renameProject: vi.fn(),
  setProjectCollapsed: vi.fn(),
}));

import * as tauri from "../lib/platform";
import { useProjectStore } from "./project";
import { useBroadcastStore } from "./broadcast";
import { useTerminalStore } from "./terminal";

function makeWorktree(name: string, branch = name): Worktree {
  return {
    name,
    path: `/tmp/${name}`,
    branch,
  };
}

function makeProject(worktrees: Worktree[]): Project {
  return {
    id: "project-1",
    name: "grove",
    url: "https://github.com/bang9/grove.git",
    org: "bang9",
    repo: "grove",
    sourcePath: "/tmp/source",
    sourceHasChanges: false,
    sourceBehindRemote: false,
    baseBranch: null,
    resolvedDefaultBranch: "main",
    collapsed: false,
    worktrees,
  };
}

function makeLeaf(id: string, ptyId: string): SplitNode {
  return {
    id,
    type: "leaf",
    ptyId,
  };
}

function makeProjectWithId(
  id: string,
  overrides: Partial<Project> = {},
): Project {
  return {
    ...makeProject([]),
    id,
    ...overrides,
  };
}

describe("useProjectStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runCommandMock.mockImplementation(async (action: () => Promise<unknown>) =>
      action(),
    );
    runCommandSafelyMock.mockImplementation(
      async (action: () => Promise<unknown>) => action(),
    );
    useProjectStore.setState({ projects: [], selectedWorktree: null, loading: false });
    useTerminalStore.setState({
      sessions: {},
      activeWorktree: null,
      focusedPtyId: null,
      focusedPaneIdByWorktree: {},
      bellPtyIds: new Set<string>(),
      aiSessions: {},
      theme: null,
      detectedTheme: null,
    });
    useBroadcastStore.setState({
      mirrors: {},
      pips: {},
    });
  });

  it("clears selectedWorktree when refresh removes the selected worktree", async () => {
    const selectedWorktree = makeWorktree("feature-a");
    useProjectStore.setState({
      projects: [makeProject([selectedWorktree])],
      selectedWorktree,
      loading: false,
    });

    vi.mocked(tauri.refreshProject).mockResolvedValue(makeProject([]));

    await useProjectStore.getState().refreshProject("project-1");

    expect(useProjectStore.getState().selectedWorktree).toBeNull();
  });

  it("reconciles selectedWorktree to the refreshed project data", async () => {
    const selectedWorktree = makeWorktree("feature-a", "old-branch");
    const refreshedWorktree = {
      ...selectedWorktree,
      branch: "new-branch",
    };
    useProjectStore.setState({
      projects: [makeProject([selectedWorktree])],
      selectedWorktree,
      loading: false,
    });

    vi.mocked(tauri.refreshProject).mockResolvedValue(
      makeProject([refreshedWorktree]),
    );

    await useProjectStore.getState().refreshProject("project-1");

    expect(useProjectStore.getState().selectedWorktree).toEqual(refreshedWorktree);
    expect(useProjectStore.getState().selectedWorktree).not.toBe(
      selectedWorktree,
    );
  });

  it("upserts existing project entries when addProject returns an existing project", async () => {
    useProjectStore.setState({
      projects: [
        makeProjectWithId("project-1", {
          name: "old-name",
          sourcePath: "/tmp/source",
          url: "https://github.com/bang9/grove.git",
        }),
      ],
      selectedWorktree: null,
      loading: false,
    });

    const returnedProject = makeProjectWithId("project-1", {
      name: "grove",
      sourcePath: "/tmp/source",
      url: "git@github.com:bang9/grove.git",
    });
    vi.mocked(tauri.addProject).mockResolvedValue(returnedProject);

    await useProjectStore.getState().addProject("git@github.com:bang9/grove.git");

    expect(useProjectStore.getState().projects).toEqual([returnedProject]);
  });

  it("selects source worktree after removing the selected worktree", async () => {
    const selectedWorktree = makeWorktree("feature-a");
    useProjectStore.setState({
      projects: [makeProject([selectedWorktree])],
      selectedWorktree,
      loading: false,
    });

    useTerminalStore.setState({
      sessions: {
        [selectedWorktree.path]: makeLeaf("pane-feature", "pty-feature"),
        "/tmp/source": makeLeaf("pane-source", "pty-source"),
      },
      activeWorktree: selectedWorktree.path,
      focusedPtyId: "pty-feature",
    });
    vi.mocked(tauri.removeWorktree).mockResolvedValue();

    await useProjectStore.getState().removeWorktree("project-1", "feature-a");

    expect(useProjectStore.getState().selectedWorktree).toEqual({
      name: "source",
      path: "/tmp/source",
      branch: "main",
    });
    expect(useTerminalStore.getState().sessions[selectedWorktree.path]).toBeUndefined();
    expect(useTerminalStore.getState().activeWorktree).toBe("/tmp/source");
    expect(useTerminalStore.getState().focusedPtyId).toBe("pty-source");
  });

  it("clears broadcast state tied to a removed worktree", async () => {
    const selectedWorktree = makeWorktree("feature-a");
    useProjectStore.setState({
      projects: [makeProject([selectedWorktree])],
      selectedWorktree,
      loading: false,
    });
    useTerminalStore.setState({
      sessions: {
        [selectedWorktree.path]: makeLeaf("pane-feature", "pty-feature"),
      },
      activeWorktree: selectedWorktree.path,
      focusedPtyId: "pty-feature",
    });
    useBroadcastStore.getState().startMirror("pty-feature", "pane-feature", 120, 30);
    useBroadcastStore
      .getState()
      .startPip(selectedWorktree.path, "pty-feature", "pane-feature", 80, 24);
    vi.mocked(tauri.removeWorktree).mockResolvedValue();

    await useProjectStore.getState().removeWorktree("project-1", "feature-a");

    expect(useBroadcastStore.getState().mirrors["pty-feature"]).toBeUndefined();
    expect(useBroadcastStore.getState().pips[selectedWorktree.path]).toBeUndefined();
  });

  it("renames a project and updates state", async () => {
    useProjectStore.setState({
      projects: [makeProject([])],
      selectedWorktree: null,
      loading: false,
    });

    vi.mocked(tauri.renameProject).mockResolvedValue();

    await useProjectStore.getState().renameProject("project-1", "my-custom-name");

    const project = useProjectStore.getState().projects[0];
    expect(project.name).toBe("my-custom-name");
    expect(tauri.renameProject).toHaveBeenCalledWith("project-1", "my-custom-name");
  });

  it("keeps the current selection when removing a different worktree", async () => {
    const selectedWorktree = makeWorktree("feature-a");
    const otherWorktree = makeWorktree("feature-b");
    useProjectStore.setState({
      projects: [makeProject([selectedWorktree, otherWorktree])],
      selectedWorktree,
      loading: false,
    });

    vi.mocked(tauri.removeWorktree).mockResolvedValue();

    await useProjectStore.getState().removeWorktree("project-1", "feature-b");

    expect(useProjectStore.getState().selectedWorktree).toEqual(selectedWorktree);
  });
});
