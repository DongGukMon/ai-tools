import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { Session, TabId, AnalysisData } from "./types";
import { Timeline } from "./components/Timeline";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";

const Minimap = lazy(() => import("./components/Minimap"));
const StatsPage = lazy(() => import("./components/stats/StatsPage"));
const AnalysisPage = lazy(() => import("./components/AnalysisPage"));

type SortOrder = "newest" | "oldest";

declare global {
  interface Window {
    __REWIND_SESSION__?: Session;
  }
}

const SORT_KEY = "rewind-sort-order";
const TAB_KEY = "rewind-active-tab";
const SESSION_DATA_ID = "rewind-session-data";
const ANALYSIS_DATA_ID = "rewind-analysis-data";

function loadSortOrder(): SortOrder {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === "oldest" || v === "newest") return v;
  } catch {}
  return "newest";
}

function loadActiveTab(): TabId {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "timeline" || v === "stats" || v === "analysis") return v;
  } catch {}
  return "timeline";
}

function loadInjectedSession(): Session | null {
  const sessionNode = document.getElementById(SESSION_DATA_ID);
  if (sessionNode?.textContent) {
    try {
      sessionNode.remove();
      return JSON.parse(sessionNode.textContent) as Session;
    } catch {}
  }

  const injectedSession = window.__REWIND_SESSION__;
  if (injectedSession) {
    delete window.__REWIND_SESSION__;
    return injectedSession;
  }

  return null;
}

function loadInjectedAnalysis(): AnalysisData | null {
  const node = document.getElementById(ANALYSIS_DATA_ID);
  if (node?.textContent) {
    try {
      node.remove();
      return JSON.parse(node.textContent) as AnalysisData;
    } catch {}
  }
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhancementsReady, setEnhancementsReady] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(loadSortOrder);
  const [activeTab, setActiveTab] = useState<TabId>(loadActiveTab);
  const scrollToIndexRef = useRef<((index: number) => void) | undefined>(undefined);
  const scrollPositions = useRef<Record<string, number>>({});
  const pendingJumpIndex = useRef<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);

  const toggleSort = useCallback(() => {
    setSortOrder((prev) => {
      const next = prev === "newest" ? "oldest" : "newest";
      try { localStorage.setItem(SORT_KEY, next); } catch {}
      return next;
    });
  }, []);

  const handleTabChange = useCallback((tab: TabId) => {
    // Save current scroll position
    scrollPositions.current[activeTab] = window.scrollY;
    setActiveTab(tab);
    try { localStorage.setItem(TAB_KEY, tab); } catch {}
    // Restore scroll position for the target tab (after render)
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions.current[tab] || 0);
    });
  }, [activeTab]);

  const jumpToTimelineEvent = useCallback((eventIndex: number) => {
    scrollPositions.current[activeTab] = window.scrollY;
    pendingJumpIndex.current = eventIndex;
    setActiveTab("timeline");
    try { localStorage.setItem(TAB_KEY, "timeline"); } catch {}
  }, [activeTab]);

  // Handle pending jump after timeline renders
  useEffect(() => {
    if (activeTab === "timeline" && pendingJumpIndex.current !== null) {
      const idx = pendingJumpIndex.current;
      pendingJumpIndex.current = null;
      setHighlightIndex(idx);
      // Wait for timeline to mount
      setTimeout(() => {
        scrollToIndexRef.current?.(idx);
      }, 50);
    }
  }, [activeTab]);

  useEffect(() => {
    const injectedSession = loadInjectedSession();
    if (injectedSession) {
      startTransition(() => {
        setSession(injectedSession);
      });
      setAnalysisData(loadInjectedAnalysis());
      return;
    }

    const controller = new AbortController();

    fetch("./api/session", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Session) => {
        startTransition(() => {
          setSession(data);
        });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session) return;

    const loadEnhancements = () => setEnhancementsReady(true);
    const browserWindow = window as Window & typeof globalThis;

    if (typeof browserWindow.requestIdleCallback === "function") {
      const id = browserWindow.requestIdleCallback(loadEnhancements, {
        timeout: 250,
      });
      return () => browserWindow.cancelIdleCallback?.(id);
    }

    const id = browserWindow.setTimeout(loadEnhancements, 0);
    return () => browserWindow.clearTimeout(id);
  }, [session]);

  const sortedEvents = useMemo(() => {
    if (!session) return [];
    return sortOrder === "newest"
      ? [...session.events].reverse()
      : session.events;
  }, [session, sortOrder]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500 dark:text-red-400 text-sm font-mono">
          {error}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400 dark:text-neutral-500 text-sm">
          Loading session...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {activeTab === "timeline" && enhancementsReady && (
        <Suspense fallback={null}>
          <Minimap
            events={session.events}
            scrollToIndex={(i) => scrollToIndexRef.current?.(i)}
          />
        </Suspense>
      )}
      <div className="sticky top-0 z-[9999]">
        <Header
          session={session}
          sortOrder={sortOrder}
          onToggleSort={toggleSort}
          activeTab={activeTab}
        />
        <div className="flex justify-center pb-3 pt-2">
          <TabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            hasAnalysis={analysisData !== null}
          />
        </div>
      </div>
      {activeTab === "timeline" && (
        <>
          <Timeline events={sortedEvents} scrollToIndexRef={scrollToIndexRef} highlightIndex={highlightIndex} />
          <ScrollButtons />
        </>
      )}
      {activeTab === "stats" && (
        <Suspense fallback={<PageLoader />}>
          <StatsPage events={session.events} onJumpToEvent={jumpToTimelineEvent} />
        </Suspense>
      )}
      {activeTab === "analysis" && (
        <Suspense fallback={<PageLoader />}>
          <AnalysisPage data={analysisData} />
        </Suspense>
      )}
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-slate-400 dark:text-neutral-500 text-sm">Loading...</div>
    </div>
  );
}

function ScrollButtons() {
  const scrollTo = useCallback((position: "top" | "bottom") => {
    window.scrollTo({
      top: position === "top" ? 0 : document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
      <button
        onClick={() => scrollTo("top")}
        className="scroll-btn p-3 rounded-2xl cursor-pointer"
        aria-label="Scroll to top"
      >
        <ArrowUp className="w-4 h-4 text-slate-600 dark:text-neutral-300" />
      </button>
      <button
        onClick={() => scrollTo("bottom")}
        className="scroll-btn p-3 rounded-2xl cursor-pointer"
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="w-4 h-4 text-slate-600 dark:text-neutral-300" />
      </button>
    </div>
  );
}
