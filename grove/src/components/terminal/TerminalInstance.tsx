import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTerminalStore } from "../../store/terminal";
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
    </div>
  );
}

export default memo(TerminalInstance, (prev, next) =>
  prev.paneId === next.paneId && prev.ptyId === next.ptyId,
);
