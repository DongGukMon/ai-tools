import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTabStore, selectCurrentTabs, selectCurrentActiveTabId } from "./tab";

function initWorktree(path = "/tmp/wt") {
  useTabStore.getState().setActiveWorktree(path);
}

describe("useTabStore", () => {
  beforeEach(() => {
    useTabStore.setState({ sessions: {}, activeWorktree: null });
  });

  it("initializes with pinned Terminal and Changes tabs", () => {
    initWorktree();
    const tabs = selectCurrentTabs(useTabStore.getState());
    const activeTabId = selectCurrentActiveTabId(useTabStore.getState());
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({
      id: "terminal",
      type: "terminal",
      title: "Terminal",
      closable: false,
    });
    expect(tabs[1]).toEqual({
      id: "changes",
      type: "changes",
      title: "Changes",
      closable: false,
    });
    expect(activeTabId).toBe("terminal");
  });

  it("adds closable browser tab and activates it", () => {
    initWorktree();
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "uuid-1" as `${string}-${string}-${string}-${string}-${string}`,
    );
    const id = useTabStore.getState().addTab("browser", "Browser");
    const tabs = selectCurrentTabs(useTabStore.getState());
    expect(id).toBe("uuid-1");
    expect(tabs).toHaveLength(3);
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("uuid-1");
  });

  it("addTab changes just activates the pinned Changes tab", () => {
    initWorktree();
    const id = useTabStore.getState().addTab("changes", "Changes");
    expect(id).toBe("changes");
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("changes");
    expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(2);
  });

  it("allows multiple browser tabs", () => {
    initWorktree();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("b-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("b-2" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("browser", "Browser 1");
    useTabStore.getState().addTab("browser", "Browser 2");
    expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(4);
  });

  it("closes browser tab and falls back to previous", () => {
    initWorktree();
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
      "b-1" as `${string}-${string}-${string}-${string}-${string}`,
    );
    useTabStore.getState().addTab("browser", "Browser");
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("b-1");
    useTabStore.getState().closeTab("b-1");
    expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(2);
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("changes");
  });

  it("cannot close Terminal tab", () => {
    initWorktree();
    useTabStore.getState().closeTab("terminal");
    expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(2);
  });

  it("cannot close Changes tab", () => {
    initWorktree();
    useTabStore.getState().closeTab("changes");
    expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(2);
  });

  it("switches active tab", () => {
    initWorktree();
    useTabStore.getState().setActiveTab("changes");
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("changes");
    useTabStore.getState().setActiveTab("terminal");
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("terminal");
  });

  it("closing active browser tab activates previous tab", () => {
    initWorktree();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("p-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("p-2" as `${string}-${string}-${string}-${string}-${string}`);
    useTabStore.getState().addTab("browser", "B1");
    useTabStore.getState().addTab("browser", "B2");
    useTabStore.getState().closeTab("p-2");
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("p-1");
  });

  it("setActiveTab with non-existent id does nothing", () => {
    initWorktree();
    useTabStore.getState().setActiveTab("non-existent");
    expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("terminal");
  });

  describe("worktree isolation", () => {
    it("each worktree has independent tab state", () => {
      useTabStore.getState().setActiveWorktree("/tmp/a");
      vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(
        "br-a" as `${string}-${string}-${string}-${string}-${string}`,
      );
      useTabStore.getState().addTab("browser", "Browser");
      expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(3);

      useTabStore.getState().setActiveWorktree("/tmp/b");
      expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(2);
      expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("terminal");

      useTabStore.getState().setActiveWorktree("/tmp/a");
      expect(selectCurrentTabs(useTabStore.getState())).toHaveLength(3);
      expect(selectCurrentActiveTabId(useTabStore.getState())).toBe("br-a");
    });

    it("removeSession cleans up worktree tab state", () => {
      useTabStore.getState().setActiveWorktree("/tmp/a");
      useTabStore.getState().addTab("browser", "Browser");
      useTabStore.getState().removeSession("/tmp/a");
      expect(useTabStore.getState().sessions["/tmp/a"]).toBeUndefined();
    });
  });
});
