import { create } from "zustand";
import type {
  BuddyStatus,
  BuddySearchFilter,
  BuddySearchResult,
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
  loading: boolean;
  searching: boolean;
  error: string | null;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  search: (filter: BuddySearchFilter) => Promise<BuddySearchResult | null>;
  apply: (salt: string, companion: BuddyCompanion) => Promise<void>;
  restore: () => Promise<void>;
}

export const useBuddyStore = create<BuddyStore>((set, get) => ({
  status: null,
  loading: false,
  searching: false,
  error: null,

  init: async () => {
    if (get().status) return;
    set({ loading: true, error: null });
    try {
      const status = await getBuddyStatus();
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getBuddyStatus();
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  search: async (filter) => {
    set({ searching: true, error: null });
    try {
      const result = await searchBuddy(filter);
      set({ searching: false });
      return result;
    } catch (e) {
      set({ searching: false, error: String(e) });
      return null;
    }
  },

  apply: async (salt, companion) => {
    set({ loading: true, error: null });
    try {
      await applyBuddy(salt, companion);
      const status = await getBuddyStatus();
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  restore: async () => {
    set({ loading: true, error: null });
    try {
      await restoreBuddy();
      const status = await getBuddyStatus();
      set({ status, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
}));
