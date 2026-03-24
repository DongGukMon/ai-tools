import { create } from "zustand";
import type { AppTab, AppTabType } from "../types";

interface TabState {
  tabs: AppTab[];
  activeTabId: string;
  addTab: (type: AppTabType, title: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
}

const TERMINAL_TAB: AppTab = {
  id: "terminal",
  type: "terminal",
  title: "Terminal",
  closable: false,
};

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [TERMINAL_TAB],
  activeTabId: "terminal",

  addTab: (type, title) => {
    const { tabs } = get();
    if (type === "changes") {
      const existing = tabs.find((t) => t.type === "changes");
      if (existing) {
        set({ activeTabId: existing.id });
        return existing.id;
      }
    }
    const id = crypto.randomUUID();
    const tab: AppTab = { id, type, title, closable: true };
    set({ tabs: [...tabs, tab], activeTabId: id });
    return id;
  },

  closeTab: (tabId) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return state;
      const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      const wasActive = state.activeTabId === tabId;
      const newActiveTabId = wasActive
        ? newTabs[Math.min(tabIndex, newTabs.length - 1)].id
        : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveTabId };
    }),

  setActiveTab: (tabId) =>
    set((state) => {
      if (!state.tabs.some((t) => t.id === tabId)) return state;
      return { activeTabId: tabId };
    }),
}));
