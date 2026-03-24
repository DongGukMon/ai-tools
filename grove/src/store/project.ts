import { create } from "zustand";
import { unstable_batchedUpdates } from "react-dom";
import type { Project, Worktree } from "../types";
import * as tauri from "../lib/platform";
import { runCommand, runCommandSafely } from "../lib/command";
import { useTerminalStore } from "./terminal";

interface ProjectState {
  projects: Project[];
  selectedWorktree: Worktree | null;
  loading: boolean;

  loadProjects: () => Promise<void>;
  syncProjects: () => Promise<void>;
  refreshProject: (id: string) => Promise<Project>;
  addProject: (url: string) => Promise<Project>;
  reorderProjects: (projectIds: string[]) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  addWorktree: (projectId: string, name: string) => Promise<Worktree>;
  removeWorktree: (projectId: string, name: string) => Promise<void>;
  selectWorktree: (worktree: Worktree | null) => void;
  setWorktreeOrder: (projectId: string, order: string[]) => Promise<void>;
}

function normalizeProjectUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
}

function sameProjectIdentity(left: Project, right: Project): boolean {
  return (
    left.id === right.id ||
    left.sourcePath === right.sourcePath ||
    normalizeProjectUrl(left.url) === normalizeProjectUrl(right.url)
  );
}

function upsertProject(projects: Project[], project: Project): Project[] {
  let replaced = false;
  const nextProjects = projects.map((existing) => {
    if (sameProjectIdentity(existing, project)) {
      replaced = true;
      return project;
    }
    return existing;
  });

  return replaced ? nextProjects : [...nextProjects, project];
}

function sameWorktreeValue(left: Worktree, right: Worktree): boolean {
  return (
    left.path === right.path &&
    left.name === right.name &&
    left.branch === right.branch
  );
}

function reconcileSelectedWorktree(
  projects: Project[],
  selectedWorktree: Worktree | null,
): Worktree | null {
  if (!selectedWorktree) {
    return null;
  }

  for (const project of projects) {
    if (project.sourcePath === selectedWorktree.path) {
      return selectedWorktree;
    }
    const match = project.worktrees.find(
      (worktree) => worktree.path === selectedWorktree.path,
    );
    if (match) {
      return sameWorktreeValue(match, selectedWorktree)
        ? selectedWorktree
        : match;
    }
  }

  return null;
}

function reorderWorktrees(worktrees: Worktree[], order: string[]): Worktree[] {
  const ordered: Worktree[] = [];
  const remaining = [...worktrees];
  for (const name of order) {
    const idx = remaining.findIndex((wt) => wt.name === name);
    if (idx !== -1) ordered.push(...remaining.splice(idx, 1));
  }
  return [...ordered, ...remaining];
}

function sourceWorktreeForProject(project: Project): Worktree {
  return {
    name: "source",
    path: project.sourcePath,
    branch: "main",
  };
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  selectedWorktree: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await runCommandSafely(() => tauri.listProjects(), {
        errorToast: "Failed to load projects",
      });
      if (projects) {
        set((state) => ({
          projects,
          selectedWorktree: reconcileSelectedWorktree(
            projects,
            state.selectedWorktree,
          ),
        }));
      }
    } finally {
      set({ loading: false });
    }
  },

  syncProjects: async () => {
    const projects = await runCommandSafely(() => tauri.listProjects(), {
      errorToast: false,
    });
    if (projects) {
      set((state) => ({
        projects,
        selectedWorktree: reconcileSelectedWorktree(
          projects,
          state.selectedWorktree,
        ),
      }));
    }
  },

  refreshProject: async (id: string) => {
    const project = await runCommand(() => tauri.refreshProject(id), {
      errorToast: "Failed to refresh project",
    });
    set((state) => ({
      projects: upsertProject(state.projects, project),
      selectedWorktree: reconcileSelectedWorktree(
        upsertProject(state.projects, project),
        state.selectedWorktree,
      ),
    }));
    return project;
  },

  addProject: async (url: string) => {
    const project = await runCommand(() => tauri.addProject(url), {
      errorToast: "Failed to add project",
    });
    set((state) => ({ projects: upsertProject(state.projects, project) }));
    return project;
  },

  reorderProjects: async (projectIds: string[]) => {
    set((state) => {
      const projectMap = new Map(state.projects.map((p) => [p.id, p]));
      const reordered = projectIds
        .map((id) => projectMap.get(id))
        .filter((p): p is Project => p != null);
      return { projects: reordered };
    });
    await runCommandSafely(() => tauri.reorderProjects(projectIds), {
      errorToast: false,
    });
  },

  removeProject: async (id: string) => {
    await runCommand(() => tauri.removeProject(id), {
      errorToast: "Failed to remove project",
    });
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedWorktree: reconcileSelectedWorktree(
        state.projects.filter((p) => p.id !== id),
        state.selectedWorktree,
      ),
    }));
  },

  addWorktree: async (projectId: string, name: string) => {
    const worktree = await runCommand(async () => {
      const { projects } = useProjectStore.getState();
      const project = projects.find((p) => p.id === projectId);
      if (project?.worktrees.some((w) => w.name === name)) {
        throw new Error(`Worktree '${name}' already exists`);
      }

      return tauri.addWorktree(projectId, name, name);
    }, {
      errorToast: "Failed to create worktree",
    });
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, worktrees: [...p.worktrees, worktree] }
          : p,
      ),
    }));
    return worktree;
  },

  removeWorktree: async (projectId: string, name: string) => {
    const project = useProjectStore
      .getState()
      .projects.find((p) => p.id === projectId);
    const removedWorktree = project?.worktrees.find((w) => w.name === name);
    const worktreePath = removedWorktree?.path;

    await runCommand(() => tauri.removeWorktree(projectId, name), {
      errorToast: "Failed to remove worktree",
    });

    const currentState = useProjectStore.getState();
    const nextProjects = currentState.projects.map((p) =>
      p.id === projectId
        ? { ...p, worktrees: p.worktrees.filter((w) => w.name !== name) }
        : p,
    );
    const nextProject = nextProjects.find((p) => p.id === projectId);
    const removedSelected =
      currentState.selectedWorktree != null &&
      currentState.selectedWorktree.path === worktreePath;
    const nextSelectedWorktree =
      removedSelected && nextProject
        ? sourceWorktreeForProject(nextProject)
        : reconcileSelectedWorktree(nextProjects, currentState.selectedWorktree);

    unstable_batchedUpdates(() => {
      if (worktreePath) {
        useTerminalStore
          .getState()
          .removeSession(worktreePath, nextSelectedWorktree?.path ?? null);
      }

      set({
        projects: nextProjects,
        selectedWorktree: nextSelectedWorktree,
      });
    });
  },

  selectWorktree: (worktree: Worktree | null) => {
    set({ selectedWorktree: worktree });
  },

  // Phase 2: 드래그 재정렬 완료 시 호출. 순서를 config에 저장하고 즉시 UI에 반영.
  setWorktreeOrder: async (projectId: string, order: string[]) => {
    await runCommand(() => tauri.setWorktreeOrder(projectId, order), {
      errorToast: "Failed to save worktree order",
    });
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, worktrees: reorderWorktrees(p.worktrees, order) }
          : p,
      ),
    }));
  },
}));
