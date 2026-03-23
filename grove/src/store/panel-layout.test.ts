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
        paneId: "pane-existing",
      },
      loaded: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("generates and persists a pane id when loading legacy layouts", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("pane-generated");
    loadPanelLayoutsMock.mockResolvedValue(
      JSON.stringify({
        main: [0.2, 0.5, 0.3],
        diff: [0.3, 0.25, 0.45],
        globalTerminal: {
          collapsed: false,
          ratio: 0.4,
        },
      }),
    );

    await usePanelLayoutStore.getState().init();
    vi.advanceTimersByTime(500);

    expect(usePanelLayoutStore.getState().globalTerminal).toEqual({
      collapsed: false,
      ratio: 0.4,
      paneId: "pane-generated",
    });
    expect(savePanelLayoutsMock).toHaveBeenCalledWith(
      JSON.stringify({
        main: [0.2, 0.5, 0.3],
        diff: [0.3, 0.25, 0.45],
        globalTerminal: {
          collapsed: false,
          ratio: 0.4,
          paneId: "pane-generated",
        },
      }),
    );
  });

  it("resets the global terminal pane id without changing layout state", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("pane-reset");

    const paneId = usePanelLayoutStore.getState().resetGlobalTerminalPaneId();
    vi.advanceTimersByTime(500);

    expect(paneId).toBe("pane-reset");
    expect(usePanelLayoutStore.getState().globalTerminal).toEqual({
      collapsed: true,
      ratio: 0.3,
      paneId: "pane-reset",
    });
    expect(savePanelLayoutsMock).toHaveBeenCalledWith(
      JSON.stringify({
        main: [0.18, 0.52, 0.3],
        diff: [0.25, 0.2, 0.55],
        globalTerminal: {
          collapsed: true,
          ratio: 0.3,
          paneId: "pane-reset",
        },
      }),
    );
  });
});
