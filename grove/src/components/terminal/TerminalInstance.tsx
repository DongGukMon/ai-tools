import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { writePty, resizePty } from "../../lib/tauri";
import { useTerminalStore } from "../../store/terminal";
import "@xterm/xterm/css/xterm.css";

interface Props {
  ptyId: string;
}

export default function TerminalInstance({ ptyId }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const theme = useTerminalStore((s) => s.theme);
  const setFocusedPtyId = useTerminalStore((s) => s.setFocusedPtyId);

  useEffect(() => {
    if (!termRef.current) return;

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
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(termRef.current);

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // Falls back to canvas renderer
    }

    fitAddon.fit();

    const unlistenPromise = listen<{ id: string; data: string }>(
      "pty-output",
      (event) => {
        if (event.payload.id === ptyId) {
          const binary = atob(event.payload.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          term.write(bytes);
        }
      },
    );

    const dataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      writePty(ptyId, bytes);
    });

    let lastCols = term.cols;
    let lastRows = term.rows;
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      if (cols !== lastCols || rows !== lastRows) {
        lastCols = cols;
        lastRows = rows;
        resizePty(ptyId, cols, rows);
      }
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      unlistenPromise.then((unlisten) => unlisten());
      term.dispose();
    };
  }, [ptyId]);

  return (
    <div
      ref={termRef}
      className="terminal-instance"
      onClick={() => setFocusedPtyId(ptyId)}
    />
  );
}
