import { useCallback, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { useTabStore, selectCurrentActiveTabId } from "../../store/tab";
import { useProjectStore } from "../../store/project";
import { useTerminalStore } from "../../store/terminal";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { useBroadcastStore } from "../../store/broadcast";
import { useGlobalTerminal } from "../../hooks/useGlobalTerminal";
import {
  acquireTerminalRuntime,
  getRuntimeSize,
  captureRuntimeSnapshot,
} from "../../lib/terminal-runtime";
import {
  buildBroadcastSessionKey,
  restoreBroadcastSessionSize,
} from "../../lib/broadcast-session";
import { collectTerminalPanes } from "../../lib/terminal-session";
import { shouldStartPipBroadcast } from "../../lib/broadcast-policy";
import { cn } from "../../lib/cn";
import TerminalPanel from "../terminal/TerminalPanel";
import ChangesPanel from "./ChangesPanel";
import PipTerminal from "./PipTerminal";
import GlobalTerminalPanel from "../terminal/GlobalTerminalPanel";
import { ResizablePanelGroup } from "../ui/resizable-panel-group";

function BrowserPlaceholder() {
  return (
    <div className={cn("flex h-full items-center justify-center gap-2 text-muted-foreground")}>
      <Globe className={cn("h-5 w-5")} />
      <span className={cn("text-sm")}>Browser (coming soon)</span>
    </div>
  );
}

/** Find paneId for a given ptyId in the terminal sessions */
function findPaneIdForPty(ptyId: string): string | null {
  const sessions = useTerminalStore.getState().sessions;
  for (const node of Object.values(sessions)) {
    for (const pane of collectTerminalPanes(node)) {
      if (pane.ptyId === ptyId) return pane.paneId;
    }
  }
  return null;
}

function AppTabContent() {
  const selectedWorktreePath = useProjectStore((s) => s.selectedWorktree?.path ?? null);
  const setActiveWorktree = useTabStore((s) => s.setActiveWorktree);

  useEffect(() => {
    setActiveWorktree(selectedWorktreePath);
  }, [selectedWorktreePath, setActiveWorktree]);

  const activeTabId = useTabStore(selectCurrentActiveTabId);
  const isTerminal = activeTabId === "terminal";
  const isChanges = activeTabId === "changes";

  const theme = useTerminalStore((s) => s.theme);
  const focusedPtyId = useTerminalStore((s) => s.focusedPtyId);
  const pips = useBroadcastStore((s) => s.pips);
  const pip = useBroadcastStore((s) =>
    selectedWorktreePath ? (s.pips[selectedWorktreePath] ?? null) : null,
  );
  const isFocusedPtyMirroring = useBroadcastStore((s) =>
    focusedPtyId ? Boolean(s.mirrors[focusedPtyId]) : false,
  );
  const startPip = useBroadcastStore((s) => s.startPip);
  const stopPip = useBroadcastStore((s) => s.stopPip);

  const [pipDismissedByWorktree, setPipDismissedByWorktree] = useState<Record<string, boolean>>({});
  const prevIsTerminalRef = useRef(isTerminal);
  const pipContainerRef = useRef<HTMLDivElement>(null);
  const pipRuntimeMapRef = useRef(
    new Map<
      string,
      {
        ptyId: string;
        paneId: string;
        sessionKey: string;
        runtime: ReturnType<typeof acquireTerminalRuntime>;
      }
    >(),
  );
  const attachedPipSessionRef = useRef<{ worktreePath: string; sessionKey: string } | null>(null);

  const pipDismissed = selectedWorktreePath
    ? (pipDismissedByWorktree[selectedWorktreePath] ?? true)
    : true;

  // PiP broadcast policy
  useEffect(() => {
    const wasTerminal = prevIsTerminalRef.current;
    prevIsTerminalRef.current = isTerminal;

    if (isTerminal) {
      // Returning to Terminal tab — stop PiP broadcast if active
      if (selectedWorktreePath && pip) {
        const ended = stopPip(selectedWorktreePath);
        restoreBroadcastSessionSize(ended);
      }
    } else if (
      selectedWorktreePath &&
      shouldStartPipBroadcast({
        isTerminal,
        wasTerminal,
        focusedPtyId,
        hasActivePip: Boolean(pip),
        isFocusedPtyMirroring,
      })
    ) {
      if (!focusedPtyId) {
        return;
      }
      const ptyId = focusedPtyId;
      const paneId = findPaneIdForPty(ptyId);
      if (paneId) {
        const { cols, rows } = getRuntimeSize(paneId);
        const snapshot = captureRuntimeSnapshot(paneId);
        startPip(selectedWorktreePath, ptyId, paneId, cols, rows, snapshot);
      }
    }
  }, [
    isFocusedPtyMirroring,
    isTerminal,
    focusedPtyId,
    pip,
    selectedWorktreePath,
    startPip,
    stopPip,
  ]);

  const hasPipBroadcast =
    !isTerminal &&
    !!selectedWorktreePath &&
    !!pip;

  useEffect(() => {
    const runtimeMap = pipRuntimeMapRef.current;
    const activeWorktreePaths = new Set(Object.keys(pips));

    for (const [worktreePath, session] of Object.entries(pips)) {
      const sessionKey = buildBroadcastSessionKey(worktreePath, session);
      const current = runtimeMap.get(worktreePath);
      if (current?.sessionKey === sessionKey) {
        continue;
      }

      current?.runtime.detach();
      current?.runtime.release();

      runtimeMap.set(worktreePath, {
        ptyId: session.ptyId,
        paneId: session.paneId,
        sessionKey,
        runtime: acquireTerminalRuntime(session.paneId, theme),
      });
    }

    for (const [worktreePath, entry] of runtimeMap.entries()) {
      if (activeWorktreePaths.has(worktreePath)) {
        continue;
      }

      entry.runtime.detach();
      entry.runtime.release();
      runtimeMap.delete(worktreePath);
      if (attachedPipSessionRef.current?.worktreePath === worktreePath) {
        attachedPipSessionRef.current = null;
      }
    }
  }, [pips, theme]);

  useEffect(() => {
    for (const { runtime } of pipRuntimeMapRef.current.values()) {
      runtime.setTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    const runtimeMap = pipRuntimeMapRef.current;
    const activeSessionKey = pip && selectedWorktreePath
      ? buildBroadcastSessionKey(selectedWorktreePath, pip)
      : null;
    const attachedSession = attachedPipSessionRef.current;
    if (
      attachedSession &&
      (!selectedWorktreePath ||
        attachedSession.worktreePath !== selectedWorktreePath ||
        !hasPipBroadcast ||
        attachedSession.sessionKey !== activeSessionKey)
    ) {
      runtimeMap.get(attachedSession.worktreePath)?.runtime.detach();
      attachedPipSessionRef.current = null;
    }

    if (!hasPipBroadcast || !pip || !selectedWorktreePath) {
      return;
    }

    const container = pipContainerRef.current;
    const entry = runtimeMap.get(selectedWorktreePath);
    if (!container || !entry) {
      return;
    }

    entry.runtime.attach(container);
    attachedPipSessionRef.current = {
      worktreePath: selectedWorktreePath,
      sessionKey: activeSessionKey ?? entry.sessionKey,
    };
    requestAnimationFrame(() => {
      entry.runtime.fitAddon.fit();
    });
  }, [hasPipBroadcast, pip?.paneId, pip?.ptyId, selectedWorktreePath]);

  useEffect(() => () => {
    for (const { runtime } of pipRuntimeMapRef.current.values()) {
      runtime.detach();
      runtime.release();
    }
    pipRuntimeMapRef.current.clear();
    attachedPipSessionRef.current = null;
  }, []);

  const {
    tabs: globalTabs,
    activeTabId: globalActiveTabId,
    addTab: addGlobalTab,
    removeTab: removeGlobalTab,
    selectTab: selectGlobalTab,
    getTabPtyId: getGlobalTabPtyId,
    isTabReady: isGlobalTabReady,
  } = useGlobalTerminal();

  const collapsed = usePanelLayoutStore((s) => s.globalTerminal.collapsed);
  const ratio = usePanelLayoutStore((s) => s.globalTerminal.ratio);
  const updateGlobalTerminal = usePanelLayoutStore((s) => s.updateGlobalTerminal);

  const handleRatioCommit = useCallback(
    (ratios: number[]) => {
      if (ratios.length === 2) {
        updateGlobalTerminal({ ratio: ratios[1] });
      }
    },
    [updateGlobalTerminal],
  );

  const hasGlobalPanel = globalTabs.length > 0;
  const globalPanel = hasGlobalPanel ? (
    <GlobalTerminalPanel
      tabs={globalTabs}
      activeTabId={globalActiveTabId}
      getTabPtyId={getGlobalTabPtyId}
      isTabReady={isGlobalTabReady}
      onAdd={addGlobalTab}
      onRemove={removeGlobalTab}
      onSelect={selectGlobalTab}
    />
  ) : null;

  const setActiveTab = useTabStore((s) => s.setActiveTab);

  const handlePipDismiss = useCallback(() => {
    if (!selectedWorktreePath) {
      return;
    }
    setPipDismissedByWorktree((state) => ({
      ...state,
      [selectedWorktreePath]: true,
    }));
  }, [selectedWorktreePath]);

  const handlePipRestore = useCallback(() => {
    if (!selectedWorktreePath) {
      return;
    }
    setPipDismissedByWorktree((state) => ({
      ...state,
      [selectedWorktreePath]: false,
    }));
  }, [selectedWorktreePath]);

  const activePipKey = pip && selectedWorktreePath
    ? buildBroadcastSessionKey(selectedWorktreePath, pip)
    : null;

  const pipElement = hasPipBroadcast && (
    <PipTerminal
      key={activePipKey ?? "pip"}
      containerRef={pipContainerRef}
      dismissed={pipDismissed}
      onDismiss={handlePipDismiss}
      onRestore={handlePipRestore}
      onClickHeader={() => setActiveTab("terminal")}
    />
  );

  const tabContent = (
    <>
      {/* Terminal always mounted, hidden when not active tab */}
      <div
        className={cn("absolute inset-0 flex flex-col")}
        style={{ display: isTerminal ? "flex" : "none" }}
      >
        <TerminalPanel />
      </div>

      {isChanges && (
        <div className={cn("absolute inset-0")}>
          <ChangesPanel />
        </div>
      )}

      {activeTabId !== "terminal" && activeTabId !== "changes" && (
        <div className={cn("absolute inset-0")}>
          <BrowserPlaceholder />
        </div>
      )}

      {pipElement}
    </>
  );

  if (!hasGlobalPanel || collapsed) {
    return (
      <div className={cn("flex flex-col flex-1 min-h-0")}>
        <div className={cn("flex-1 relative overflow-hidden")}>
          {tabContent}
        </div>
        {globalPanel}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      className={cn("flex-1 min-h-0")}
      vertical
      ratios={[1 - ratio, ratio]}
      onCommit={handleRatioCommit}
    >
      <ResizablePanelGroup.Pane>
        <div className={cn("relative h-full overflow-hidden")}>
          {tabContent}
        </div>
      </ResizablePanelGroup.Pane>
      <ResizablePanelGroup.Pane>
        {globalPanel}
      </ResizablePanelGroup.Pane>
    </ResizablePanelGroup>
  );
}

export default AppTabContent;
