import { useEffect, useRef, useState } from "react";
import { useTerminalStore } from "../../store/terminal";
import { useProjectStore } from "../../store/project";
import {
  getTerminalTheme,
  getAppConfig,
  getCommandErrorMessage,
  saveTerminalSessionSnapshot,
} from "../../lib/tauri";
import { runCommand } from "../../lib/command";
import { useTerminal } from "../../hooks/useTerminal";
import SplitContainer from "./SplitContainer";
import TerminalToolbar from "./TerminalToolbar";
import { log, error as logError } from "../../lib/logger";
import {
  buildTerminalSnapshotRequest,
  collectTerminalPanes,
} from "../../lib/terminal-session";
import { getTerminalPaneLaunchCwd } from "../../lib/terminal-runtime";


export default function TerminalPanel() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const theme = useTerminalStore((s) => s.theme);
  const loadTheme = useTerminalStore((s) => s.loadTheme);
  const setDetectedTheme = useTerminalStore((s) => s.setDetectedTheme);
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree);
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const { createTerminal } = useTerminal();
  const [error, setError] = useState<string | null>(null);
  const previousSessionSignaturesRef = useRef(new Map<string, string>());

  useEffect(() => {
    // tmux session continuity is the primary restore path. Persist snapshots only
    // as fallback metadata when the live Grove-managed tmux session is missing.
    const structureSignature = (node: (typeof sessions)[string] | undefined) =>
      node
        ? collectTerminalPanes(node)
            .map((pane) => `${pane.paneId}:${pane.ptyId ?? ""}`)
            .join("|")
        : "";

    const previous = previousSessionSignaturesRef.current;
    const changedPaths = new Set<string>([
      ...previous.keys(),
      ...Object.keys(sessions),
    ]);

    const nextSignatures = new Map<string, string>();
    const pathsToPersist: string[] = [];
    for (const worktreePath of changedPaths) {
      const nextSignature = structureSignature(sessions[worktreePath]);
      if (nextSignature) {
        nextSignatures.set(worktreePath, nextSignature);
      }
      if (previous.get(worktreePath) !== nextSignature) {
        pathsToPersist.push(worktreePath);
      }
    }

    previousSessionSignaturesRef.current = nextSignatures;

    if (pathsToPersist.length === 0) {
      return;
    }

    void Promise.all(
      pathsToPersist.map((worktreePath) =>
        saveTerminalSessionSnapshot(
          buildTerminalSnapshotRequest(
            worktreePath,
            sessions[worktreePath],
            new Map(
              (sessions[worktreePath]
                ? collectTerminalPanes(sessions[worktreePath])
                : []
              ).map((pane) => [
                pane.paneId,
                getTerminalPaneLaunchCwd(pane.paneId) ?? worktreePath,
              ]),
            ),
          ),
        ).catch((cause) => {
          logError("terminal", "fallback snapshot save failed", {
            worktreePath,
            cause,
          });
        }),
      ),
    );
  }, [sessions]);

  // Load theme + default worktree
  useEffect(() => {
    async function init() {
      try {
        log("terminal", "init start");
        await useTerminalStore.getState().initLayouts();
        log("terminal", "layouts loaded");

        const config = await runCommand(() => getAppConfig(), {
          errorToast: false,
        });
        log("terminal", "config loaded", { hasTerminalTheme: !!config.terminalTheme });

        log("terminal", "detecting system theme...");
        const result = await runCommand(() => getTerminalTheme(), {
          errorToast: false,
        });
        log("terminal", "system theme result", { detected: result.detected, bg: result.theme.background, fg: result.theme.foreground });

        // Only expose System preset if detection actually succeeded
        if (result.detected) {
          setDetectedTheme(result.theme);
        }

        if (config.terminalTheme) {
          const merged = { ...result.theme, ...config.terminalTheme };
          log("terminal", "using saved theme override", { bg: merged.background });
          loadTheme(merged);
        } else {
          log("terminal", "using detected theme");
          loadTheme(result.theme);
        }
        log("terminal", "init complete");
      } catch (e) {
        logError("terminal", "init failed", e);
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
    if (!activeWorktree || !theme) {
      log("terminal", "skip session create", { activeWorktree, hasTheme: !!theme });
      return;
    }
    if (sessions[activeWorktree]) {
      log("terminal", "session exists", activeWorktree);
      return;
    }
    log("terminal", "creating session", activeWorktree);
    createTerminal(activeWorktree).catch((e) => {
      logError("terminal", "session create failed", e);
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
