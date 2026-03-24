import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTabStore } from "./tab";

describe("useTabStore", () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [
        { id: "terminal", type: "terminal", title: "Terminal", closable: false },
      ],
      activeTabId: "terminal",
    });
  });

  it("initializes with pinned Terminal tab", () => {
    const { tabs, activeTabId } = useTabStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toEqual({
      id: "terminal",
      type: "terminal",
      title: "Terminal",
      closable: false,
    });
    expect(activeTabId).toBe("terminal");
  });

  it("adds closable tab and activates it", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("uuid-1" as `${string}-${string}-${string}-${string}-${string}`);
    const id = useTabStore.getState().addTab("browser", "Browser");
    const { tabs, activeTabId } = useTabStore.getState();
    expect(id).toBe("uuid-1");
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toEqual({
      id: "uuid-1",
      type: "browser",
      title: "Browser",
      closable: true,
    });
    expect(activeTabId).toBe("uuid-1");
  });

  it("does not add duplicate changes tab (singleton)", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("changes-1" as `${string}-${string}-${string}-${string}-${string}`);
    const id1 = useTabStore.getState().addTab("changes", "Changes");
    const id2 = useTabStore.getState().addTab("changes", "Changes");
    expect(id1).toBe("changes-1");
    expect(id2).toBe("changes-1");
    expect(useTabStore.getState().tabs).toHaveLength(2);
  });

  it("allows multiple browser tabs", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("b-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("b-2" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("browser", "Browser 1");
    useTabStore.getState().addTab("browser", "Browser 2");
    expect(useTabStore.getState().tabs).toHaveLength(3);
  });

  it("closes tab and falls back to Terminal", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("c-1" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("changes", "Changes");
    expect(useTabStore.getState().activeTabId).toBe("c-1");
    useTabStore.getState().closeTab("c-1");
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(useTabStore.getState().activeTabId).toBe("terminal");
  });

  it("cannot close Terminal tab", () => {
    useTabStore.getState().closeTab("terminal");
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(useTabStore.getState().activeTabId).toBe("terminal");
  });

  it("switches active tab", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("s-1" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("browser", "Browser");
    useTabStore.getState().setActiveTab("terminal");
    expect(useTabStore.getState().activeTabId).toBe("terminal");
  });

  it("closing active tab activates previous tab", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("p-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("p-2" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("browser", "B1");
    useTabStore.getState().addTab("browser", "B2");
    // Active is p-2, close it — should fall back to p-1
    useTabStore.getState().closeTab("p-2");
    expect(useTabStore.getState().activeTabId).toBe("p-1");
  });

  it("closing middle tab activates next tab", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("m-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("m-2" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("browser", "B1");
    useTabStore.getState().addTab("browser", "B2");
    // Active is m-2, switch to m-1 and close it — should activate m-2 (next)
    useTabStore.getState().setActiveTab("m-1");
    useTabStore.getState().closeTab("m-1");
    expect(useTabStore.getState().activeTabId).toBe("m-2");
  });

  it("setActiveTab with non-existent id does nothing", () => {
    useTabStore.getState().setActiveTab("non-existent");
    expect(useTabStore.getState().activeTabId).toBe("terminal");
  });

  it("activates existing changes tab instead of adding duplicate", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("ch-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("br-1" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("changes", "Changes");
    useTabStore.getState().addTab("browser", "Browser");
    expect(useTabStore.getState().activeTabId).toBe("br-1");
    // Adding changes again should activate existing, not add new
    useTabStore.getState().addTab("changes", "Changes");
    expect(useTabStore.getState().activeTabId).toBe("ch-1");
    expect(useTabStore.getState().tabs).toHaveLength(3);
  });
});
