import type { Terminal } from "@xterm/xterm";
import { isKoreanChar } from "./terminal-input";

/**
 * WKWebView IME composition workaround for xterm.js.
 *
 * WKWebView doesn't fire DOM compositionstart/update/end events for CJK
 * input.  Instead it uses insertText (first jamo) + insertReplacementText
 * (composition updates).  Without composition events xterm.js's
 * CompositionHelper never activates and onData fires with partial jamo.
 *
 * This module intercepts beforeinput/input on xterm's internal textarea,
 * tracks composition state, renders an underlined inline preview via
 * term.write(), and flushes the fully-composed text on commit.
 */
export function createTerminalIME(
  term: Terminal,
  container: HTMLElement,
  onCommit: (text: string) => void,
) {
  let active = false;
  let textarea: HTMLTextAreaElement | null = null;
  let previewCols = 0;

  // ── Display width (wide CJK = 2 cols) ───────────────────────

  const isWide = (cp: number) =>
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x33bf) ||
    (cp >= 0x3131 && cp <= 0x318e) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff01 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x2ffff);

  const displayWidth = (text: string) => {
    let w = 0;
    for (const ch of text) w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
    return w;
  };

  // ── Inline preview ───────────────────────────────────────────

  const erasePreview = () => {
    if (previewCols > 0) {
      const back = "\b".repeat(previewCols);
      const clear = " ".repeat(previewCols);
      term.write(back + clear + back);
      previewCols = 0;
    }
  };

  const writePreview = (text: string) => {
    erasePreview();
    if (text) {
      previewCols = displayWidth(text);
      // SGR 4 = underline, SGR 24 = no underline
      term.write(`\x1b[4m${text}\x1b[24m`);
    }
  };

  // ── Composition lifecycle ────────────────────────────────────

  const flush = () => {
    erasePreview();
    const text = textarea?.value ?? "";
    if (text) onCommit(text);
    if (textarea) textarea.value = "";
    active = false;
  };

  const discard = () => {
    erasePreview();
    if (textarea) textarea.value = "";
    active = false;
  };

  // ── Event handlers ───────────────────────────────────────────

  const onBeforeInput = (e: Event) => {
    const ie = e as InputEvent;
    if (
      ie.inputType === "insertReplacementText" ||
      (ie.inputType === "insertText" && ie.data && isKoreanChar(ie.data))
    ) {
      active = true;
    }
  };

  const onInput = () => {
    if (active && textarea) writePreview(textarea.value);
  };

  const onBlur = () => {
    if (active) flush();
  };

  // ── Public API ───────────────────────────────────────────────

  return {
    /** Whether IME composition is currently active. */
    get active() {
      return active;
    },

    /**
     * Attach event listeners to xterm's internal textarea.
     * Must be called after `term.open()`.
     */
    attach() {
      textarea = container.querySelector(
        "textarea.xterm-helper-textarea",
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.addEventListener("beforeinput", onBeforeInput);
        textarea.addEventListener("input", onInput);
        textarea.addEventListener("blur", onBlur);
      }
    },

    /** Erase the inline preview.  Call before writing PTY output. */
    clearPreview() {
      erasePreview();
    },

    /**
     * Handle a non-IME keydown during active composition.
     * Returns `true` if the key was consumed (caller should block xterm).
     */
    handleCommitKey(key: string): boolean {
      if (key === "Escape") {
        discard();
        return true;
      }
      flush();
      return false;
    },

    /** Remove all event listeners. */
    dispose() {
      if (textarea) {
        textarea.removeEventListener("beforeinput", onBeforeInput);
        textarea.removeEventListener("input", onInput);
        textarea.removeEventListener("blur", onBlur);
      }
      textarea = null;
      active = false;
      previewCols = 0;
    },
  };
}
