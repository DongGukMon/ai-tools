import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTerminalStore } from "../store/terminal";
import { usePanelLayoutStore, type GlobalTerminalTab } from "../store/panel-layout";
import {
  closePty as ipcClosePty,
  createPty as ipcCreatePty,
  getAppConfig,
} from "../lib/platform";
import { runCommand, runCommandSafely } from "../lib/command";
import { log, error as logError } from "../lib/logger";

interface TabPtyState {
  ptyId: string;
  ready: boolean;
}

export function useGlobalTerminal() {
  const theme = useTerminalStore((s) => s.theme);
  const tabs = usePanelLayoutStore(useShallow((s) => s.globalTerminal.tabs));
  const activeTabId = usePanelLayoutStore((s) => s.globalTerminal.activeTabId);

  const tabPtyMapRef = useRef(new Map<string, TabPtyState>());
  const pendingRef = useRef(new Set<string>());
  const [tabPtyMap, setTabPtyMap] = useState<Map<string, TabPtyState>>(new Map());

  const createPtyForTab = useCallback(
    async (tab: GlobalTerminalTab) => {
      if (!theme) return;
      if (pendingRef.current.has(tab.id)) return;
      pendingRef.current.add(tab.id);

      const ptyId = crypto.randomUUID();

      log("global-terminal", "creating pty for tab", {
        tabId: tab.id,
        paneId: tab.paneId,
        ptyId,
      });

      try {
        const config = await runCommand(() => getAppConfig(), {
          errorToast: false,
        });

        await runCommand(
          () =>
            ipcCreatePty({
              ptyId,
              paneId: tab.paneId,
              worktreePath: config.baseDir,
              cwd: config.baseDir,
              cols: 80,
              rows: 24,
            }),
          { errorToast: false },
        );

        // Tab may have been removed while PTY was being created
        const currentTabs = usePanelLayoutStore.getState().globalTerminal.tabs;
        if (!currentTabs.some((t) => t.id === tab.id)) {
          await runCommandSafely(() => ipcClosePty(ptyId), {
            errorToast: false,
          });
          return;
        }

        tabPtyMapRef.current.set(tab.id, { ptyId, ready: true });
        setTabPtyMap(new Map(tabPtyMapRef.current));
        log("global-terminal", "pty created for tab", { tabId: tab.id });
      } catch (e) {
        logError("global-terminal", "failed to create pty for tab", e);
      } finally {
        pendingRef.current.delete(tab.id);
      }
    },
    [theme],
  );

  // Create PTYs for new tabs, clean up PTYs for removed tabs
  useEffect(() => {
    if (!theme) return;

    for (const tab of tabs) {
      if (!tabPtyMapRef.current.has(tab.id) && !pendingRef.current.has(tab.id)) {
        void createPtyForTab(tab);
      }
    }

    // Clean up PTYs for removed tabs
    const tabIds = new Set(tabs.map((t) => t.id));
    for (const [tabId, state] of tabPtyMapRef.current) {
      if (!tabIds.has(tabId)) {
        tabPtyMapRef.current.delete(tabId);
        void runCommandSafely(() => ipcClosePty(state.ptyId), {
          errorToast: false,
        });
      }
    }
    // Only update state if map actually changed
    if (tabPtyMapRef.current.size !== tabPtyMap.size ||
        [...tabPtyMapRef.current].some(([k, v]) => tabPtyMap.get(k)?.ptyId !== v.ptyId)) {
      setTabPtyMap(new Map(tabPtyMapRef.current));
    }
  }, [tabs, theme, createPtyForTab]);

  const addTab = useCallback(() => {
    usePanelLayoutStore.getState().addGlobalTerminalTab();
  }, []);

  const removeTab = useCallback((tabId: string) => {
    usePanelLayoutStore.getState().removeGlobalTerminalTab(tabId);
    // PTY cleanup handled by the effect above
  }, []);

  const selectTab = useCallback((tabId: string) => {
    usePanelLayoutStore.getState().setActiveGlobalTerminalTab(tabId);
  }, []);

  const getTabPtyId = useCallback(
    (tabId: string) => tabPtyMap.get(tabId)?.ptyId ?? "",
    [tabPtyMap],
  );

  const isTabReady = useCallback(
    (tabId: string) => tabPtyMap.get(tabId)?.ready ?? false,
    [tabPtyMap],
  );

  return {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    selectTab,
    getTabPtyId,
    isTabReady,
  };
}
