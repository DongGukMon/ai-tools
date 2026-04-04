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
  projectOrgOrder: string[];
  ideMenuItems: GrovePreferences["ideMenuItems"];
  loaded: boolean;
  init: () => Promise<void>;
  setTerminalLinkOpenMode: (mode: TerminalLinkOpenMode) => void;
  setProjectViewMode: (mode: ProjectViewMode) => void;
  setProjectOrgCollapsed: (org: string, collapsed: boolean) => void;
  setProjectOrgOrder: (orgOrder: string[]) => void;
  setIdeMenuItems: (items: GrovePreferences["ideMenuItems"]) => void;
}

function toSaveable(get: () => PreferencesStore): GrovePreferences {
  return {
    terminalLinkOpenMode: get().terminalLinkOpenMode,
    projectViewMode: get().projectViewMode,
    collapsedProjectOrgs: get().collapsedProjectOrgs,
    projectOrgOrder: get().projectOrgOrder,
    ideMenuItems: get().ideMenuItems,
  };
}

function normalizePreferences(prefs: GrovePreferences): GrovePreferences {
  return {
    terminalLinkOpenMode:
      prefs.terminalLinkOpenMode ?? "external-with-localhost-internal",
    projectViewMode: prefs.projectViewMode ?? "default",
    collapsedProjectOrgs: prefs.collapsedProjectOrgs ?? [],
    projectOrgOrder: prefs.projectOrgOrder ?? [],
    ideMenuItems: prefs.ideMenuItems ?? [],
  };
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  terminalLinkOpenMode: "external-with-localhost-internal",
  projectViewMode: "default",
  collapsedProjectOrgs: [],
  projectOrgOrder: [],
  ideMenuItems: [],
  loaded: false,

  init: async () => {
    const prefs = normalizePreferences(await getGrovePreferences());
    set({ ...prefs, loaded: true });
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

  setProjectOrgOrder: (orgOrder) => {
    set({ projectOrgOrder: Array.from(new Set(orgOrder)) });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },

  setIdeMenuItems: (items) => {
    set({ ideMenuItems: items });
    saveGrovePreferences(toSaveable(get)).catch(() => {});
  },
}));
