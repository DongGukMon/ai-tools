import { describe, expect, it } from "vitest";
import { buildTerminalPaneSeed } from "./terminal-startup";

describe("buildTerminalPaneSeed", () => {
  const pane = {
    launchCwd: "/tmp/project",
    scrollback: "pnpm test\r\n",
  };

  it("uses backend tmux capture for attached sessions", () => {
    expect(
      buildTerminalPaneSeed(pane, "pty-1", {
        sessionState: "attached",
        initialHydration: {
          text: "live attach buffer\r\n",
          truncated: false,
          source: "tmuxCapture",
        },
      }),
    ).toEqual({
      ptyId: "pty-1",
      launchCwd: "/tmp/project",
      initialScrollback: "live attach buffer\r\n",
      initialScrollbackSource: "tmuxCapture",
    });
  });

  it("does not replay fallback snapshot scrollback for attached sessions", () => {
    expect(
      buildTerminalPaneSeed(pane, "pty-1", {
        sessionState: "attached",
      }),
    ).toEqual({
      ptyId: "pty-1",
      launchCwd: "/tmp/project",
      initialScrollback: undefined,
      initialScrollbackSource: undefined,
    });
  });

  it("uses pane snapshot scrollback for created sessions", () => {
    expect(
      buildTerminalPaneSeed(pane, "pty-2", {
        sessionState: "created",
        initialHydration: {
          text: "ignored\r\n",
          truncated: false,
          source: "tmuxCapture",
        },
      }),
    ).toEqual({
      ptyId: "pty-2",
      launchCwd: "/tmp/project",
      initialScrollback: "pnpm test\r\n",
      initialScrollbackSource: "snapshotFallback",
    });
  });
});
