import { useEffect, useState } from "react";
import { useTerminalStore } from "../../store/terminal";
import { useProjectStore } from "../../store/project";
import { getTerminalTheme, getAppConfig, getCommandErrorMessage } from "../../lib/tauri";
import { runCommand } from "../../lib/command";
import { useTerminal } from "../../hooks/useTerminal";
import SplitContainer from "./SplitContainer";
import TerminalToolbar from "./TerminalToolbar";


export default function TerminalPanel() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const theme = useTerminalStore((s) => s.theme);
  const loadTheme = useTerminalStore((s) => s.loadTheme);
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree);
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const { createTerminal } = useTerminal();
  const [error, setError] = useState<string | null>(null);

  // Load theme + default worktree
  useEffect(() => {
    async function init() {
      try {
        await useTerminalStore.getState().initLayouts();
        const config = await runCommand(() => getAppConfig(), {
          errorToast: false,
        });
        // Use saved theme override if available, otherwise detect
        if (config.terminalTheme) {
          const detected = await runCommand(() => getTerminalTheme(), {
            errorToast: false,
          });
          // Merge: saved theme takes precedence, fill gaps from detected
          loadTheme({ ...detected, ...config.terminalTheme });
        } else {
          const t = await runCommand(() => getTerminalTheme(), {
            errorToast: false,
          });
          loadTheme(t);
        }
        // Don't auto-open a terminal — wait for worktree selection
      } catch (e) {
        setError(getCommandErrorMessage(e));
      }
    }
    init();
  }, []);

  // Sync sidebar -> terminal
  useEffect(() => {
    setActiveWorktree(selectedWorktree?.path ?? null);
  }, [selectedWorktree?.path, setActiveWorktree]);

  // Create session for new worktree
  useEffect(() => {
    if (!activeWorktree || !theme) return;
    if (sessions[activeWorktree]) return;
    createTerminal(activeWorktree).catch((e) => {
      setError(getCommandErrorMessage(e));
    });
  }, [activeWorktree, theme]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <span className="text-sm text-destructive px-4">Error: {error}</span>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const sessionEntries = Object.entries(sessions);

  return (
    <div className="flex flex-col h-full bg-background">
      <TerminalToolbar />
      <div className="flex-1 relative overflow-hidden">
        {!activeWorktree ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Select a worktree to open terminal</span>
          </div>
        ) : (
          // Render ALL sessions, show/hide via CSS - preserves xterm state
          sessionEntries.map(([path, node]) => (
            <div
              key={path}
              className="absolute inset-0"
              style={{ display: path === activeWorktree ? "block" : "none" }}
            >
              <SplitContainer node={node} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
