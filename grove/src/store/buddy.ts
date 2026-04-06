import { create } from "zustand";
import type {
  BuddyStatus,
  BuddySearchFilter,
  BuddyCompanion,
} from "../types";
import {
  getBuddyStatus,
  searchBuddy,
  applyBuddy,
  restoreBuddy,
} from "../lib/platform";

interface BuddyStore {
  status: BuddyStatus | null;
  applying: boolean;
  error: string | null;

  init: () => Promise<void>;
  searchAndApply: (filter: BuddySearchFilter) => Promise<void>;
  restore: () => Promise<void>;
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

  searchAndApply: async (filter) => {
    set({ applying: true, error: null });
    try {
      const result = await searchBuddy(filter);
      await applyBuddy(result.salt, result.companion);
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
}));
