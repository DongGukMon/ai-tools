import { memo, useEffect, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useTerminalStore } from "../../store/terminal";
import { useProjectStore } from "../../store/project";
import {
  getTerminalTheme,
  getAppConfig,
  getCommandErrorMessage,
  pollPtyBells,
  saveTerminalSessionSnapshot,
} from "../../lib/platform";
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
import { cn } from "../../lib/cn";
import type { SplitNode } from "../../types";

const SNAPSHOT_SAVE_DEBOUNCE_MS = 750;
const PTY_BELL_POLL_MS = 1000;

function buildPaneTopologySignatures(sessions: Record<string, SplitNode>) {
  const signatures = new Map<string, string>();

  for (const [worktreePath, node] of Object.entries(sessions)) {
    const signature = buildTerminalPaneTopologySignature(node);
    if (signature) {
      signatures.set(worktreePath, signature);
    }
  }

  return signatures;
}

const TerminalSessionView = memo(function TerminalSessionView({
  worktreePath,
}: {
  worktreePath: string;
}) {
  const isActive = useTerminalStore((s) => s.activeWorktree === worktreePath);
  const node = useTerminalStore((s) => s.sessions[worktreePath] ?? null);

  if (!node) {
    return null;
  }

  return (
    <div
      className={cn("absolute inset-0")}
      style={{ display: isActive ? "block" : "none" }}
    >
      <SplitContainer node={node} worktreePath={worktreePath} />
    </div>
  );
});

function TerminalPanel() {
  const worktreePaths = useTerminalStore(
    useShallow((s) => Object.keys(s.sessions)),
  );
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const hasActiveSession = useTerminalStore((s) =>
    s.activeWorktree ? s.sessions[s.activeWorktree] !== undefined : false,
  );
  const theme = useTerminalStore((s) => s.theme);
  const loadTheme = useTerminalStore((s) => s.loadTheme);
  const setDetectedTheme = useTerminalStore((s) => s.setDetectedTheme);
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree);
  const markBellPty = useTerminalStore((s) => s.markBellPty);
  const selectedWorktreePath = useProjectStore((s) => s.selectedWorktree?.path ?? null);
  const { createTerminal } = useTerminal();
  const [error, setError] = useState<string | null>(null);
  const previousPaneTopologyRef = useRef(new Map<string, string>());
  const snapshotSaveTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const sessionsRef = useRef(useTerminalStore.getState().sessions);

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
    const initialSessions = useTerminalStore.getState().sessions;
    sessionsRef.current = initialSessions;
    previousPaneTopologyRef.current = buildPaneTopologySignatures(initialSessions);

    return useTerminalStore.subscribe((state, previousState) => {
      if (state.sessions === previousState.sessions) {
        return;
      }

      sessionsRef.current = state.sessions;

      const previous = previousPaneTopologyRef.current;
      const next = buildPaneTopologySignatures(state.sessions);
      const changedPaths = new Set<string>([
        ...previous.keys(),
        ...Object.keys(state.sessions),
      ]);

      for (const worktreePath of changedPaths) {
        const nextSignature = next.get(worktreePath);
        if (
          previous.has(worktreePath) &&
          previous.get(worktreePath) !== nextSignature
        ) {
          scheduleSnapshotSave(worktreePath);
        }
      }

      previousPaneTopologyRef.current = next;
    });
  }, []);

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
    setActiveWorktree(selectedWorktreePath);
  }, [selectedWorktreePath, setActiveWorktree]);

  useEffect(() => {
    let cancelled = false;
    let polling = false;

    const pollBellEvents = async () => {
      if (polling || cancelled || Object.keys(sessionsRef.current).length === 0) {
        return;
      }

      polling = true;
      try {
        const bells = await pollPtyBells();
        if (cancelled || bells.length === 0) {
          return;
        }

        const activePath = useTerminalStore.getState().activeWorktree;
        for (const { ptyId } of bells) {
          const worktreePath = findWorktreePathForPtyId(sessionsRef.current, ptyId);
          if (!worktreePath || worktreePath === activePath) {
            continue;
          }

          markBellPty(ptyId);
        }
      } catch {
        // Ignore bell polling errors to avoid noisy UI while sessions churn.
      } finally {
        polling = false;
      }
    };

    void pollBellEvents();
    const timer = window.setInterval(() => {
      void pollBellEvents();
    }, PTY_BELL_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [markBellPty]);

  // Create session for new worktree
  useEffect(() => {
    if (!activeWorktree || !theme) {
      log("terminal", "skip session create", { activeWorktree, hasTheme: !!theme });
      return;
    }
    if (hasActiveSession) {
      log("terminal", "session exists", activeWorktree);
      return;
    }
    log("terminal", "creating session", activeWorktree);
    createTerminal(activeWorktree).catch((e) => {
      logError("terminal", "session create failed", e);
      setError(getCommandErrorMessage(e));
    });
  }, [activeWorktree, createTerminal, hasActiveSession, theme]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-background")}>
        <span className={cn("text-sm text-destructive px-4")}>Error: {error}</span>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-background")}>
        <span className={cn("text-sm text-muted-foreground")}>Loading...</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background")}>
      <TerminalToolbar />
      <div className={cn("flex-1 relative overflow-hidden")}>
        {!activeWorktree ? (
          <div className={cn("flex flex-col items-center justify-center h-full gap-3")}>
            <TerminalSquare className={cn("size-10 text-muted-foreground/50")} />
            <span className={cn("text-sm text-muted-foreground")}>Select a worktree to open terminal</span>
          </div>
        ) : (
          // Render ALL sessions, show/hide via CSS - preserves xterm state
          worktreePaths.map((path) => (
            <TerminalSessionView
              key={path}
              worktreePath={path}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(TerminalPanel);
