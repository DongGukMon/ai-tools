export interface TerminalCompositionLikeEvent {
  altKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key?: string;
  keyCode?: number;
  metaKey?: boolean;
}

const MAC_SHORTCUT_SEQUENCES: Record<string, string> = {
  ArrowLeft: "\x1bb",
  ArrowRight: "\x1bf",
  Backspace: "\x1b\x7f",
  Delete: "\x1bd",
};
const MAC_CLEAR_TERMINAL_SEQUENCE = "\x0c";

export function isTerminalCompositionEvent(
  event: TerminalCompositionLikeEvent,
): boolean {
  return (
    event.isComposing === true ||
    event.key === "Process" ||
    event.keyCode === 229
  );
}

export function isMacClearTerminalShortcut(
  event: Pick<
    TerminalCompositionLikeEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey"
  >,
): boolean {
  return (
    event.metaKey === true &&
    event.altKey !== true &&
    event.ctrlKey !== true &&
    event.key?.toLowerCase() === "k"
  );
}

export function getMacClearTerminalSequence(
  event: Pick<
    TerminalCompositionLikeEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey"
  >,
): string | null {
  return isMacClearTerminalShortcut(event) ? MAC_CLEAR_TERMINAL_SEQUENCE : null;
}

export function getMacShortcutSequence(
  event: Pick<
    TerminalCompositionLikeEvent,
    "altKey" | "ctrlKey" | "key" | "metaKey"
  >,
): string | null {
  if (event.altKey !== true || event.metaKey === true || event.ctrlKey === true) {
    return null;
  }

  if (!event.key) {
    return null;
  }

  return MAC_SHORTCUT_SEQUENCES[event.key] ?? null;
}
