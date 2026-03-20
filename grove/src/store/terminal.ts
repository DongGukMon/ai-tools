import { create } from "zustand";
import type { SplitNode, TerminalTheme } from "../types";
import {
  toLayoutTemplate,
  countLeaves,
  splitNode,
  removeNode,
  setSizesAtPath,
  findFirstLeaf,
  normalizeSplitTree,
} from "../lib/split-tree";
import { collectTerminalPanes } from "../lib/terminal-session";
import { loadTerminalLayouts, saveTerminalLayouts } from "../lib/platform";

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
    saveTerminalLayouts(JSON.stringify(layoutCache)).catch(console.error);
  }, 500);
}

// ── Store ──

export type ClaudeSessionStatus = "running" | "idle" | "attention";

interface TerminalState {
  sessions: Record<string, SplitNode>;
  activeWorktree: string | null;
  focusedPtyId: string | null;
  bellPtyIds: Set<string>;
  claudeStatus: Record<string, ClaudeSessionStatus>;
  theme: TerminalTheme | null;
  detectedTheme: TerminalTheme | null;
  createSession: (worktreePath: string, paneId: string, ptyId: string) => void;
  restoreSession: (worktreePath: string, node: SplitNode) => void;
  splitTerminal: (
    worktreePath: string,
    ptyId: string,
    direction: "horizontal" | "vertical",
    newPaneId: string,
    newPtyId: string,
  ) => void;
  closeTerminal: (worktreePath: string, ptyId: string) => void;
  setActiveWorktree: (worktreePath: string | null) => void;
  setFocusedPtyId: (ptyId: string | null) => void;
  markBellPty: (ptyId: string) => void;
  updateClaudeStatus: (
    ptyId: string,
    status: ClaudeSessionStatus | null,
  ) => void;
  setDetectedTheme: (theme: TerminalTheme) => void;
  loadTheme: (theme: TerminalTheme) => void;
  removeSession: (worktreePath: string) => void;
  updateSizes: (worktreePath: string, nodePath: number[], ratios: number[]) => void;
  getSavedLayout: (worktreePath: string) => SplitNode | null;
  initLayouts: () => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: {},
  activeWorktree: null,
  focusedPtyId: null,
  bellPtyIds: new Set<string>(),
  claudeStatus: {},
  theme: null,
  detectedTheme: null,

  getSavedLayout: (worktreePath) => {
    const template = layoutCache[worktreePath];
    if (!template || countLeaves(template) === 0) return null;
    return template;
  },

  createSession: (worktreePath, paneId, ptyId) =>
    set((state) => {
      const newSessions = {
        ...state.sessions,
        [worktreePath]: { id: paneId, type: "leaf" as const, ptyId },
      };
      saveLayouts(newSessions);
      return {
        sessions: newSessions,
        focusedPtyId: ptyId,
      };
    }),

  restoreSession: (worktreePath, node) =>
    set((state) => {
      const restored = normalizeSplitTree(node, () => crypto.randomUUID());
      const newSessions = { ...state.sessions, [worktreePath]: restored };
      saveLayouts(newSessions);
      return {
        sessions: newSessions,
        focusedPtyId: findFirstLeaf(restored),
      };
    }),

  splitTerminal: (worktreePath, ptyId, direction, newPaneId, newPtyId) =>
    set((state) => {
      const root = state.sessions[worktreePath];
      if (!root) return state;
      const newSessions = {
        ...state.sessions,
        [worktreePath]: splitNode(root, ptyId, direction, {
          branchId: crypto.randomUUID(),
          leafId: newPaneId,
          ptyId: newPtyId,
        }),
      };
      saveLayouts(newSessions);
      return { sessions: newSessions, focusedPtyId: newPtyId };
    }),

  removeSession: (worktreePath) =>
    set((state) => {
      const newSessions = { ...state.sessions };
      const nextBellPtyIds = new Set(state.bellPtyIds);
      const nextClaudeStatus = { ...state.claudeStatus };
      const existingSession = state.sessions[worktreePath];
      if (existingSession) {
        for (const { ptyId } of collectTerminalPanes(existingSession)) {
          if (ptyId) {
            nextBellPtyIds.delete(ptyId);
            delete nextClaudeStatus[ptyId];
          }
        }
      }
      delete newSessions[worktreePath];
      delete layoutCache[worktreePath];
      saveLayouts(newSessions);
      return {
        sessions: newSessions,
        bellPtyIds: nextBellPtyIds,
        claudeStatus: nextClaudeStatus,
        focusedPtyId:
          state.activeWorktree === worktreePath ? null : state.focusedPtyId,
        activeWorktree:
          state.activeWorktree === worktreePath ? null : state.activeWorktree,
      };
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
      const nextBellPtyIds = new Set(state.bellPtyIds);
      nextBellPtyIds.delete(ptyId);
      const nextClaudeStatus = { ...state.claudeStatus };
      delete nextClaudeStatus[ptyId];
      return {
        sessions: newSessions,
        focusedPtyId: newFocused,
        bellPtyIds: nextBellPtyIds,
        claudeStatus: nextClaudeStatus,
      };
    }),

  setActiveWorktree: (worktreePath) =>
    set((state) => {
      const newFocused = worktreePath
        ? (state.sessions[worktreePath]
            ? findFirstLeaf(state.sessions[worktreePath])
            : null)
        : null;
      const nextBellPtyIds = new Set(state.bellPtyIds);
      if (worktreePath && state.sessions[worktreePath]) {
        for (const { ptyId } of collectTerminalPanes(state.sessions[worktreePath])) {
          if (ptyId) {
            nextBellPtyIds.delete(ptyId);
          }
        }
      }
      return {
        activeWorktree: worktreePath,
        focusedPtyId: newFocused,
        bellPtyIds: nextBellPtyIds,
      };
    }),

  setFocusedPtyId: (ptyId) => set({ focusedPtyId: ptyId }),

  markBellPty: (ptyId) =>
    set((state) => {
      if (state.bellPtyIds.has(ptyId)) {
        return state;
      }

      return {
        bellPtyIds: new Set(state.bellPtyIds).add(ptyId),
      };
    }),

  updateClaudeStatus: (ptyId, status) =>
    set((state) => {
      if (status) {
        if (state.claudeStatus[ptyId] === status) return state;
        return { claudeStatus: { ...state.claudeStatus, [ptyId]: status } };
      }
      if (!(ptyId in state.claudeStatus)) return state;
      const next = { ...state.claudeStatus };
      delete next[ptyId];
      return { claudeStatus: next };
    }),

  updateSizes: (worktreePath, nodePath, ratios) =>
    set((state) => {
      const root = state.sessions[worktreePath];
      if (!root) return state;
      const updated = setSizesAtPath(root, nodePath, ratios);
      const newSessions = { ...state.sessions, [worktreePath]: updated };
      saveLayouts(newSessions);
      return { sessions: newSessions };
    }),

  setDetectedTheme: (theme) => set({ detectedTheme: theme }),
  loadTheme: (theme) => set({ theme }),

  initLayouts: async () => {
    try {
      const raw = await loadTerminalLayouts();
      const parsed = JSON.parse(raw) as Record<string, SplitNode>;
      layoutCache = Object.fromEntries(
        Object.entries(parsed).map(([worktreePath, node]) => [
          worktreePath,
          normalizeSplitTree(node, () => crypto.randomUUID()),
        ]),
      );
    } catch {
      layoutCache = {};
    }
  },
}));

export { countLeaves, assignPtyIds } from "../lib/split-tree";
