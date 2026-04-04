import { create } from "zustand";
import type {
  GrovePreferences,
  ProjectViewMode,
  TerminalLinkOpenMode,
} from "../types";
import { getGrovePreferences, saveGrovePreferences } from "../lib/platform";

interface PreferencesStore {
  terminalLinkOpenMode: TerminalLinkOpenMode;
  projectViewMode: ProjectViewMode;
  collapsedProjectOrgs: string[];
  preferredIde: GrovePreferences["preferredIde"];
  loaded: boolean;
  init: () => Promise<void>;
  setTerminalLinkOpenMode: (mode: TerminalLinkOpenMode) => void;
  setProjectViewMode: (mode: ProjectViewMode) => void;
  setProjectOrgCollapsed: (org: string, collapsed: boolean) => void;
  setPreferredIde: (ide: GrovePreferences["preferredIde"]) => void;
}

function toSaveable(get: () => PreferencesStore): GrovePreferences {
  return {
    terminalLinkOpenMode: get().terminalLinkOpenMode,
    projectViewMode: get().projectViewMode,
    collapsedProjectOrgs: get().collapsedProjectOrgs,
    preferredIde: get().preferredIde,
  };
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  terminalLinkOpenMode: "external-with-localhost-internal",
  projectViewMode: "default",
  collapsedProjectOrgs: [],
  preferredIde: null,
  loaded: false,

  init: async () => {
    const prefs = await getGrovePreferences();
    set({
      terminalLinkOpenMode: prefs.terminalLinkOpenMode,
      projectViewMode: prefs.projectViewMode,
      collapsedProjectOrgs: prefs.collapsedProjectOrgs,
      preferredIde: prefs.preferredIde,
      loaded: true,
    });
  },

  setTerminalLinkOpenMode: (mode) => {
    set({ terminalLinkOpenMode: mode });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },

  setProjectViewMode: (mode) => {
    set({ projectViewMode: mode });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },

  setProjectOrgCollapsed: (org, collapsed) => {
    set((state) => ({
      collapsedProjectOrgs: collapsed
        ? Array.from(new Set([...state.collapsedProjectOrgs, org]))
        : state.collapsedProjectOrgs.filter((value) => value !== org),
    }));
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },

  setPreferredIde: (ide) => {
    set({ preferredIde: ide });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },
}));
