import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { Minus, Maximize2 } from "lucide-react";
import { useTerminalStore } from "../../store/terminal";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { acquireTerminalRuntime } from "../../lib/terminal-runtime";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/button";

interface Props {
  paneId: string;
  ptyId: string;
}

function GlobalTerminalPanel({ paneId, ptyId }: Props) {
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
          "flex items-center justify-between border-t border-border bg-sidebar px-2 h-9 shrink-0",
        )}
      >
        <span className={cn("text-xs text-muted-foreground select-none")}>
          Terminal
        </span>
        <IconButton onClick={toggle} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? (
            <Maximize2 className={cn("size-3.5")} />
          ) : (
            <Minus className={cn("size-3.5")} />
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
