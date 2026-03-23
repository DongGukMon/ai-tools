import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useTerminalStore } from "../../store/terminal";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { acquireTerminalRuntime } from "../../lib/terminal-runtime";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/button";

interface Props {
  paneId: string;
  ptyId: string;
  onReset: () => void;
}

function GlobalTerminalPanel({ paneId, ptyId, onReset }: Props) {
  const theme = useTerminalStore((s) => s.theme);
  const collapsed = usePanelLayoutStore((s) => s.globalTerminal.collapsed);
  const updateGlobalTerminal = usePanelLayoutStore(
    (s) => s.updateGlobalTerminal,
  );

  const termRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ReturnType<
    typeof acquireTerminalRuntime
  > | null>(null);

  const toggle = () => {
    updateGlobalTerminal({ collapsed: !collapsed });
  };

  // Acquire / release xterm runtime
  useLayoutEffect(() => {
    if (collapsed) return;

    const container = termRef.current;
    if (!container) return;

    const runtime = acquireTerminalRuntime(paneId, theme);
    runtimeRef.current = runtime;
    runtime.setPtyId(ptyId);
    runtime.attach(container);

    return () => {
      runtime.detach();
      runtime.release();
      runtimeRef.current = null;
    };
  }, [paneId, ptyId, theme, collapsed]);

  // Refit on expand
  useEffect(() => {
    if (collapsed) return;
    const runtime = runtimeRef.current;
    if (!runtime) return;

    requestAnimationFrame(() => {
      runtime.fitAddon.fit();
    });
  }, [collapsed]);

  // Update theme on runtime
  useEffect(() => {
    runtimeRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <div className={cn("flex flex-col", { "h-full": !collapsed })}>
      <div
        className={cn(
          "flex items-center justify-between border-t border-border bg-sidebar px-2 h-7 shrink-0",
        )}
      >
        <IconButton
          onClick={onReset}
          title="Reset Main Terminal"
          aria-label="Reset Main Terminal"
        >
          <svg
            className={cn("text-muted-foreground")}
            width="16"
            height="14"
            viewBox="0 0 18 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="0.75" y="0.75" width="16.5" height="12.5" rx="2" />
            <polyline points="5,5 7.5,7 5,9" />
            <line x1="9.5" y1="9" x2="13" y2="9" />
          </svg>
        </IconButton>
        <IconButton onClick={toggle} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? (
            <ChevronUp className={cn("size-3.5")} />
          ) : (
            <ChevronDown className={cn("size-3.5")} />
          )}
        </IconButton>
      </div>
      {!collapsed && (
        <div
          className={cn("flex-1 relative overflow-hidden p-4")}
          style={{ backgroundColor: theme?.background ?? "#000" }}
        >
          <div ref={termRef} className={cn("h-full w-full")} />
        </div>
      )}
    </div>
  );
}

export default memo(GlobalTerminalPanel);
