import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Worktree } from "../types";

const runCommandMock = vi.fn();
const runCommandSafelyMock = vi.fn();

vi.mock("../lib/command", () => ({
  runCommand: (...args: Parameters<typeof runCommandMock>) =>
    runCommandMock(...args),
  runCommandSafely: (...args: Parameters<typeof runCommandSafelyMock>) =>
    runCommandSafelyMock(...args),
}));

vi.mock("../lib/tauri", () => ({
  listProjects: vi.fn(),
  refreshProject: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  addWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

import * as tauri from "../lib/tauri";
import { useProjectStore } from "./project";

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
    sourceDirty: false,
    worktrees,
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
    useProjectStore.setState({
      projects: [],
      selectedWorktree: null,
      loading: false,
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
});
