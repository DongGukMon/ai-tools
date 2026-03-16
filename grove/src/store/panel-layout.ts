import { create } from "zustand";
import { savePanelLayouts, loadPanelLayouts } from "../lib/platform";

interface PanelLayouts {
  main: number[];
  diff: number[];
}

interface PanelLayoutStore {
  main: number[];
  diff: number[];
  loaded: boolean;
  init: () => Promise<void>;
  updateMain: (sizes: number[]) => void;
  updateDiff: (sizes: number[]) => void;
}

const DEFAULTS: PanelLayouts = {
  main: [0.18, 0.52, 0.30],
  diff: [0.25, 0.20, 0.55],
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(layouts: PanelLayouts) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    savePanelLayouts(JSON.stringify(layouts)).catch(() => {});
  }, 500);
}

function toRatios(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  return total > 0 ? sizes.map((s) => s / total) : sizes;
}

export const usePanelLayoutStore = create<PanelLayoutStore>((set, get) => ({
  main: DEFAULTS.main,
  diff: DEFAULTS.diff,
  loaded: false,

  init: async () => {
    try {
      const raw = await loadPanelLayouts();
      const parsed = JSON.parse(raw) as Partial<PanelLayouts>;
      set({
        main: parsed.main ?? DEFAULTS.main,
        diff: parsed.diff ?? DEFAULTS.diff,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  updateMain: (sizes) => {
    const ratios = toRatios(sizes);
    set({ main: ratios });
    debouncedSave({ main: ratios, diff: get().diff });
  },

  updateDiff: (sizes) => {
    const ratios = toRatios(sizes);
    set({ diff: ratios });
    debouncedSave({ main: get().main, diff: ratios });
  },
}));
