import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { listen } from "@tauri-apps/api/event";
import { writePty, resizePty } from "../../lib/tauri";
import { useTerminalStore } from "../../store/terminal";
import {
  getMacShortcutSequence,
  isMacClearTerminalShortcut,
  isTerminalCompositionEvent,
  shouldEnableTerminalWebgl,
} from "../../lib/terminal-input";
import "@xterm/xterm/css/xterm.css";
import { cn } from "../../lib/cn";

interface Props {
  ptyId: string;
}

export default function TerminalInstance({ ptyId }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const theme = useTerminalStore((s) => s.theme);
  const focusedPtyId = useTerminalStore((s) => s.focusedPtyId);
  const setFocusedPtyId = useTerminalStore((s) => s.setFocusedPtyId);
  const [error, setError] = useState<string | null>(null);
  const isFocused = focusedPtyId === ptyId;

  useEffect(() => {
    const el = termRef.current;
    if (!el) return;

    const xtheme = theme
      ? {
          background: theme.background,
          foreground: theme.foreground,
          cursor: theme.cursor,
          black: theme.black,
          red: theme.red,
          green: theme.green,
          yellow: theme.yellow,
          blue: theme.blue,
          magenta: theme.magenta,
          cyan: theme.cyan,
          white: theme.white,
          brightBlack: theme.brightBlack,
          brightRed: theme.brightRed,
          brightGreen: theme.brightGreen,
          brightYellow: theme.brightYellow,
          brightBlue: theme.brightBlue,
          brightMagenta: theme.brightMagenta,
          brightCyan: theme.brightCyan,
          brightWhite: theme.brightWhite,
        }
      : undefined;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: theme?.fontFamily ?? "Menlo, monospace",
      fontSize: theme?.fontSize ?? 13,
      theme: xtheme,
      allowProposedApi: true,
      macOptionClickForcesSelection: true,
    });
    terminalRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Unicode11 for CJK character width
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    const shouldLoadWebgl = shouldEnableTerminalWebgl(
      navigator.platform,
      navigator.userAgent,
    );

    let disposed = false;
    let hasOpened = false;
    let hasLoadedWebgl = false;
    let frameId: number | null = null;
    let lastCols = 0;
    let lastRows = 0;

    const hasLayoutDimensions = () => {
      const { width, height } = el.getBoundingClientRect();
      return width > 0 && height > 0;
    };

    const syncPtySize = () => {
      const { cols, rows } = term;
      if (!cols || !rows) return;
      if (cols === lastCols && rows === lastRows) return;

      lastCols = cols;
      lastRows = rows;
      resizePty(ptyId, cols, rows).catch(() => {});
    };

    const loadWebglAddon = () => {
      if (!shouldLoadWebgl || hasLoadedWebgl) return;

      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        term.loadAddon(webglAddon);
        hasLoadedWebgl = true;
      } catch {
        // Canvas renderer fallback
      }
    };

    const fitTerminal = () => {
      if (!hasOpened || !hasLayoutDimensions()) return;

      try {
        fitAddon.fit();
        syncPtySize();
      } catch {
        // ignore fit errors if container not ready
      }
    };

    // Trackpad soft-tap selection can occasionally miss mouseup, leaving
    // xterm's document-level drag listeners active. End the drag on the first
    // mousemove without pressed buttons, preserving the existing selection.
    let awaitingPointerRelease = false;
    const ownerDocument = el.ownerDocument;
    const onTrackpadMouseDown = () => {
      awaitingPointerRelease = true;
    };
    const onTrackpadMouseUp = () => {
      awaitingPointerRelease = false;
    };
    const onTrackpadMouseMoveCapture = (e: MouseEvent) => {
      if (!awaitingPointerRelease || e.buttons !== 0) return;
      awaitingPointerRelease = false;
      e.stopImmediatePropagation();
      el.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: e.clientX,
          clientY: e.clientY,
        }),
      );
    };
    el.addEventListener("mousedown", onTrackpadMouseDown, true);
    ownerDocument.addEventListener("mouseup", onTrackpadMouseUp, true);
    ownerDocument.addEventListener("mousemove", onTrackpadMouseMoveCapture, true);

    // Defer xterm open/fit until the host is visible and has real dimensions.
    const scheduleLayoutSync = () => {
      if (disposed || frameId !== null) return;

      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (disposed || !hasLayoutDimensions()) return;

        if (!hasOpened) {
          term.open(el);
          hasOpened = true;
          term.focus();
          scheduleLayoutSync();
          return;
        }

        loadWebglAddon();
        fitTerminal();
      });
    };

    // Listen for PTY output
    const unlistenPromise = listen<{ id: string; data: string }>(
      "pty-output",
      (event) => {
        if (event.payload.id === ptyId) {
          try {
            const binary = atob(event.payload.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            term.write(bytes);
          } catch (e) {
            console.error("pty-output decode error:", e);
          }
        }
      },
    ).catch((e) => {
      setError(`Event listen failed: ${e}`);
      return () => {};
    });

    const dataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      writePty(ptyId, bytes).catch((e) =>
        console.error("writePty failed:", e),
      );
    });
    const handleFocusIn = () => {
      setFocusedPtyId(ptyId);
    };
    el.addEventListener("focusin", handleFocusIn);

    // macOS keyboard shortcuts
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      // xterm invokes custom key handlers before its composition helper, so let
      // IME-driven events reach xterm untouched until composition is committed.
      if (isTerminalCompositionEvent(e)) return true;

      // Cmd+K → clear terminal
      if (isMacClearTerminalShortcut(e)) {
        term.clear();
        return false;
      }

      // Option+Arrow/Delete → send escape sequences manually
      // (can't use macOptionIsMeta because it breaks CJK IME composition)
      const sequence = getMacShortcutSequence(e);
      if (sequence) {
        const bytes = Array.from(new TextEncoder().encode(sequence));
        writePty(ptyId, bytes).catch(() => {});
        return false;
      }

      return true;
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      scheduleLayoutSync();
    });
    resizeObserver.observe(el);
    scheduleLayoutSync();

    return () => {
      disposed = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
      el.removeEventListener("mousedown", onTrackpadMouseDown, true);
      ownerDocument.removeEventListener("mouseup", onTrackpadMouseUp, true);
      ownerDocument.removeEventListener("mousemove", onTrackpadMouseMoveCapture, true);
      el.removeEventListener("focusin", handleFocusIn);
      dataDisposable.dispose();
      unlistenPromise.then((unlisten) => {
        if (typeof unlisten === "function") unlisten();
      });
      term.dispose();
      terminalRef.current = null;
    };
  }, [ptyId, setFocusedPtyId]);

  // Live theme updates
  useEffect(() => {
    const term = terminalRef.current;
    if (!term || !theme) return;

    term.options.theme = {
      background: theme.background,
      foreground: theme.foreground,
      cursor: theme.cursor,
      black: theme.black,
      red: theme.red,
      green: theme.green,
      yellow: theme.yellow,
      blue: theme.blue,
      magenta: theme.magenta,
      cyan: theme.cyan,
      white: theme.white,
      brightBlack: theme.brightBlack,
      brightRed: theme.brightRed,
      brightGreen: theme.brightGreen,
      brightYellow: theme.brightYellow,
      brightBlue: theme.brightBlue,
      brightMagenta: theme.brightMagenta,
      brightCyan: theme.brightCyan,
      brightWhite: theme.brightWhite,
    };
    term.options.fontFamily = theme.fontFamily;
    term.options.fontSize = theme.fontSize;
  }, [theme]);

  if (error) {
    return (
      <div className={cn("absolute inset-0 p-3 text-sm text-[var(--color-danger)]")}>
        {error}
      </div>
    );
  }

  return (
    <div
      className={cn("terminal-pane absolute inset-0 p-4", {
        "terminal-pane-focused": isFocused,
      })}
      style={{ backgroundColor: theme?.background ?? "#000" }}
      onClick={() => {
        setFocusedPtyId(ptyId);
        terminalRef.current?.focus();
      }}
    >
      <div ref={termRef} className={cn("terminal-instance h-full w-full")} />
    </div>
  );
}
