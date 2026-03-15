import { useEffect, useRef, useCallback } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { Command } from "lucide-react";
import Sidebar from "./components/sidebar/Sidebar";
import TerminalPanel from "./components/terminal/TerminalPanel";
import DiffPanel from "./components/diff/DiffPanel";
import { usePanelLayoutStore } from "./store/panel-layout";
import { useFullscreen } from "./hooks/useFullscreen";

const TITLE_BAR_HEIGHT = 38;

function TitleBar() {
  const isFullscreen = useFullscreen();

  return (
    <div
      className="flex items-center shrink-0 bg-sidebar select-none border-b border-border"
      style={{ height: TITLE_BAR_HEIGHT }}
      data-tauri-drag-region
    >
      {/* Traffic light spacer (macOS) — hidden in fullscreen */}
      {!isFullscreen && (
        <div className="w-[86px] shrink-0" data-tauri-drag-region />
      )}

      {/* Logo */}
      <div className="flex items-center gap-1" data-tauri-drag-region>
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
  const { main, loaded, init, updateMain } = usePanelLayoutStore();
  const dragging = useRef(false);

  useEffect(() => {
    init();
  }, [init]);

  const handleChange = useCallback(
    (sizes: number[]) => {
      if (dragging.current && sizes.length > 0) {
        updateMain(sizes);
      }
    },
    [updateMain],
  );

  if (!loaded) return null;

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <TitleBar />
      <div className="flex-1 min-h-0">
        <Allotment
          defaultSizes={main.map((r) => r * 1000)}
          onDragStart={() => { dragging.current = true; }}
          onDragEnd={() => { dragging.current = false; }}
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
