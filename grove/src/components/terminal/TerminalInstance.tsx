import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { useTerminalStore } from "../../store/terminal";
import { useBroadcastStore } from "../../store/broadcast";
import { usePanelLayoutStore } from "../../store/panel-layout";
import "@xterm/xterm/css/xterm.css";
import { cn } from "../../lib/cn";
import { acquireTerminalRuntime } from "../../lib/terminal-runtime";

interface Props {
  paneId: string;
  ptyId: string;
}

function TerminalInstance({ paneId, ptyId }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ReturnType<typeof acquireTerminalRuntime> | null>(null);
  const theme = useTerminalStore((s) => s.theme);
  const isFocused = useTerminalStore((s) => s.focusedPtyId === ptyId);
  const setFocusedPtyId = useTerminalStore((s) => s.setFocusedPtyId);
  const isBroadcasting = useBroadcastStore((s) => s.active?.ptyId === ptyId);
  const snapshot = useBroadcastStore((s) => s.active?.ptyId === ptyId ? s.active.snapshot : null);
  const markBellPty = useTerminalStore((s) => s.markBellPty);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(() => {
    setFocusedPtyId(ptyId);
    runtimeRef.current?.focus();
  }, [ptyId, setFocusedPtyId]);

  useLayoutEffect(() => {
    const container = termRef.current;
    if (!container) return;

    const runtime = acquireTerminalRuntime(paneId, theme);
    runtimeRef.current = runtime;
    runtime.setPtyId(ptyId);
    runtime.setFocusHandler((nextPtyId) => {
      setFocusedPtyId(nextPtyId);
    });
    runtime.setErrorHandler(setError);
    runtime.setBellHandler(markBellPty);
    runtime.attach(container);

    return () => {
      runtime.setFocusHandler(null);
      runtime.setErrorHandler(null);
      runtime.setBellHandler(null);
      runtime.detach();
      runtime.release();
      runtimeRef.current = null;
    };
  }, [paneId, setFocusedPtyId]);

  useEffect(() => {
    runtimeRef.current?.setPtyId(ptyId);
  }, [ptyId]);

  useEffect(() => {
    runtimeRef.current?.setTheme(theme);
  }, [theme]);

  // Re-attach runtime when broadcast ends
  useEffect(() => {
    if (!isBroadcasting) {
      const runtime = runtimeRef.current;
      const container = termRef.current;
      if (runtime && container) {
        runtime.attach(container);
        requestAnimationFrame(() => {
          runtime.fitAddon.fit();
        });
      }
    }
  }, [isBroadcasting]);

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
      onClick={handleClick}
    >
      <div ref={termRef} className={cn("terminal-instance h-full w-full")} />
      <div className={cn("terminal-pane-dim", { "terminal-pane-dim-active": !isFocused })} />
      {isBroadcasting && (
        <div className={cn("absolute inset-0 z-10")}>
          {/* Frozen terminal snapshot */}
          {snapshot && (
            <img
              src={snapshot}
              alt=""
              className={cn("absolute inset-4 pointer-events-none")}
            />
          )}
          {/* Blurred overlay on top of snapshot */}
          <div
            className={cn("absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 backdrop-blur-[1.3px]")}
          >
            <Radio className={cn("size-10 text-white animate-pulse")} />
            <span className={cn("text-sm font-medium text-white")}>Broadcasting</span>
            <button
              type="button"
              onClick={() => {
                const ended = useBroadcastStore.getState().stopBroadcast();
                if (ended?.target === "mirror") {
                  const gt = usePanelLayoutStore.getState().globalTerminal;
                  const mirrorTab = gt.tabs.find((t) => t.mirrorPtyId === ended.ptyId);
                  if (mirrorTab) {
                    usePanelLayoutStore.getState().removeGlobalTerminalTab(mirrorTab.id);
                  }
                }
              }}
              className={cn(
                "mt-1 text-xs text-white/60 hover:text-white transition-colors",
              )}
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TerminalInstance, (prev, next) =>
  prev.paneId === next.paneId && prev.ptyId === next.ptyId,
);
