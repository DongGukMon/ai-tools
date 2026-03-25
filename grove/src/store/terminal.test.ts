import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SplitNode } from "../types";

vi.mock("../lib/platform", () => ({
  loadTerminalLayouts: vi.fn(),
  saveTerminalLayouts: vi.fn(),
}));

import { useTerminalStore } from "./terminal";

function makeLeaf(id: string, ptyId: string): SplitNode {
  return {
    id,
    type: "leaf",
    ptyId,
  };
}

function makeSplit(
  id: string,
  children: SplitNode[],
  type: "horizontal" | "vertical" = "horizontal",
): SplitNode {
  return {
    id,
    type,
    sizes: children.map(() => 1 / children.length),
    children,
  };
}

describe("useTerminalStore bell state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.setState({
      sessions: {},
      activeWorktree: null,
      focusedPtyId: null,
      focusedPaneIdByWorktree: {},
      bellPtyIds: new Set<string>(),
      aiSessions: {},
      theme: null,
      detectedTheme: null,
    });
  });

  it("clears bell ptys for the activated worktree", () => {
    useTerminalStore.setState({
      sessions: {
        "/tmp/a": makeLeaf("pane-a", "pty-a"),
        "/tmp/b": makeLeaf("pane-b", "pty-b"),
      },
      bellPtyIds: new Set(["pty-a", "pty-b"]),
    });

    useTerminalStore.getState().setActiveWorktree("/tmp/a");

    expect(useTerminalStore.getState().bellPtyIds).toEqual(new Set(["pty-b"]));
  });

  it("drops bell state for a closed pane only", () => {
    useTerminalStore.setState({
      sessions: {
        "/tmp/a": {
          id: "split-root",
          type: "horizontal",
          sizes: [1, 1],
          children: [makeLeaf("pane-a", "pty-a"), makeLeaf("pane-b", "pty-b")],
        },
      },
      bellPtyIds: new Set(["pty-a", "pty-b"]),
      focusedPtyId: "pty-a",
    });

    useTerminalStore.getState().closeTerminal("/tmp/a", "pty-a");

    expect(useTerminalStore.getState().bellPtyIds).toEqual(new Set(["pty-b"]));
  });

  it("switches active worktree without a null gap when removing the active session", () => {
    useTerminalStore.setState({
      sessions: {
        "/tmp/source": makeLeaf("pane-source", "pty-source"),
        "/tmp/feature": makeLeaf("pane-feature", "pty-feature"),
      },
      activeWorktree: "/tmp/feature",
      focusedPtyId: "pty-feature",
      bellPtyIds: new Set(["pty-feature", "pty-source"]),
      aiSessions: {
        "pty-source": { tool: "codex", status: "attention" },
      },
    });

    useTerminalStore
      .getState()
      .removeSession("/tmp/feature", "/tmp/source");

    expect(useTerminalStore.getState().sessions["/tmp/feature"]).toBeUndefined();
    expect(useTerminalStore.getState().activeWorktree).toBe("/tmp/source");
    expect(useTerminalStore.getState().focusedPtyId).toBe("pty-source");
    expect(useTerminalStore.getState().bellPtyIds).toEqual(new Set());
    expect(useTerminalStore.getState().aiSessions["pty-source"]).toEqual({
      tool: "codex",
      status: "idle",
    });
  });

  it("restores the previously focused pane when switching back to a worktree", () => {
    useTerminalStore.setState({
      sessions: {
        "/tmp/a": makeSplit("root-a", [
          makeLeaf("pane-a-1", "pty-a-1"),
          makeLeaf("pane-a-2", "pty-a-2"),
        ]),
        "/tmp/b": makeLeaf("pane-b-1", "pty-b-1"),
      },
    });

    useTerminalStore.getState().setActiveWorktree("/tmp/a");
    useTerminalStore.getState().setFocusedPtyId("pty-a-2");
    useTerminalStore.getState().setActiveWorktree("/tmp/b");
    useTerminalStore.getState().setActiveWorktree("/tmp/a");

    expect(useTerminalStore.getState().focusedPtyId).toBe("pty-a-2");
    expect(useTerminalStore.getState().focusedPaneIdByWorktree["/tmp/a"]).toBe("pane-a-2");
  });

  it("falls back to the first surviving pane when the remembered pane is removed", () => {
    useTerminalStore.setState({
      sessions: {
        "/tmp/a": makeLeaf("pane-a-1", "pty-a-1"),
        "/tmp/b": makeSplit("root-b", [
          makeLeaf("pane-b-1", "pty-b-1"),
          makeLeaf("pane-b-2", "pty-b-2"),
        ]),
      },
    });

    useTerminalStore.getState().setActiveWorktree("/tmp/b");
    useTerminalStore.getState().setFocusedPtyId("pty-b-2");
    useTerminalStore.getState().setActiveWorktree("/tmp/a");
    useTerminalStore.getState().closeTerminal("/tmp/b", "pty-b-2");
    useTerminalStore.getState().setActiveWorktree("/tmp/b");

    expect(useTerminalStore.getState().focusedPtyId).toBe("pty-b-1");
    expect(useTerminalStore.getState().focusedPaneIdByWorktree["/tmp/b"]).toBe("pane-b-1");
  });
});
