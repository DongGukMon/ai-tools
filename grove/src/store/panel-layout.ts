import { create } from "zustand";
import { savePanelLayouts, loadPanelLayouts } from "../lib/platform";

interface GlobalTerminalLayout {
  collapsed: boolean;
  ratio: number;
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
}

const DEFAULTS: PanelLayouts = {
  main: [0.18, 0.52, 0.30],
  diff: [0.25, 0.20, 0.55],
  globalTerminal: { collapsed: true, ratio: 0.3 },
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

export const usePanelLayoutStore = create<PanelLayoutStore>((set, get) => ({
  main: DEFAULTS.main,
  diff: DEFAULTS.diff,
  globalTerminal: DEFAULTS.globalTerminal,
  loaded: false,

  init: async () => {
    try {
      const raw = await loadPanelLayouts();
      const parsed = JSON.parse(raw) as Partial<PanelLayouts>;
      set({
        main: parsed.main ?? DEFAULTS.main,
        diff: parsed.diff ?? DEFAULTS.diff,
        globalTerminal: parsed.globalTerminal ?? DEFAULTS.globalTerminal,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
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
    const merged = { ...get().globalTerminal, ...layout };
    set({ globalTerminal: merged });
    debouncedSave({ ...getFullLayouts(get), globalTerminal: merged });
  },
}));
