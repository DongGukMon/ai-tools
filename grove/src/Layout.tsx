import { useEffect, useRef, useCallback } from "react";
import type { MouseEvent } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { Command } from "lucide-react";
import { cn } from "./lib/cn";
import Sidebar from "./components/sidebar/Sidebar";
import TerminalPanel from "./components/terminal/TerminalPanel";
import DiffPanel from "./components/diff/DiffPanel";
import { windowDragRegionProps } from "./lib/platform";
import { usePanelLayoutStore } from "./store/panel-layout";
import { useFullscreen } from "./hooks/useFullscreen";

const TITLE_BAR_HEIGHT = 38;

function TitleBar() {
  const isFullscreen = useFullscreen();

  return (
    <div
      className="flex items-center shrink-0 bg-sidebar select-none border-b border-border"
      style={{ height: TITLE_BAR_HEIGHT }}
      {...windowDragRegionProps}
    >
      {/* Traffic light spacer (macOS) / padding in fullscreen */}
      {!isFullscreen && (
        <div className="w-[86px] shrink-0" {...windowDragRegionProps} />
      )}

      {/* Logo */}
      <div
        className={cn("flex items-center gap-1", { "pl-4": isFullscreen })}
        {...windowDragRegionProps}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded bg-accent">
          <Command className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-foreground">
          grove{import.meta.env.DEV && " (dev)"}
        </span>
      </div>
    </div>
  );
}

function Layout() {
  const main = usePanelLayoutStore((s) => s.main);
  const loaded = usePanelLayoutStore((s) => s.loaded);
  const init = usePanelLayoutStore((s) => s.init);
  const updateMain = usePanelLayoutStore((s) => s.updateMain);
  const dragging = useRef(false);
  const pendingSizesRef = useRef<number[] | null>(null);
  const resetPendingRef = useRef(false);
  const resetClearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const clearResetPending = useCallback(() => {
    if (resetClearTimerRef.current !== null) {
      window.clearTimeout(resetClearTimerRef.current);
      resetClearTimerRef.current = null;
    }
    resetPendingRef.current = false;
  }, []);

  useEffect(() => clearResetPending, [clearResetPending]);

  const handleDragStart = useCallback(() => {
    dragging.current = true;
    pendingSizesRef.current = null;
    clearResetPending();
  }, [clearResetPending]);

  const handleSashDoubleClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-testid='sash']")) {
        return;
      }

      clearResetPending();
      resetPendingRef.current = true;
      resetClearTimerRef.current = window.setTimeout(() => {
        resetPendingRef.current = false;
        resetClearTimerRef.current = null;
      }, 0);
    },
    [clearResetPending],
  );

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (sizes.length === 0) return;

      if (dragging.current) {
        pendingSizesRef.current = sizes.slice();
        return;
      }

      if (!resetPendingRef.current) {
        return;
      }

      clearResetPending();
      updateMain(sizes);
    },
    [clearResetPending, updateMain],
  );

  const handleDragEnd = useCallback((sizes: number[]) => {
    dragging.current = false;

    const finalSizes = sizes.length > 0 ? sizes : pendingSizesRef.current;
    pendingSizesRef.current = null;
    if (finalSizes && finalSizes.length > 0) {
      updateMain(finalSizes);
    }
    clearResetPending();
  }, [clearResetPending, updateMain]);

  if (!loaded) return null;

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <TitleBar />
      <div
        className="flex-1 min-h-0"
        onDoubleClickCapture={handleSashDoubleClickCapture}
      >
        <Allotment
          defaultSizes={main.map((r) => r * 1000)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onChange={handleChange}
        >
          <Allotment.Pane minSize={180}>
            <Sidebar />
          </Allotment.Pane>
          <Allotment.Pane>
            <TerminalPanel />
          </Allotment.Pane>
          <Allotment.Pane minSize={280}>
            <DiffPanel />
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}

export default Layout;
