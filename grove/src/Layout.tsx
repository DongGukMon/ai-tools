import { Allotment } from "allotment";
import "allotment/dist/style.css";
import Sidebar from "./components/sidebar/Sidebar";
import TerminalPanel from "./components/terminal/TerminalPanel";
import DiffPanel from "./components/diff/DiffPanel";

function Layout() {
  return (
    <div className="h-full w-full bg-[var(--color-bg)]">
      <Allotment>
        <Allotment.Pane preferredSize={240} minSize={180}>
          <Sidebar />
        </Allotment.Pane>
        <Allotment.Pane>
          <TerminalPanel />
        </Allotment.Pane>
        <Allotment.Pane preferredSize={420} minSize={320}>
          <DiffPanel />
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}

export default Layout;
