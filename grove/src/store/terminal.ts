import { create } from "zustand";
import type { SplitNode, TerminalTheme } from "../types";

interface TerminalState {
  sessions: Record<string, SplitNode>;
  activeWorktree: string | null;
  focusedPtyId: string | null;
  theme: TerminalTheme | null;
  createSession: (worktreePath: string, ptyId: string) => void;
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
}

function splitNode(
  node: SplitNode,
  targetPtyId: string,
  direction: "horizontal" | "vertical",
  newPtyId: string,
): SplitNode {
  if (node.type === "leaf" && node.ptyId === targetPtyId) {
    return {
      type: direction,
      children: [
        { type: "leaf", ptyId: targetPtyId },
        { type: "leaf", ptyId: newPtyId },
      ],
    };
  }
  if (node.children) {
    const newChildren = node.children.map((child) =>
      splitNode(child, targetPtyId, direction, newPtyId),
    );
    if (newChildren.some((c, i) => c !== node.children![i])) {
      return { ...node, children: newChildren };
    }
  }
  return node;
}

function removeNode(node: SplitNode, targetPtyId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.ptyId === targetPtyId ? null : node;
  }
  if (!node.children) return node;

  const filtered = node.children
    .map((child) => removeNode(child, targetPtyId))
    .filter((child): child is SplitNode => child !== null);

  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];
  return { ...node, children: filtered };
}

function findFirstLeaf(node: SplitNode): string | null {
  if (node.type === "leaf") return node.ptyId ?? null;
  if (node.children) {
    for (const child of node.children) {
      const id = findFirstLeaf(child);
      if (id) return id;
    }
  }
  return null;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: {},
  activeWorktree: null,
  focusedPtyId: null,
  theme: null,

  createSession: (worktreePath, ptyId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [worktreePath]: { type: "leaf", ptyId },
      },
      focusedPtyId: ptyId,
    })),

  splitTerminal: (worktreePath, ptyId, direction, newPtyId) =>
    set((state) => {
      const root = state.sessions[worktreePath];
      if (!root) return state;
      return {
        sessions: {
          ...state.sessions,
          [worktreePath]: splitNode(root, ptyId, direction, newPtyId),
        },
        focusedPtyId: newPtyId,
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

  loadTheme: (theme) => set({ theme }),
}));
