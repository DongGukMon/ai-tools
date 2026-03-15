import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { listen } from "@tauri-apps/api/event";
import { writePty, resizePty } from "../../lib/tauri";
import { useTerminalStore } from "../../store/terminal";
import "@xterm/xterm/css/xterm.css";

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

    term.open(el);

    // Unicode11 for CJK character width
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    // Try WebGL, fall back to canvas
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // Canvas renderer fallback
    }

    // Fit after layout settles - delay ensures container has pixel dimensions
    const fitTimer = setTimeout(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore fit errors if container not ready
      }
      // Send initial size to PTY
      resizePty(ptyId, term.cols, term.rows).catch(() => {});
    }, 100);

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

    // Send keyboard input to PTY
    const dataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      writePty(ptyId, bytes).catch((e) =>
        console.error("writePty failed:", e),
      );
    });

    // macOS keyboard shortcuts
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Cmd+K → clear terminal
      if (e.metaKey && e.key === "k") {
        term.clear();
        return false;
      }

      // Option+Arrow/Delete → send escape sequences manually
      // (can't use macOptionIsMeta because it breaks CJK IME composition)
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const seq: Record<string, string> = {
          ArrowLeft: "\x1bb",     // ESC+b = word backward
          ArrowRight: "\x1bf",    // ESC+f = word forward
          Backspace: "\x1b\x7f", // ESC+DEL = delete word backward
          Delete: "\x1bd",        // ESC+d = delete word forward
        };
        if (seq[e.key]) {
          const bytes = Array.from(new TextEncoder().encode(seq[e.key]));
          writePty(ptyId, bytes).catch(() => {});
          return false;
        }
      }

      return true;
    });

    // Handle resize
    let lastCols = term.cols;
    let lastRows = term.rows;
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        if (cols !== lastCols || rows !== lastRows) {
          lastCols = cols;
          lastRows = rows;
          resizePty(ptyId, cols, rows).catch(() => {});
        }
      } catch {
        // ignore resize errors during cleanup
      }
    });
    resizeObserver.observe(el);

    // Focus terminal
    term.focus();

    return () => {
      clearTimeout(fitTimer);
      resizeObserver.disconnect();
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
      <div className="absolute inset-0 p-3 text-sm text-[var(--color-danger)]">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={termRef}
      className="terminal-instance absolute inset-0 p-1"
      onClick={() => {
        setFocusedPtyId(ptyId);
        terminalRef.current?.focus();
      }}
    />
  );
}
