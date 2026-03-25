import { create } from "zustand";
import type { FileStatus, CommitInfo, FileDiff } from "../types";
import * as tauri from "../lib/platform";
import { runCommandSafely, runCommand } from "../lib/command";
import { useToastStore } from "../store/toast";

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
  behindCount: number;
  merging: boolean;

  setWorktreePath: (path: string | null) => void;
  loadStatus: () => Promise<void>;
  loadCommits: () => Promise<void>;
  loadBehindCount: () => Promise<void>;
  mergeDefaultBranch: () => Promise<void>;
  loadWorkingDiff: (path: string, staged?: boolean) => Promise<void>;
  loadCommitDiff: (hash: string) => Promise<void>;
  selectView: (view: "changes" | CommitInfo) => void;
  selectFile: (path: string | null, staged?: boolean) => void;
  selectLine: (index: number) => void;
  toggleLine: (index: number) => void;
  selectLineRange: (start: number, end: number) => void;
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
  behindCount: 0,
  merging: false,

  setWorktreePath: (path) => {
    if (path === get().worktreePath) return;
    set({
      worktreePath: path,
      fileStatuses: [],
      commits: [],
      currentDiff: null,
      commitDiffs: [],
      selectedView: "changes",
      selectedFile: null,
      isViewingStaged: false,
      selectedLines: new Set(),
      behindCount: 0,
    });
  },

  loadStatus: async () => {
    const wp = get().worktreePath;
    if (!wp) return;
    const fileStatuses = await runCommandSafely(() => tauri.getStatus(wp), {
      errorToast: false,
    });
    if (fileStatuses) {
      set({ fileStatuses });
    }
  },

  loadCommits: async () => {
    const wp = get().worktreePath;
    if (!wp) return;
    const commits = await runCommandSafely(() => tauri.getCommits(wp, 50), {
      errorToast: false,
    });
    if (commits) {
      set({ commits });
    }
  },

  loadBehindCount: async () => {
    const wp = get().worktreePath;
    if (!wp) return;
    const info = await runCommandSafely(() => tauri.getBehindCount(wp), {
      errorToast: false,
    });
    if (info) {
      set({ behindCount: info.behind });
    }
  },

  mergeDefaultBranch: async () => {
    const wp = get().worktreePath;
    if (!wp) return;
    set({ merging: true });
    try {
      await runCommand(() => tauri.mergeDefaultBranch(wp), {
        errorToast: "Merge conflict — resolve in terminal",
      });
      useToastStore.getState().addToast("success", "Merged default branch");
      await get().loadCommits();
      await get().loadStatus();
      await get().loadBehindCount();
    } catch {
      // Error toast already shown by runCommand
    } finally {
      set({ merging: false });
    }
  },

  loadWorkingDiff: async (path, staged = false) => {
    const wp = get().worktreePath;
    if (!wp) return;
    const queryPath = staged ? `staged:${path}` : path;
    const diff = await runCommandSafely(() => tauri.getWorkingDiff(wp, queryPath), {
      errorToast: false,
    });
    if (diff) {
      set({ currentDiff: diff, selectedLines: new Set() });
    } else {
      set({ currentDiff: null });
    }
  },

  loadCommitDiff: async (hash) => {
    const wp = get().worktreePath;
    if (!wp) return;
    const diffs = await runCommandSafely(() => tauri.getCommitDiff(wp, hash), {
      errorToast: false,
    });
    if (diffs) {
      set({
        commitDiffs: diffs,
        currentDiff: diffs[0] ?? null,
        selectedFile: diffs[0]?.path ?? null,
        selectedLines: new Set(),
      });
    } else {
      set({ currentDiff: null });
    }
  },

  selectView: (view) => {
    if (view === "changes") {
      set({
        selectedView: view,
        selectedFile: null,
        currentDiff: null,
        commitDiffs: [],
        selectedLines: new Set(),
      });
      // Auto-select first file
      const { fileStatuses } = get();
      if (fileStatuses.length > 0) {
        get().selectFile(fileStatuses[0].path, fileStatuses[0].staged);
      }
    } else {
      // Switch view immediately but keep previous data visible until load completes
      set({ selectedView: view, selectedLines: new Set() });
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

  selectLineRange: (start, end) => {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    const next = new Set<number>();
    for (let i = min; i <= max; i++) {
      next.add(i);
    }
    set({ selectedLines: next });
  },

  clearSelection: () => set({ selectedLines: new Set() }),

  // Refresh helpers
  ...createMutationActions(),
}));

function createMutationActions() {
  const runMutation = async (
    action: () => Promise<void>,
    errorToast: string,
  ) => {
    await runCommandSafely(action, { errorToast });
  };

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
      await runMutation(async () => {
        await tauri.stageFile(wp, path);
        await refresh();
      }, "Failed to stage file");
    },
    unstageFile: async (path: string) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.unstageFile(wp, path);
        await refresh();
      }, "Failed to unstage file");
    },
    discardFile: async (path: string) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.discardFile(wp, path);
        await refresh();
      }, "Failed to discard file");
    },
    stageHunk: async (path: string, hunkIndex: number) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.stageHunk(wp, path, hunkIndex);
        await refresh();
      }, "Failed to stage hunk");
    },
    unstageHunk: async (path: string, hunkIndex: number) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.unstageHunk(wp, path, hunkIndex);
        await refresh();
      }, "Failed to unstage hunk");
    },
    discardHunk: async (path: string, hunkIndex: number) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.discardHunk(wp, path, hunkIndex);
        await refresh();
      }, "Failed to discard hunk");
    },
    stageLines: async (
      path: string,
      hunkIndex: number,
      lineIndices: number[],
    ) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.stageLines(wp, path, hunkIndex, lineIndices);
        await refresh();
      }, "Failed to stage selected lines");
    },
    unstageLines: async (
      path: string,
      hunkIndex: number,
      lineIndices: number[],
    ) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.unstageLines(wp, path, hunkIndex, lineIndices);
        await refresh();
      }, "Failed to unstage selected lines");
    },
    discardLines: async (
      path: string,
      hunkIndex: number,
      lineIndices: number[],
    ) => {
      const wp = useDiffStore.getState().worktreePath;
      if (!wp) return;
      await runMutation(async () => {
        await tauri.discardLines(wp, path, hunkIndex, lineIndices);
        await refresh();
      }, "Failed to discard selected lines");
    },
  };
}
