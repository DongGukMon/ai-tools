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

export function isTerminalCompositionEvent(
  event: TerminalCompositionLikeEvent,
): boolean {
  return (
    event.isComposing === true ||
    event.key === "Process" ||
    event.keyCode === 229
  );
}

export function shouldEnableTerminalWebgl(
  platform: string,
  userAgent: string,
): boolean {
  const applePlatform = /\b(Mac|iPhone|iPad|iPod)\b/i.test(
    `${platform} ${userAgent}`,
  );
  return !applePlatform;
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

/**
 * Check if the first character of `text` is Korean (Hangul).
 * Covers Jamo, Compatibility Jamo, Syllables, and Extended ranges.
 */
export function isKoreanChar(text: string): boolean {
  const cp = text.codePointAt(0) ?? 0;
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x3131 && cp <= 0x318e) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xd7b0 && cp <= 0xd7ff)
  );
}
