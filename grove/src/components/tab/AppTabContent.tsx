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
  const pip = useBroadcastStore((s) => s.pip);
  const isFocusedPtyMirroring = useBroadcastStore((s) =>
    focusedPtyId ? Boolean(s.mirrors[focusedPtyId]) : false,
  );
  const startPip = useBroadcastStore((s) => s.startPip);
  const stopPip = useBroadcastStore((s) => s.stopPip);

  const [pipPtyId, setPipPtyId] = useState<string | null>(null);
  const [pipDismissed, setPipDismissed] = useState(true);
  const prevIsTerminalRef = useRef(isTerminal);
  const pipContainerRef = useRef<HTMLDivElement>(null);
  const pipRuntimeRef = useRef<ReturnType<typeof acquireTerminalRuntime> | null>(null);

  // PiP broadcast policy
  useEffect(() => {
    const wasTerminal = prevIsTerminalRef.current;
    prevIsTerminalRef.current = isTerminal;

    if (isTerminal) {
      // Returning to Terminal tab — stop PiP broadcast if active
      if (pip) {
        stopPip();
      }
      setPipPtyId(null);
    } else if (
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
        startPip(ptyId, paneId, cols, rows, snapshot);
        setPipPtyId(ptyId);
      }
    }
  }, [isFocusedPtyMirroring, isTerminal, focusedPtyId, pip, startPip, stopPip]);

  const hasPipBroadcast =
    !isTerminal &&
    !!pipPtyId &&
    pip?.ptyId === pipPtyId;

  useEffect(() => {
    if (!hasPipBroadcast || !pip) {
      return;
    }

    const container = pipContainerRef.current;
    if (!container) {
      return;
    }

    const runtime = acquireTerminalRuntime(pip.paneId, theme);
    pipRuntimeRef.current = runtime;
    runtime.attach(container);
    requestAnimationFrame(() => {
      runtime.fitAddon.fit();
    });

    return () => {
      runtime.detach();
      runtime.release();
      if (pipRuntimeRef.current === runtime) {
        pipRuntimeRef.current = null;
      }
    };
  }, [hasPipBroadcast, pip?.paneId, theme]);

  useEffect(() => {
    pipRuntimeRef.current?.setTheme(theme);
  }, [theme]);

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
  }, []);

  const handlePipRestore = useCallback(() => {
    setPipDismissed(false);
  }, []);

  const pipElement = hasPipBroadcast && (
    <PipTerminal
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
