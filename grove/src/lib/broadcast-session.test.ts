import { describe, expect, it } from "vitest";
import { buildBroadcastSessionKey } from "./broadcast-session";

describe("broadcast session helpers", () => {
  it("builds a stable key from owner, pty, and pane identity", () => {
    expect(
      buildBroadcastSessionKey("/tmp/worktree-a", {
        ptyId: "pty-1",
        paneId: "pane-1",
      }),
    ).toBe("/tmp/worktree-a:pty-1:pane-1");
  });

  it("changes when the pty changes within the same worktree", () => {
    const first = buildBroadcastSessionKey("/tmp/worktree-a", {
      ptyId: "pty-1",
      paneId: "pane-1",
    });
    const second = buildBroadcastSessionKey("/tmp/worktree-a", {
      ptyId: "pty-2",
      paneId: "pane-1",
    });

    expect(first).not.toBe(second);
  });
});
