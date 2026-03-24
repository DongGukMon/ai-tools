import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadPanelLayoutsMock = vi.fn();
const savePanelLayoutsMock = vi.fn();

vi.mock("../lib/platform", () => ({
  loadPanelLayouts: (...args: Parameters<typeof loadPanelLayoutsMock>) =>
    loadPanelLayoutsMock(...args),
  savePanelLayouts: (...args: Parameters<typeof savePanelLayoutsMock>) =>
    savePanelLayoutsMock(...args),
}));

import { usePanelLayoutStore } from "./panel-layout";

describe("usePanelLayoutStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    savePanelLayoutsMock.mockResolvedValue(undefined);
    usePanelLayoutStore.setState({
      main: [0.18, 0.52, 0.3],
      diff: [0.25, 0.2, 0.55],
      globalTerminal: {
        collapsed: true,
        ratio: 0.3,
        tabs: [{ id: "tab-1", paneId: "pane-existing", title: "Terminal 1" }],
        activeTabId: "tab-1",
      },
      loaded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("migrates legacy paneId to single-tab array on init", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
    );
    loadPanelLayoutsMock.mockResolvedValue(
      JSON.stringify({
        main: [0.2, 0.5, 0.3],
        diff: [0.3, 0.25, 0.45],
        globalTerminal: {
          collapsed: false,
          ratio: 0.4,
          paneId: "legacy-pane-id",
        },
      }),
    );

    await usePanelLayoutStore.getState().init();

    const gt = usePanelLayoutStore.getState().globalTerminal;
    expect(gt.tabs).toHaveLength(1);
    expect(gt.tabs[0].paneId).toBe("legacy-pane-id");
    expect(gt.tabs[0].title).toBe("Terminal 1");
    expect(gt.activeTabId).toBe(gt.tabs[0].id);
    expect((gt as unknown as Record<string, unknown>).paneId).toBeUndefined();
  });

  describe("global terminal tabs", () => {
    it("creates default single tab when no saved data", async () => {
      loadPanelLayoutsMock.mockRejectedValue(new Error("no file"));

      await usePanelLayoutStore.getState().init();

      const gt = usePanelLayoutStore.getState().globalTerminal;
      expect(gt.tabs).toHaveLength(1);
      expect(gt.tabs[0].title).toBe("Terminal 1");
      expect(gt.activeTabId).toBe(gt.tabs[0].id);
    });

    it("adds a new tab with incremented title", () => {
      const tab = usePanelLayoutStore.getState().addGlobalTerminalTab();
      vi.advanceTimersByTime(500);

      const gt = usePanelLayoutStore.getState().globalTerminal;
      expect(gt.tabs).toHaveLength(2);
      expect(tab.title).toBe("Terminal 2");
      expect(gt.activeTabId).toBe(tab.id);
      expect(savePanelLayoutsMock).toHaveBeenCalled();
    });

    it("avoids duplicate titles after tab removal", () => {
      usePanelLayoutStore.getState().addGlobalTerminalTab(); // Terminal 2
      usePanelLayoutStore.getState().addGlobalTerminalTab(); // Terminal 3

      // Remove Terminal 2, then add a new tab
      const tab2Id = usePanelLayoutStore.getState().globalTerminal.tabs[1].id;
      usePanelLayoutStore.getState().removeGlobalTerminalTab(tab2Id);
      const tab4 = usePanelLayoutStore.getState().addGlobalTerminalTab();

      expect(tab4.title).toBe("Terminal 4"); // not "Terminal 3" (duplicate)
    });

    it("removes a tab and activates the previous one", () => {
      const tab2 = usePanelLayoutStore.getState().addGlobalTerminalTab();
      usePanelLayoutStore.getState().removeGlobalTerminalTab(tab2.id);
      vi.advanceTimersByTime(500);

      const gt = usePanelLayoutStore.getState().globalTerminal;
      expect(gt.tabs).toHaveLength(1);
      expect(gt.activeTabId).toBe(gt.tabs[0].id);
    });

    it("does not remove the last remaining tab", () => {
      const gt = usePanelLayoutStore.getState().globalTerminal;
      const onlyTabId = gt.tabs[0].id;
      usePanelLayoutStore.getState().removeGlobalTerminalTab(onlyTabId);

      expect(usePanelLayoutStore.getState().globalTerminal.tabs).toHaveLength(1);
    });

    it("switches active tab", () => {
      const tab2 = usePanelLayoutStore.getState().addGlobalTerminalTab();
      const tab1Id = usePanelLayoutStore.getState().globalTerminal.tabs[0].id;

      usePanelLayoutStore.getState().setActiveGlobalTerminalTab(tab1Id);
      expect(usePanelLayoutStore.getState().globalTerminal.activeTabId).toBe(tab1Id);

      usePanelLayoutStore.getState().setActiveGlobalTerminalTab(tab2.id);
      expect(usePanelLayoutStore.getState().globalTerminal.activeTabId).toBe(tab2.id);
    });

    it("switches to next/prev tab cyclically", () => {
      usePanelLayoutStore.getState().addGlobalTerminalTab();
      usePanelLayoutStore.getState().addGlobalTerminalTab();
      const tabs = usePanelLayoutStore.getState().globalTerminal.tabs;

      // Start at tab 3 (last added)
      expect(usePanelLayoutStore.getState().globalTerminal.activeTabId).toBe(tabs[2].id);

      // Next wraps to first
      usePanelLayoutStore.getState().switchGlobalTerminalTab("next");
      expect(usePanelLayoutStore.getState().globalTerminal.activeTabId).toBe(tabs[0].id);

      // Prev wraps to last
      usePanelLayoutStore.getState().switchGlobalTerminalTab("prev");
      expect(usePanelLayoutStore.getState().globalTerminal.activeTabId).toBe(tabs[2].id);
    });
  });
});
