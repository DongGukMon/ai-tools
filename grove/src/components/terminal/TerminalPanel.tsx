import { useEffect, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
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
  buildTerminalPaneTopologySignature,
  buildTerminalSnapshotRequest,
  collectTerminalPanes,
  findWorktreePathForPtyId,
} from "../../lib/terminal-session";
import {
  getTerminalPaneLaunchCwd,
  subscribeTerminalPaneActivity,
} from "../../lib/terminal-runtime";

const SNAPSHOT_SAVE_DEBOUNCE_MS = 750;

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
  const previousPaneTopologyRef = useRef(new Map<string, string>());
  const snapshotSaveTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const sessionsRef = useRef(sessions);

  sessionsRef.current = sessions;

  const persistSnapshot = (worktreePath: string) => {
    const node = sessionsRef.current[worktreePath];
    void saveTerminalSessionSnapshot(
      buildTerminalSnapshotRequest(
        worktreePath,
        node,
        new Map(
          (node ? collectTerminalPanes(node) : []).map((pane) => [
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
    });
  };

  const scheduleSnapshotSave = (worktreePath: string) => {
    const timers = snapshotSaveTimersRef.current;
    const existing = timers.get(worktreePath);
    if (existing) {
      clearTimeout(existing);
    }

    timers.set(
      worktreePath,
      setTimeout(() => {
        timers.delete(worktreePath);
        persistSnapshot(worktreePath);
      }, SNAPSHOT_SAVE_DEBOUNCE_MS),
    );
  };

  useEffect(() => {
    const previous = previousPaneTopologyRef.current;
    const changedPaths = new Set<string>([
      ...previous.keys(),
      ...Object.keys(sessions),
    ]);

    const nextSignatures = new Map<string, string>();
    for (const worktreePath of changedPaths) {
      const nextSignature = buildTerminalPaneTopologySignature(
        sessions[worktreePath],
      );
      if (nextSignature) {
        nextSignatures.set(worktreePath, nextSignature);
      }
      if (
        previous.has(worktreePath) &&
        previous.get(worktreePath) !== nextSignature
      ) {
        scheduleSnapshotSave(worktreePath);
      }
    }

    previousPaneTopologyRef.current = nextSignatures;
  }, [sessions]);

  useEffect(
    () => subscribeTerminalPaneActivity(({ ptyId }) => {
      const worktreePath = findWorktreePathForPtyId(sessionsRef.current, ptyId);
      if (!worktreePath) {
        return;
      }

      scheduleSnapshotSave(worktreePath);
    }),
    [],
  );

  useEffect(() => () => {
    for (const [worktreePath, timer] of snapshotSaveTimersRef.current.entries()) {
      clearTimeout(timer);
      persistSnapshot(worktreePath);
    }
    snapshotSaveTimersRef.current.clear();
  }, []);

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
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <TerminalSquare className="size-10 text-muted-foreground/50" />
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
