import { describe, expect, it } from "vitest";
import {
  getMacShortcutSequence,
  isTerminalCompositionEvent,
  isMacClearTerminalShortcut,
  shouldEnableTerminalWebgl,
} from "./terminal-input";

describe("isTerminalCompositionEvent", () => {
  it("detects browser composition markers", () => {
    expect(
      isTerminalCompositionEvent({ isComposing: true, key: "r", keyCode: 82 }),
    ).toBe(true);
    expect(
      isTerminalCompositionEvent({
        isComposing: false,
        key: "Process",
        keyCode: 229,
      }),
    ).toBe(true);
    expect(
      isTerminalCompositionEvent({ isComposing: false, key: "a", keyCode: 65 }),
    ).toBe(false);
  });
});

describe("shouldEnableTerminalWebgl", () => {
  it("disables WebGL on Apple platforms", () => {
    expect(
      shouldEnableTerminalWebgl(
        "MacIntel",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      ),
    ).toBe(false);
    expect(
      shouldEnableTerminalWebgl(
        "iPhone",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      ),
    ).toBe(false);
  });

  it("keeps WebGL enabled elsewhere", () => {
    expect(
      shouldEnableTerminalWebgl(
        "Linux x86_64",
        "Mozilla/5.0 (X11; Linux x86_64)",
      ),
    ).toBe(true);
  });
});

describe("isMacClearTerminalShortcut", () => {
  it("accepts only the plain cmd+k shortcut", () => {
    expect(
      isMacClearTerminalShortcut({
        altKey: false,
        ctrlKey: false,
        key: "k",
        metaKey: true,
      }),
    ).toBe(true);

    expect(
      isMacClearTerminalShortcut({
        altKey: true,
        ctrlKey: false,
        key: "k",
        metaKey: true,
      }),
    ).toBe(false);
  });
});

describe("getMacShortcutSequence", () => {
  it("maps option editing shortcuts to escape sequences", () => {
    expect(
      getMacShortcutSequence({
        altKey: true,
        ctrlKey: false,
        key: "ArrowLeft",
        metaKey: false,
      }),
    ).toBe("\x1bb");

    expect(
      getMacShortcutSequence({
        altKey: true,
        ctrlKey: false,
        key: "Backspace",
        metaKey: false,
      }),
    ).toBe("\x1b\x7f");
  });

  it("ignores non-option and conflicting modifier combos", () => {
    expect(
      getMacShortcutSequence({
        altKey: false,
        ctrlKey: false,
        key: "ArrowLeft",
        metaKey: false,
      }),
    ).toBeNull();

    expect(
      getMacShortcutSequence({
        altKey: true,
        ctrlKey: true,
        key: "ArrowLeft",
        metaKey: false,
      }),
    ).toBeNull();
  });
});
