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

describe("useTerminalStore bell state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.setState({
      sessions: {},
      activeWorktree: null,
      focusedPtyId: null,
      bellPtyIds: new Set<string>(),
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
});
