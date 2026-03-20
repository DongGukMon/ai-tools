import type { TimelineEvent } from "../types";

// Conservative failure patterns: prefer missing some failures over flagging normal output.
const STRONG_TOOL_ERROR_PATTERNS = [
  /^Error:/m,
  /^error:/m,
  /Exit code [1-9]/i,
  /ENOENT/,
  /Permission denied/,
  /Traceback \(most recent/,
  /panic:/,
  /FATAL/,
  /command not found/,
  /No such file or directory/,
  /Cannot find module/,
  /SyntaxError:/,
  /TypeError:/,
  /ReferenceError:/,
  /compilation failed/i,
  /build failed/i,
];

export function isToolErrorText(text: string): boolean {
  if (text.length > 2000) {
    return STRONG_TOOL_ERROR_PATTERNS.some((pattern) => pattern.test(text.slice(0, 200)));
  }
  return STRONG_TOOL_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

export function isToolErrorEvent(event: TimelineEvent): boolean {
  const text = event.toolResult || event.content || "";
  return isToolErrorText(text);
}
