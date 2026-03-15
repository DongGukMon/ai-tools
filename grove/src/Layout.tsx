import { Allotment } from "allotment";
import "allotment/dist/style.css";
import Sidebar from "./components/sidebar/Sidebar";
import TerminalPanel from "./components/terminal/TerminalPanel";
import DiffPanel from "./components/diff/DiffPanel";
import { cn } from "./lib/cn";

function Layout() {
  return (
    <div className={cn("h-full min-h-0 w-full overflow-hidden bg-[var(--color-card)]")}>
      <Allotment className={cn("h-full w-full bg-[var(--color-card)]")}>
        <Allotment.Pane preferredSize={240} minSize={180}>
          <Sidebar />
        </Allotment.Pane>
        <Allotment.Pane>
          <TerminalPanel />
        </Allotment.Pane>
        <Allotment.Pane preferredSize={420} minSize={350}>
          <DiffPanel />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}

export default Layout;
