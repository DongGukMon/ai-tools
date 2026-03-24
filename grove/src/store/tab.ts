import { create } from "zustand";
import type { AppTab, AppTabType } from "../types";

export interface TabSession {
  tabs: AppTab[];
  activeTabId: string;
}

interface TabState {
  sessions: Record<string, TabSession>;
  activeWorktree: string | null;
  setActiveWorktree: (worktreePath: string | null) => void;
  addTab: (type: AppTabType, title: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  removeSession: (worktreePath: string) => void;
}

const TERMINAL_TAB: AppTab = {
  id: "terminal",
  type: "terminal",
  title: "Terminal",
  closable: false,
};

const CHANGES_TAB: AppTab = {
  id: "changes",
  type: "changes",
  title: "Changes",
  closable: false,
};

const DEFAULT_SESSION: TabSession = {
  tabs: [TERMINAL_TAB, CHANGES_TAB],
  activeTabId: "terminal",
};

function getSession(state: TabState): TabSession {
  const wt = state.activeWorktree;
  if (!wt) return DEFAULT_SESSION;
  return state.sessions[wt] ?? DEFAULT_SESSION;
}

function updateSession(
  state: TabState,
  updater: (session: TabSession) => TabSession,
): Partial<TabState> {
  const wt = state.activeWorktree;
  if (!wt) return {};
  const current = state.sessions[wt] ?? DEFAULT_SESSION;
  const updated = updater(current);
  if (updated === current) return {};
  return { sessions: { ...state.sessions, [wt]: updated } };
}

export const useTabStore = create<TabState>((set, get) => ({
  sessions: {},
  activeWorktree: null,

  setActiveWorktree: (worktreePath) => {
    const state = get();
    if (state.activeWorktree === worktreePath) return;
    // Single atomic set — ensure session exists with a fresh copy
    const sessions = worktreePath && !state.sessions[worktreePath]
      ? {
          ...state.sessions,
          [worktreePath]: {
            tabs: [...DEFAULT_SESSION.tabs],
            activeTabId: DEFAULT_SESSION.activeTabId,
          },
        }
      : state.sessions;
    set({ activeWorktree: worktreePath, sessions });
  },

  addTab: (type, title) => {
    const state = get();
    const session = getSession(state);

    // Changes tab is pinned — just activate it
    if (type === "changes") {
      set(updateSession(state, () => ({ ...session, activeTabId: "changes" })));
      return "changes";
    }

    const id = crypto.randomUUID();
    const tab: AppTab = { id, type, title, closable: true };
    set(updateSession(state, () => ({
      tabs: [...session.tabs, tab],
      activeTabId: id,
    })));
    return id;
  },

  closeTab: (tabId) =>
    set((state) => {
      const session = getSession(state);
      const tab = session.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return {};
      const tabIndex = session.tabs.findIndex((t) => t.id === tabId);
      const newTabs = session.tabs.filter((t) => t.id !== tabId);
      const wasActive = session.activeTabId === tabId;
      const newActiveTabId = wasActive
        ? newTabs[Math.min(tabIndex, newTabs.length - 1)].id
        : session.activeTabId;
      return updateSession(state, () => ({
        tabs: newTabs,
        activeTabId: newActiveTabId,
      }));
    }),

  setActiveTab: (tabId) =>
    set((state) => {
      const session = getSession(state);
      if (!session.tabs.some((t) => t.id === tabId)) return {};
      return updateSession(state, () => ({
        ...session,
        activeTabId: tabId,
      }));
    }),

  removeSession: (worktreePath) =>
    set((state) => {
      if (!state.sessions[worktreePath]) return {};
      const newSessions = { ...state.sessions };
      delete newSessions[worktreePath];
      return { sessions: newSessions };
    }),
}));

// Derived selectors for consumers
export function selectCurrentTabs(state: TabState): AppTab[] {
  return getSession(state).tabs;
}

export function selectCurrentActiveTabId(state: TabState): string {
  return getSession(state).activeTabId;
}
