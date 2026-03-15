import { create } from "zustand";
import type { FileStatus, CommitInfo, FileDiff } from "../types";
import * as tauri from "../lib/tauri";

interface DiffState {
  commits: CommitInfo[];
  fileStatuses: FileStatus[];
  currentDiff: FileDiff | null;
  commitDiffs: FileDiff[];
  selectedView: "changes" | CommitInfo;
  selectedFile: string | null;
  isViewingStaged: boolean;
  selectedLines: Set<number>;
  worktreePath: string | null;

  setWorktreePath: (path: string | null) => void;
  loadStatus: () => Promise<void>;
  loadCommits: () => Promise<void>;
  loadWorkingDiff: (path: string, staged?: boolean) => Promise<void>;
  loadCommitDiff: (hash: string) => Promise<void>;
  selectView: (view: "changes" | CommitInfo) => void;
  selectFile: (path: string | null, staged?: boolean) => void;
  selectLine: (index: number) => void;
  toggleLine: (index: number) => void;
  clearSelection: () => void;

  stageFile: (path: string) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  discardFile: (path: string) => Promise<void>;
  stageHunk: (path: string, hunkIndex: number) => Promise<void>;
  unstageHunk: (path: string, hunkIndex: number) => Promise<void>;
  discardHunk: (path: string, hunkIndex: number) => Promise<void>;
  stageLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
  unstageLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
  discardLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  commits: [],
  fileStatuses: [],
  currentDiff: null,
  commitDiffs: [],
  selectedView: "changes",
  selectedFile: null,
  isViewingStaged: false,
  selectedLines: new Set(),
  worktreePath: null,

  setWorktreePath: (path) => set({ worktreePath: path }),

  loadStatus: async () => {
    const wp = get().worktreePath;
    if (!wp) return;
    try {
      const fileStatuses = await tauri.getStatus(wp);
      set({ fileStatuses });
    } catch {
      /* ignore */
    }
  },

  loadCommits: async () => {
    const wp = get().worktreePath;
    if (!wp) return;
    try {
      const commits = await tauri.getCommits(wp, 50);
      set({ commits });
    } catch {
      /* ignore */
    }
  },

  loadWorkingDiff: async (path, staged = false) => {
    const wp = get().worktreePath;
    if (!wp) return;
    try {
      const queryPath = staged ? `staged:${path}` : path;
      const diff = await tauri.getWorkingDiff(wp, queryPath);
      set({ currentDiff: diff, selectedLines: new Set() });
    } catch {
      set({ currentDiff: null });
    }
  },

  loadCommitDiff: async (hash) => {
    const wp = get().worktreePath;
    if (!wp) return;
    try {
      const diffs = await tauri.getCommitDiff(wp, hash);
      set({
        commitDiffs: diffs,
        currentDiff: diffs[0] ?? null,
        selectedFile: diffs[0]?.path ?? null,
        selectedLines: new Set(),
      });
    } catch {
      set({ currentDiff: null });
    }
  },

  selectView: (view) => {
    set({
      selectedView: view,
      selectedFile: null,
      currentDiff: null,
      commitDiffs: [],
      selectedLines: new Set(),
    });
    if (view !== "changes") {
      get().loadCommitDiff(view.hash);
    }
  },

  selectFile: (path, staged = false) => {
    set({ selectedFile: path, isViewingStaged: staged, selectedLines: new Set() });
    if (path) {
      const state = get();
      if (state.selectedView === "changes") {
        state.loadWorkingDiff(path, staged);
      } else {
        // For commit view, find the diff from commitDiffs
        const diff = state.commitDiffs.find((d) => d.path === path);
        set({ currentDiff: diff ?? null });
      }
    } else {
      set({ currentDiff: null });
    }
  },

  selectLine: (index) => {
    set({ selectedLines: new Set([index]) });
  },

  toggleLine: (index) => {
    const prev = get().selectedLines;
    const next = new Set(prev);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    set({ selectedLines: next });
  },

  clearSelection: () => set({ selectedLines: new Set() }),

  // Refresh helpers
  ...createMutationActions(),
}));

function createMutationActions() {
  const refresh = async () => {
    const state = useDiffStore.getState();
    await state.loadStatus();
    if (state.selectedFile && state.selectedView === "changes") {
      await state.loadWorkingDiff(state.selectedFile, state.isViewingStaged);
    }
  };

  return {
    stageFile: async (path: string) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.stageFile(wp, path);
      await refresh();
    },
    unstageFile: async (path: string) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.unstageFile(wp, path);
      await refresh();
    },
    discardFile: async (path: string) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.discardFile(wp, path);
      await refresh();
    },
    stageHunk: async (path: string, hunkIndex: number) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.stageHunk(wp, path, hunkIndex);
      await refresh();
    },
    unstageHunk: async (path: string, hunkIndex: number) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.unstageHunk(wp, path, hunkIndex);
      await refresh();
    },
    discardHunk: async (path: string, hunkIndex: number) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.discardHunk(wp, path, hunkIndex);
      await refresh();
    },
    stageLines: async (
      path: string,
      hunkIndex: number,
      lineIndices: number[],
    ) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.stageLines(wp, path, hunkIndex, lineIndices);
      await refresh();
    },
    unstageLines: async (
      path: string,
      hunkIndex: number,
      lineIndices: number[],
    ) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.unstageLines(wp, path, hunkIndex, lineIndices);
      await refresh();
    },
    discardLines: async (
      path: string,
      hunkIndex: number,
      lineIndices: number[],
    ) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await tauri.discardLines(wp, path, hunkIndex, lineIndices);
      await refresh();
    },
  };
}
