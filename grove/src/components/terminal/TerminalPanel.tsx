import { useEffect } from "react";
import { useTerminalStore } from "../../store/terminal";
import { getTerminalTheme, getAppConfig } from "../../lib/tauri";
import { useTerminal } from "../../hooks/useTerminal";
import SplitContainer from "./SplitContainer";
import TerminalToolbar from "./TerminalToolbar";

export default function TerminalPanel() {
  const { sessions, activeWorktree, theme, loadTheme, setActiveWorktree } =
    useTerminalStore();
  const { createTerminal } = useTerminal();

  useEffect(() => {
    async function init() {
      const t = await getTerminalTheme();
      loadTheme(t);

      if (!useTerminalStore.getState().activeWorktree) {
        const config = await getAppConfig();
        const home = config.baseDir.replace(/[/\\]\.grove$/, "");
        setActiveWorktree(home || "/");
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!activeWorktree) return;
    if (sessions[activeWorktree]) return;
    createTerminal(activeWorktree);
  }, [activeWorktree]);

  const rootNode = activeWorktree ? sessions[activeWorktree] : null;

  if (!theme) {
    return (
      <div className="panel panel-terminal">
        <div className="panel-placeholder">Loading terminal...</div>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <TerminalToolbar />
      <div className="terminal-content">
        {rootNode ? (
          <SplitContainer node={rootNode} />
        ) : (
          <div className="panel-placeholder">No terminal session</div>
        )}
      </div>
    </div>
  );
}
