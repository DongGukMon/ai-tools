import { create } from "zustand";
import { savePanelLayouts, loadPanelLayouts } from "../lib/platform";

export interface GlobalTerminalTab {
  id: string;
  paneId: string;
  title: string;
}

interface GlobalTerminalLayout {
  collapsed: boolean;
  ratio: number;
  tabs: GlobalTerminalTab[];
  activeTabId: string;
}

interface PanelLayouts {
  main: number[];
  diff: number[];
  globalTerminal: GlobalTerminalLayout;
}

interface PanelLayoutStore {
  main: number[];
  diff: number[];
  globalTerminal: GlobalTerminalLayout;
  loaded: boolean;
  init: () => Promise<void>;
  updateMain: (ratios: number[]) => void;
  updateDiff: (ratios: number[]) => void;
  updateGlobalTerminal: (layout: Partial<GlobalTerminalLayout>) => void;
  addGlobalTerminalTab: () => GlobalTerminalTab;
  removeGlobalTerminalTab: (tabId: string) => void;
  setActiveGlobalTerminalTab: (tabId: string) => void;
  switchGlobalTerminalTab: (direction: "next" | "prev") => void;
}

const DEFAULTS: PanelLayouts = {
  main: [0.18, 0.52, 0.30],
  diff: [0.25, 0.20, 0.55],
  globalTerminal: { collapsed: true, ratio: 0.3, tabs: [], activeTabId: "" },
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(layouts: PanelLayouts) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    savePanelLayouts(JSON.stringify(layouts)).catch(() => {});
  }, 500);
}

function getFullLayouts(get: () => PanelLayoutStore): PanelLayouts {
  return { main: get().main, diff: get().diff, globalTerminal: get().globalTerminal };
}

// Accept legacy shape with optional paneId
interface LegacyGlobalTerminalLayout {
  collapsed?: boolean;
  ratio?: number;
  paneId?: string;
  tabs?: GlobalTerminalTab[];
  activeTabId?: string;
}

function resolveGlobalTerminalLayout(
  layout?: LegacyGlobalTerminalLayout,
): GlobalTerminalLayout {
  const collapsed = layout?.collapsed ?? DEFAULTS.globalTerminal.collapsed;
  const ratio = layout?.ratio ?? DEFAULTS.globalTerminal.ratio;

  // Migration: legacy paneId -> single tab
  if (layout?.paneId && (!layout.tabs || layout.tabs.length === 0)) {
    const tabId = crypto.randomUUID();
    return {
      collapsed,
      ratio,
      tabs: [{ id: tabId, paneId: layout.paneId, title: "Terminal 1" }],
      activeTabId: tabId,
    };
  }

  // Normal: use tabs if present
  if (layout?.tabs && layout.tabs.length > 0) {
    const activeTabId =
      layout.activeTabId &&
      layout.tabs.some((t) => t.id === layout.activeTabId)
        ? layout.activeTabId
        : layout.tabs[0].id;
    return { collapsed, ratio, tabs: layout.tabs, activeTabId };
  }

  // Default: create single tab
  const tabId = crypto.randomUUID();
  const paneId = crypto.randomUUID();
  return {
    collapsed,
    ratio,
    tabs: [{ id: tabId, paneId, title: "Terminal 1" }],
    activeTabId: tabId,
  };
}

function resolvePanelLayouts(parsed?: Partial<PanelLayouts>): PanelLayouts {
  return {
    main: parsed?.main ?? DEFAULTS.main,
    diff: parsed?.diff ?? DEFAULTS.diff,
    globalTerminal: resolveGlobalTerminalLayout(
      parsed?.globalTerminal as LegacyGlobalTerminalLayout | undefined,
    ),
  };
}

export const usePanelLayoutStore = create<PanelLayoutStore>((set, get) => ({
  main: DEFAULTS.main,
  diff: DEFAULTS.diff,
  globalTerminal: resolveGlobalTerminalLayout(DEFAULTS.globalTerminal),
  loaded: false,

  init: async () => {
    try {
      const raw = await loadPanelLayouts();
      const parsed = JSON.parse(raw) as Partial<PanelLayouts>;
      const resolved = resolvePanelLayouts(parsed);
      set({ ...resolved, loaded: true });
      debouncedSave(resolved);
    } catch {
      const resolved = resolvePanelLayouts();
      set({ ...resolved, loaded: true });
      debouncedSave(resolved);
    }
  },

  updateMain: (ratios) => {
    set({ main: ratios });
    debouncedSave({ ...getFullLayouts(get), main: ratios });
  },

  updateDiff: (ratios) => {
    set({ diff: ratios });
    debouncedSave({ ...getFullLayouts(get), diff: ratios });
  },

  updateGlobalTerminal: (layout) => {
    const updated = { ...get().globalTerminal, ...layout };
    set({ globalTerminal: updated });
    debouncedSave({ ...getFullLayouts(get), globalTerminal: updated });
  },

  addGlobalTerminalTab: () => {
    const gt = get().globalTerminal;
    const maxNum = gt.tabs.reduce((max, t) => {
      const m = t.title.match(/^Terminal (\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const tab: GlobalTerminalTab = {
      id: crypto.randomUUID(),
      paneId: crypto.randomUUID(),
      title: `Terminal ${maxNum + 1}`,
    };
    const updated: GlobalTerminalLayout = {
      ...gt,
      tabs: [...gt.tabs, tab],
      activeTabId: tab.id,
    };
    set({ globalTerminal: updated });
    debouncedSave({ ...getFullLayouts(get), globalTerminal: updated });
    return tab;
  },

  removeGlobalTerminalTab: (tabId) => {
    const gt = get().globalTerminal;
    if (gt.tabs.length <= 1) return;
    const idx = gt.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const newTabs = gt.tabs.filter((t) => t.id !== tabId);
    const newActiveId =
      gt.activeTabId === tabId
        ? newTabs[Math.max(0, idx - 1)].id
        : gt.activeTabId;
    const updated: GlobalTerminalLayout = {
      ...gt,
      tabs: newTabs,
      activeTabId: newActiveId,
    };
    set({ globalTerminal: updated });
    debouncedSave({ ...getFullLayouts(get), globalTerminal: updated });
  },

  setActiveGlobalTerminalTab: (tabId) => {
    const gt = get().globalTerminal;
    if (!gt.tabs.some((t) => t.id === tabId)) return;
    const updated: GlobalTerminalLayout = { ...gt, activeTabId: tabId };
    set({ globalTerminal: updated });
    debouncedSave({ ...getFullLayouts(get), globalTerminal: updated });
  },

  switchGlobalTerminalTab: (direction) => {
    const gt = get().globalTerminal;
    if (gt.tabs.length <= 1) return;
    const idx = gt.tabs.findIndex((t) => t.id === gt.activeTabId);
    const nextIdx =
      direction === "next"
        ? (idx + 1) % gt.tabs.length
        : (idx - 1 + gt.tabs.length) % gt.tabs.length;
    const updated: GlobalTerminalLayout = {
      ...gt,
      activeTabId: gt.tabs[nextIdx].id,
    };
    set({ globalTerminal: updated });
    debouncedSave({ ...getFullLayouts(get), globalTerminal: updated });
  },
}));
