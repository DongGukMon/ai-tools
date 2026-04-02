import { create } from "zustand";
import type { GrovePreferences, TerminalLinkOpenMode } from "../types";
import { getGrovePreferences, saveGrovePreferences } from "../lib/platform";

interface PreferencesStore {
  terminalLinkOpenMode: TerminalLinkOpenMode;
  preferredIde: GrovePreferences["preferredIde"];
  loaded: boolean;
  init: () => Promise<void>;
  setTerminalLinkOpenMode: (mode: TerminalLinkOpenMode) => void;
  setPreferredIde: (ide: GrovePreferences["preferredIde"]) => void;
}

function toSaveable(get: () => PreferencesStore): GrovePreferences {
  return {
    terminalLinkOpenMode: get().terminalLinkOpenMode,
    preferredIde: get().preferredIde,
  };
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  terminalLinkOpenMode: "external-with-localhost-internal",
  preferredIde: null,
  loaded: false,

  init: async () => {
    const prefs = await getGrovePreferences();
    set({
      terminalLinkOpenMode: prefs.terminalLinkOpenMode,
      preferredIde: prefs.preferredIde,
      loaded: true,
    });
  },

  setTerminalLinkOpenMode: (mode) => {
    set({ terminalLinkOpenMode: mode });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },

  setPreferredIde: (ide) => {
    set({ preferredIde: ide });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },
}));
