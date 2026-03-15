import { create } from "zustand";
import type { Project, Worktree } from "../types";
import * as tauri from "../lib/tauri";

interface ProjectState {
  projects: Project[];
  selectedWorktree: Worktree | null;
  loading: boolean;

  loadProjects: () => Promise<void>;
  syncProjects: () => Promise<void>;
  addProject: (url: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  addWorktree: (projectId: string, name: string) => Promise<Worktree>;
  removeWorktree: (projectId: string, name: string) => Promise<void>;
  selectWorktree: (worktree: Worktree | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  selectedWorktree: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await tauri.listProjects();
      set({ projects });
    } finally {
      set({ loading: false });
    }
  },

  syncProjects: async () => {
    try {
      const projects = await tauri.listProjects();
      set({ projects });
    } catch {
      // Silent fail — background sync should not disrupt the UI
    }
  },

  addProject: async (url: string) => {
    const project = await tauri.addProject(url);
    set((state) => ({ projects: [...state.projects, project] }));
    return project;
  },

  removeProject: async (id: string) => {
    await tauri.removeProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedWorktree:
        state.selectedWorktree &&
        state.projects
          .find((p) => p.id === id)
          ?.worktrees.some((w) => w.path === state.selectedWorktree?.path)
          ? null
          : state.selectedWorktree,
    }));
  },

  addWorktree: async (projectId: string, name: string) => {
    const { projects } = useProjectStore.getState();
    const project = projects.find((p) => p.id === projectId);
    if (project?.worktrees.some((w) => w.name === name)) {
      throw new Error(`Worktree '${name}' already exists`);
    }
    const worktree = await tauri.addWorktree(projectId, name, name);
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
    await tauri.removeWorktree(projectId, name);
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, worktrees: p.worktrees.filter((w) => w.name !== name) }
          : p,
      ),
      selectedWorktree:
        state.selectedWorktree?.name === name ? null : state.selectedWorktree,
    }));
  },

  selectWorktree: (worktree: Worktree | null) => {
    set({ selectedWorktree: worktree });
  },
}));
