import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, ChevronLeft } from "lucide-react";
import { useTabStore, selectCurrentActiveTabId } from "../../store/tab";
import { useProjectStore } from "../../store/project";
import { useTerminalStore } from "../../store/terminal";
import { usePanelLayoutStore } from "../../store/panel-layout";
import { useBroadcastStore } from "../../store/broadcast";
import { useGlobalTerminal } from "../../hooks/useGlobalTerminal";
import { getRuntime, getRuntimeSize, captureRuntimeSnapshot } from "../../lib/terminal-runtime";
import { collectTerminalPanes } from "../../lib/terminal-session";
import { cn } from "../../lib/cn";
import TerminalPanel from "../terminal/TerminalPanel";
import ChangesPanel from "./ChangesPanel";
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

  const focusedPtyId = useTerminalStore((s) => s.focusedPtyId);
  const theme = useTerminalStore((s) => s.theme);
  const broadcastActive = useBroadcastStore((s) => s.active);
  const startBroadcast = useBroadcastStore((s) => s.startBroadcast);
  const stopBroadcast = useBroadcastStore((s) => s.stopBroadcast);

  const [pipPtyId, setPipPtyId] = useState<string | null>(null);
  const [pipDismissed, setPipDismissed] = useState(false);
  const prevIsTerminalRef = useRef(isTerminal);
  const pipContainerRef = useRef<HTMLDivElement>(null);

  // PiP broadcast policy
  useEffect(() => {
    const wasTerminal = prevIsTerminalRef.current;
    prevIsTerminalRef.current = isTerminal;

    if (isTerminal) {
      // Returning to Terminal tab — stop PiP broadcast if active
      if (broadcastActive?.target === "pip") {
        stopBroadcast();
      }
      setPipPtyId(null);
      setPipDismissed(false);
    } else if (wasTerminal && focusedPtyId && !broadcastActive) {
      const paneId = findPaneIdForPty(focusedPtyId);
      if (paneId) {
        const { cols, rows } = getRuntimeSize(paneId);
        const snapshot = captureRuntimeSnapshot(paneId);
        startBroadcast(focusedPtyId, paneId, "pip", cols, rows, snapshot);
        setPipPtyId(focusedPtyId);
        setPipDismissed(false);
      }
    }
  }, [isTerminal, focusedPtyId, broadcastActive, startBroadcast, stopBroadcast]);

  const showPip =
    !isTerminal &&
    !pipDismissed &&
    !!pipPtyId &&
    broadcastActive?.target === "pip" &&
    broadcastActive.ptyId === pipPtyId;

  useEffect(() => {
    if (!showPip || broadcastActive?.target !== "pip") {
      return;
    }

    const container = pipContainerRef.current;
    const runtime = getRuntime(broadcastActive.paneId);
    if (!container || !runtime) {
      return;
    }

    runtime.attach(container);
    requestAnimationFrame(() => {
      runtime.fitAddon.fit();
    });
  }, [broadcastActive?.paneId, broadcastActive?.target, showPip]);

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
    setPipDismissed(true);
    if (broadcastActive?.target === "pip") {
      stopBroadcast();
    }
  }, [broadcastActive, stopBroadcast]);

  const handlePipRestore = useCallback(() => {
    setPipDismissed(false);
    if (focusedPtyId && !broadcastActive) {
      const paneId = findPaneIdForPty(focusedPtyId);
      if (paneId) {
        const { cols, rows } = getRuntimeSize(paneId);
        const snapshot = captureRuntimeSnapshot(paneId);
        startBroadcast(focusedPtyId, paneId, "pip", cols, rows, snapshot);
        setPipPtyId(focusedPtyId);
      }
    }
  }, [focusedPtyId, broadcastActive, startBroadcast]);

  // PiP overlay
  const pipOverlay = showPip && pipPtyId && (
    <div
      className={cn(
        "absolute right-3 bottom-3 w-[360px] h-[200px] z-50 rounded-xl overflow-hidden",
        "shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10",
        "flex flex-col transition-all duration-300 ease-out",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-2 h-6 shrink-0 bg-sidebar/90 backdrop-blur-sm border-b border-white/10 cursor-pointer",
        )}
        onClick={() => setActiveTab("terminal")}
      >
        <span className={cn("text-[10px] font-medium text-muted-foreground truncate")}>
          Terminal
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePipDismiss();
          }}
          className={cn(
            "flex items-center justify-center size-4 rounded-sm text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors",
          )}
          title="Dismiss"
        >
          <ChevronLeft className={cn("size-3 rotate-180")} />
        </button>
      </div>
      <div className={cn("flex-1 min-h-0")}>
        <div
          ref={pipContainerRef}
          className={cn("h-full w-full")}
          style={{ backgroundColor: theme?.background ?? "#000" }}
        />
      </div>
    </div>
  );

  // Restore button when PiP is dismissed
  const restoreButton = !isTerminal && pipDismissed && (
    <button
      type="button"
      onClick={handlePipRestore}
      className={cn(
        "absolute right-0 bottom-6 z-50 flex items-center justify-center w-6 h-10 rounded-l-md",
        "bg-sidebar/90 border border-r-0 border-white/10 shadow-lg backdrop-blur-sm",
        "text-muted-foreground hover:text-foreground hover:bg-sidebar transition-colors",
        "animate-pulse",
      )}
      title="Show terminal"
    >
      <ChevronLeft className={cn("size-3.5")} />
    </button>
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

      {pipOverlay}
      {restoreButton}
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
