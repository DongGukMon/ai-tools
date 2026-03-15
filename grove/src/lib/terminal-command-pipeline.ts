export type TerminalCommandIcon =
  | "settings"
  | "split-horizontal"
  | "split-vertical"
  | "close"
  | "play";

export type TerminalCommandAvailability = "always" | "focused-pty";

export type TerminalCommandStep =
  | { type: "ui"; action: "open-theme-settings" }
  | {
      type: "session";
      action: "split";
      direction: "horizontal" | "vertical";
    }
  | { type: "session"; action: "close" }
  | {
      type: "pty";
      action: "send-text";
      text: string;
      addNewline?: boolean;
    };

export interface TerminalCommandDefinition {
  id: string;
  label: string;
  title: string;
  icon: TerminalCommandIcon;
  when?: TerminalCommandAvailability;
  steps: TerminalCommandStep[];
}

export interface TerminalCommandContext {
  activeWorktree: string | null;
  focusedPtyId: string | null;
  openThemeSettings: () => void;
  splitTerminal: (
    direction: "horizontal" | "vertical",
  ) => Promise<void> | void;
  closeTerminal: () => Promise<void> | void;
  sendText: (
    text: string,
    options?: { addNewline?: boolean },
  ) => Promise<void> | void;
}

export function isTerminalCommandEnabled(
  command: TerminalCommandDefinition,
  context: Pick<TerminalCommandContext, "focusedPtyId">,
): boolean {
  switch (command.when ?? "always") {
    case "focused-pty":
      return Boolean(context.focusedPtyId);
    case "always":
      return true;
  }
}

export async function executeTerminalCommand(
  command: TerminalCommandDefinition,
  context: TerminalCommandContext,
): Promise<void> {
  if (!isTerminalCommandEnabled(command, context)) {
    return;
  }

  for (const step of command.steps) {
    switch (step.type) {
      case "ui":
        if (step.action === "open-theme-settings") {
          context.openThemeSettings();
        }
        break;
      case "session":
        if (step.action === "split") {
          await context.splitTerminal(step.direction);
        } else {
          await context.closeTerminal();
        }
        break;
      case "pty":
        await context.sendText(step.text, {
          addNewline: step.addNewline,
        });
        break;
    }
  }
}
