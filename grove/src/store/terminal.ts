import { create } from "zustand";
import type { SplitNode, TerminalTheme } from "../types";

const LAYOUTS_KEY = "grove:terminal-layouts";

// ── Layout persistence helpers ──

/** Strip ptyIds from a SplitNode tree, keeping only the structure. */
function toLayoutTemplate(node: SplitNode): SplitNode {
  if (node.type === "leaf") return { type: "leaf" };
  return {
    type: node.type,
    children: node.children?.map(toLayoutTemplate),
  };
}

/** Count leaf nodes in a layout. */
function countLeaves(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countLeaves(c), 0);
}

/** Assign ptyIds from an array into a layout template's leaf nodes. */
function assignPtyIds(node: SplitNode, ids: string[]): SplitNode {
  if (node.type === "leaf") {
    return { type: "leaf", ptyId: ids.shift() };
  }
  return {
    type: node.type,
    children: node.children?.map((c) => assignPtyIds(c, ids)),
  };
}

function saveLayouts(sessions: Record<string, SplitNode>) {
  try {
    const templates: Record<string, SplitNode> = {};
    for (const [path, node] of Object.entries(sessions)) {
      templates[path] = toLayoutTemplate(node);
    }
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

function loadLayouts(): Record<string, SplitNode> {
  try {
    const raw = localStorage.getItem(LAYOUTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
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
  getSavedLayout: (worktreePath: string) => SplitNode | null;
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

  getSavedLayout: (worktreePath) => {
    const layouts = loadLayouts();
    const template = layouts[worktreePath];
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

  loadTheme: (theme) => set({ theme }),
}));

export { countLeaves, assignPtyIds };
