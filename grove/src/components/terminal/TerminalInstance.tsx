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
import { createTerminalIME } from "../../lib/terminal-ime";
import "@xterm/xterm/css/xterm.css";
import { cn } from "../../lib/cn";

interface Props {
  ptyId: string;
}

export default function TerminalInstance({ ptyId }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const theme = useTerminalStore((s) => s.theme);
  const setFocusedPtyId = useTerminalStore((s) => s.setFocusedPtyId);
  const [error, setError] = useState<string | null>(null);

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

    // WKWebView IME workaround (Korean / CJK composition)
    const ime = createTerminalIME(term, el, (text) => {
      const bytes = Array.from(new TextEncoder().encode(text));
      writePty(ptyId, bytes).catch(() => {});
    });

    // Defer xterm open/fit until the host is visible and has real dimensions.
    const scheduleLayoutSync = () => {
      if (disposed || frameId !== null) return;

      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (disposed || !hasLayoutDimensions()) return;

        if (!hasOpened) {
          term.open(el);
          hasOpened = true;
          ime.attach();
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
            if (ime.active) ime.clearPreview();
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

    // Send keyboard input to PTY (suppressed during IME composition)
    const dataDisposable = term.onData((data) => {
      if (ime.active) return;
      const bytes = Array.from(new TextEncoder().encode(data));
      writePty(ptyId, bytes).catch((e) =>
        console.error("writePty failed:", e),
      );
    });

    // macOS keyboard shortcuts
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      // xterm invokes custom key handlers before its composition helper, so let
      // IME-driven events reach xterm untouched until composition is committed.
      if (isTerminalCompositionEvent(e)) return true;

      // Non-IME keydown while composing → flush or discard
      if (ime.active) {
        if (ime.handleCommitKey(e.key)) return false;
      }

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
      ime.dispose();
      dataDisposable.dispose();
      unlistenPromise.then((unlisten) => {
        if (typeof unlisten === "function") unlisten();
      });
      term.dispose();
      terminalRef.current = null;
    };
  }, [ptyId]);

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
      className={cn("absolute inset-0 p-4")}
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
