import { Allotment } from "allotment";
import "allotment/dist/style.css";
import Sidebar from "./components/sidebar/Sidebar";

function Layout() {
  return (
    <div className="app-layout">
      <Allotment>
        <Allotment.Pane preferredSize={240} minSize={180}>
          <div className="panel panel-sidebar">
            <Sidebar />
          </div>
        </Allotment.Pane>
        <Allotment.Pane>
          <div className="panel panel-terminal">
            <div className="panel-placeholder">Terminal (W3)</div>
          </div>
        </Allotment.Pane>
        <Allotment.Pane preferredSize={400} minSize={200}>
          <div className="panel panel-diff">
            <div className="panel-placeholder">Diff Panel (W4)</div>
          </div>
        </Allotment.Pane>
      </Allotment>
    </div>
  );
}

export default Layout;
