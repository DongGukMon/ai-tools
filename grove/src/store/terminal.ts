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

export type AiTool = "claude" | "codex";
export type AiStatus = "running" | "idle" | "attention";
export interface AiSession { tool: AiTool; status: AiStatus; }

/** @deprecated Use AiSession instead */
export type ClaudeSessionStatus = AiStatus;

interface TerminalState {
  sessions: Record<string, SplitNode>;
  activeWorktree: string | null;
  focusedPtyId: string | null;
  bellPtyIds: Set<string>;
  aiSessions: Record<string, AiSession>;
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
  updateAiStatus: (ptyId: string, raw: string | null) => void;
  setDetectedTheme: (theme: TerminalTheme) => void;
  loadTheme: (theme: TerminalTheme) => void;
  removeSession: (worktreePath: string, nextActiveWorktree?: string | null) => void;
  updateSizes: (worktreePath: string, nodePath: number[], ratios: number[]) => void;
  getSavedLayout: (worktreePath: string) => SplitNode | null;
  initLayouts: () => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: {},
  activeWorktree: null,
  focusedPtyId: null,
  bellPtyIds: new Set<string>(),
  aiSessions: {},
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

  removeSession: (worktreePath, nextActiveWorktree = null) =>
    set((state) => {
      const newSessions = { ...state.sessions };
      const nextBellPtyIds = new Set(state.bellPtyIds);
      let nextAiSessions = { ...state.aiSessions };
      const existingSession = state.sessions[worktreePath];
      if (existingSession) {
        for (const { ptyId } of collectTerminalPanes(existingSession)) {
          if (ptyId) {
            nextBellPtyIds.delete(ptyId);
            delete nextAiSessions[ptyId];
          }
        }
      }
      delete newSessions[worktreePath];
      delete layoutCache[worktreePath];
      saveLayouts(newSessions);

      const shouldSwitchActiveWorktree = state.activeWorktree === worktreePath;
      const resolvedActiveWorktree = shouldSwitchActiveWorktree
        ? nextActiveWorktree
        : state.activeWorktree;
      const activeSession = resolvedActiveWorktree
        ? newSessions[resolvedActiveWorktree]
        : undefined;

      if (activeSession) {
        for (const { ptyId } of collectTerminalPanes(activeSession)) {
          if (!ptyId) {
            continue;
          }
          nextBellPtyIds.delete(ptyId);
          const session = nextAiSessions[ptyId];
          if (session?.status === "attention") {
            nextAiSessions[ptyId] = { ...session, status: "idle" };
          }
        }
      }

      return {
        sessions: newSessions,
        bellPtyIds: nextBellPtyIds,
        aiSessions: nextAiSessions,
        focusedPtyId: shouldSwitchActiveWorktree
          ? (activeSession ? findFirstLeaf(activeSession) : null)
          : state.focusedPtyId,
        activeWorktree: resolvedActiveWorktree,
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
      const nextAiSessions = { ...state.aiSessions };
      delete nextAiSessions[ptyId];
      return {
        sessions: newSessions,
        focusedPtyId: newFocused,
        bellPtyIds: nextBellPtyIds,
        aiSessions: nextAiSessions,
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
      let nextAiSessions = state.aiSessions;
      if (worktreePath && state.sessions[worktreePath]) {
        for (const { ptyId } of collectTerminalPanes(state.sessions[worktreePath])) {
          if (ptyId) {
            nextBellPtyIds.delete(ptyId);
            const session = state.aiSessions[ptyId];
            if (session?.status === "attention") {
              if (nextAiSessions === state.aiSessions) {
                nextAiSessions = { ...state.aiSessions };
              }
              nextAiSessions[ptyId] = { ...session, status: "idle" };
            }
          }
        }
      }
      return {
        activeWorktree: worktreePath,
        focusedPtyId: newFocused,
        bellPtyIds: nextBellPtyIds,
        aiSessions: nextAiSessions,
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

  updateAiStatus: (ptyId, raw) =>
    set((state) => {
      if (raw) {
        const [tool, status] = raw.split(":") as [AiTool, AiStatus];
        if (!tool || !status) return state;
        const prev = state.aiSessions[ptyId];
        if (prev && prev.tool === tool && prev.status === status) return state;
        return { aiSessions: { ...state.aiSessions, [ptyId]: { tool, status } } };
      }
      if (!(ptyId in state.aiSessions)) return state;
      const next = { ...state.aiSessions };
      delete next[ptyId];
      return { aiSessions: next };
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
