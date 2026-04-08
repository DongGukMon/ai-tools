import { create } from "zustand";
import type {
  BuddyStatus,
  BuddySearchFilter,
} from "../types";
import {
  getBuddyStatus,
  searchBuddy,
  applyBuddy,
  restoreBuddy,
  setUpgradeRobot,
} from "../lib/platform";

interface BuddyStore {
  status: BuddyStatus | null;
  applying: boolean;
  error: string | null;

  init: () => Promise<void>;
  applySelection: (
    filter: BuddySearchFilter,
    options: { applyCompanion: boolean; upgradeRobot: boolean | null },
  ) => Promise<void>;
  restore: () => Promise<void>;
  toggleUpgradeRobot: (enabled: boolean) => Promise<void>;
}

export const useBuddyStore = create<BuddyStore>((set, get) => ({
  status: null,
  applying: false,
  error: null,

  init: async () => {
    if (get().status) return;
    set({ applying: true, error: null });
    try {
      const status = await getBuddyStatus();
      set({ status, applying: false });
    } catch (e) {
      set({ applying: false, error: String(e) });
    }
  },

  applySelection: async (filter, options) => {
    set({ applying: true, error: null });
    try {
      if (options.applyCompanion) {
        const result = await searchBuddy(filter);
        await applyBuddy(result.salt, result.companion);
      }
      if (options.upgradeRobot !== null) {
        await setUpgradeRobot(options.upgradeRobot);
      }
      const status = await getBuddyStatus();
      set({ status, applying: false });
    } catch (e) {
      set({ applying: false, error: String(e) });
    }
  },

  restore: async () => {
    set({ applying: true, error: null });
    try {
      await restoreBuddy();
      const status = await getBuddyStatus();
      set({ status, applying: false });
    } catch (e) {
      set({ applying: false, error: String(e) });
    }
  },

  toggleUpgradeRobot: async (enabled) => {
    set({ applying: true, error: null });
    try {
      await setUpgradeRobot(enabled);
      const status = await getBuddyStatus();
      set({ status, applying: false });
    } catch (e) {
      set({ applying: false, error: String(e) });
    }
  },
}));
