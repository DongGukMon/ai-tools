import { useEffect, useRef, useCallback } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import Sidebar from "./components/sidebar/Sidebar";
import TerminalPanel from "./components/terminal/TerminalPanel";
import DiffPanel from "./components/diff/DiffPanel";
import { usePanelLayoutStore } from "./store/panel-layout";

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
    <div className="h-full w-full bg-background border-t border-border/50">
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
  );
}

export default Layout;
