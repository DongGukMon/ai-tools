import type {
  TerminalCommandAvailability,
  TerminalCommandDefinition,
  TerminalCommandIcon,
} from "./terminal-command-pipeline";

export const TERMINAL_TOOLBAR_COMMANDS = [
  {
    id: "terminal-settings",
    label: "Theme settings",
    title: "Terminal Theme Settings",
    icon: "settings",
    steps: [{ type: "ui", action: "open-theme-settings" }],
  },
  {
    id: "terminal-mirror",
    label: "Mirror to Global Terminal",
    title: "Mirror to Global Terminal",
    icon: "mirror",
    when: "focused-pty",
    steps: [{ type: "session", action: "mirror" }],
  },
  {
    id: "terminal-split-vertical",
    label: "Split vertical",
    title: "Split Vertical",
    icon: "split-vertical",
    when: "focused-pty",
    steps: [
      {
        type: "session",
        action: "split",
        direction: "vertical",
      },
    ],
  },
  {
    id: "terminal-split-horizontal",
    label: "Split horizontal",
    title: "Split Horizontal",
    icon: "split-horizontal",
    when: "focused-pty",
    steps: [
      {
        type: "session",
        action: "split",
        direction: "horizontal",
      },
    ],
  },
  {
    id: "terminal-close",
    label: "Close terminal",
    title: "Close Terminal",
    icon: "close",
    when: "focused-pty-multiple",
    steps: [{ type: "session", action: "close" }],
  },
] as const satisfies readonly TerminalCommandDefinition[];

interface TerminalSnippetCommandOptions {
  id: string;
  label: string;
  command: string;
  title?: string;
  icon?: TerminalCommandIcon;
  when?: TerminalCommandAvailability;
  addNewline?: boolean;
}

export function createTerminalSnippetCommand({
  id,
  label,
  command,
  title = label,
  icon = "play",
  when = "focused-pty",
  addNewline = true,
}: TerminalSnippetCommandOptions): TerminalCommandDefinition {
  return {
    id,
    label,
    title,
    icon,
    when,
    steps: [
      {
        type: "pty",
        action: "send-text",
        text: command,
        addNewline,
      },
    ],
  };
}
