import { describe, expect, it, vi } from "vitest";
import {
  executeTerminalCommand,
  isTerminalCommandEnabled,
  type TerminalCommandContext,
  type TerminalCommandDefinition,
} from "./terminal-command-pipeline";

function makeContext(
  overrides: Partial<TerminalCommandContext> = {},
): TerminalCommandContext {
  return {
    activeWorktree: "/tmp/worktree",
    focusedPtyId: "pty-1",
    openThemeSettings: vi.fn(),
    splitTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    sendText: vi.fn(),
    ...overrides,
  };
}

describe("terminal command pipeline", () => {
  it("disables focused-pty commands when no terminal is focused", () => {
    const command: TerminalCommandDefinition = {
      id: "terminal-close",
      label: "Close terminal",
      title: "Close Terminal",
      icon: "close",
      when: "focused-pty",
      steps: [{ type: "session", action: "close" }],
    };

    expect(
      isTerminalCommandEnabled(command, { focusedPtyId: null }),
    ).toBe(false);
  });

  it("executes session and pty steps in order", async () => {
    const context = makeContext();
    const command: TerminalCommandDefinition = {
      id: "custom-sequence",
      label: "Custom sequence",
      title: "Custom sequence",
      icon: "play",
      when: "focused-pty",
      steps: [
        {
          type: "pty",
          action: "send-text",
          text: "echo test",
          addNewline: true,
        },
        {
          type: "session",
          action: "split",
          direction: "vertical",
        },
      ],
    };

    await executeTerminalCommand(command, context);

    expect(context.sendText).toHaveBeenCalledWith("echo test", {
      addNewline: true,
    });
    expect(context.splitTerminal).toHaveBeenCalledWith("vertical");
  });

  it("opens theme settings through a ui step", async () => {
    const context = makeContext();
    const command: TerminalCommandDefinition = {
      id: "terminal-settings",
      label: "Theme settings",
      title: "Terminal Theme Settings",
      icon: "settings",
      steps: [{ type: "ui", action: "open-theme-settings" }],
    };

    await executeTerminalCommand(command, context);

    expect(context.openThemeSettings).toHaveBeenCalledTimes(1);
  });
});
