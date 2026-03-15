import { create } from "zustand";
import type { SplitNode, TerminalTheme } from "../types";
import {
  toLayoutTemplate,
  countLeaves,
  splitNode,
  removeNode,
  setSizesAtPath,
  findFirstLeaf,
} from "../lib/split-tree";

// In-memory cache populated at startup via initLayouts()
let layoutCache: Record<string, SplitNode> = {};

// Debounced save to Rust file backend — MERGES with existing saved layouts
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveLayouts(sessions: Record<string, SplitNode>) {
  // Merge current sessions into existing cache (don't wipe other worktree layouts)
  for (const [path, node] of Object.entries(sessions)) {
    layoutCache[path] = toLayoutTemplate(node);
  }
  // Remove layouts for sessions that were explicitly deleted (0 leaves)
  for (const path of Object.keys(layoutCache)) {
    if (sessions[path] === undefined && Object.keys(sessions).length > 0) {
      // Don't delete — session might just not be active right now
    }
  }

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    import("../lib/tauri").then(({ saveTerminalLayouts }) => {
      saveTerminalLayouts(JSON.stringify(layoutCache)).catch(console.error);
    });
  }, 500);
}

// ── Store ──

interface TerminalState {
  sessions: Record<string, SplitNode>;
  activeWorktree: string | null;
  focusedPtyId: string | null;
  theme: TerminalTheme | null;
  createSession: (worktreePath: string, ptyId: string) => void;
  restoreSession: (worktreePath: string, node: SplitNode) => void;
  splitTerminal: (
    worktreePath: string,
    ptyId: string,
    direction: "horizontal" | "vertical",
    newPtyId: string,
  ) => void;
  closeTerminal: (worktreePath: string, ptyId: string) => void;
  setActiveWorktree: (worktreePath: string | null) => void;
  setFocusedPtyId: (ptyId: string | null) => void;
  loadTheme: (theme: TerminalTheme) => void;
  updateSizes: (worktreePath: string, nodePath: number[], sizes: number[]) => void;
  getSavedLayout: (worktreePath: string) => SplitNode | null;
  initLayouts: () => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: {},
  activeWorktree: null,
  focusedPtyId: null,
  theme: null,

  getSavedLayout: (worktreePath) => {
    const template = layoutCache[worktreePath];
    if (!template || countLeaves(template) <= 1) return null;
    return template;
  },

  createSession: (worktreePath, ptyId) =>
    set((state) => {
      const newSessions = {
        ...state.sessions,
        [worktreePath]: { type: "leaf" as const, ptyId },
      };
      saveLayouts(newSessions);
      return { sessions: newSessions, focusedPtyId: ptyId };
    }),

  restoreSession: (worktreePath, node) =>
    set((state) => {
      const newSessions = { ...state.sessions, [worktreePath]: node };
      saveLayouts(newSessions);
      return {
        sessions: newSessions,
        focusedPtyId: findFirstLeaf(node),
      };
    }),

  splitTerminal: (worktreePath, ptyId, direction, newPtyId) =>
    set((state) => {
      const root = state.sessions[worktreePath];
      if (!root) return state;
      const newSessions = {
        ...state.sessions,
        [worktreePath]: splitNode(root, ptyId, direction, newPtyId),
      };
      saveLayouts(newSessions);
      return { sessions: newSessions, focusedPtyId: newPtyId };
    }),

  closeTerminal: (worktreePath, ptyId) =>
    set((state) => {
      const root = state.sessions[worktreePath];
      if (!root) return state;
      const updated = removeNode(root, ptyId);
      const newSessions = { ...state.sessions };
      if (updated) {
        newSessions[worktreePath] = updated;
      } else {
        delete newSessions[worktreePath];
      }
      saveLayouts(newSessions);
      const newFocused =
        state.focusedPtyId === ptyId
          ? updated
            ? findFirstLeaf(updated)
            : null
          : state.focusedPtyId;
      return { sessions: newSessions, focusedPtyId: newFocused };
    }),

  setActiveWorktree: (worktreePath) =>
    set((state) => {
      const newFocused = worktreePath
        ? (state.sessions[worktreePath]
            ? findFirstLeaf(state.sessions[worktreePath])
            : null)
        : null;
      return { activeWorktree: worktreePath, focusedPtyId: newFocused };
    }),

  setFocusedPtyId: (ptyId) => set({ focusedPtyId: ptyId }),

  updateSizes: (worktreePath, nodePath, sizes) =>
    set((state) => {
      const root = state.sessions[worktreePath];
      if (!root) return state;
      // Convert pixel sizes to ratios (0-1) for resolution independence
      const total = sizes.reduce((a, b) => a + b, 0);
      const ratios = total > 0 ? sizes.map((s) => s / total) : sizes;
      const updated = setSizesAtPath(root, nodePath, ratios);
      const newSessions = { ...state.sessions, [worktreePath]: updated };
      saveLayouts(newSessions);
      return { sessions: newSessions };
    }),

  loadTheme: (theme) => set({ theme }),

  initLayouts: async () => {
    try {
      const { loadTerminalLayouts } = await import("../lib/tauri");
      const raw = await loadTerminalLayouts();
      layoutCache = JSON.parse(raw);
    } catch {
      layoutCache = {};
    }
  },
}));

export { countLeaves, assignPtyIds } from "../lib/split-tree";
