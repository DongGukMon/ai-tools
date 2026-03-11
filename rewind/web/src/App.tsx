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
import type { Session } from "./types";
import { Timeline } from "./components/Timeline";
import { Header } from "./components/Header";

const Minimap = lazy(() => import("./components/Minimap"));

type SortOrder = "newest" | "oldest";

const SORT_KEY = "rewind-sort-order";

function loadSortOrder(): SortOrder {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === "oldest" || v === "newest") return v;
  } catch {}
  return "newest";
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhancementsReady, setEnhancementsReady] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(loadSortOrder);
  const scrollToIndexRef = useRef<((index: number) => void) | undefined>(undefined);

  const toggleSort = useCallback(() => {
    setSortOrder((prev) => {
      const next = prev === "newest" ? "oldest" : "newest";
      try { localStorage.setItem(SORT_KEY, next); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") ?? "";
    const controller = new AbortController();

    fetch(`./api/session?token=${token}`, { signal: controller.signal })
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
      {enhancementsReady && (
        <Suspense fallback={null}>
          <Minimap
            events={session.events}
            scrollToIndex={(i) => scrollToIndexRef.current?.(i)}
          />
        </Suspense>
      )}
      <Header
        session={session}
        sortOrder={sortOrder}
        onToggleSort={toggleSort}
      />
      <Timeline events={sortedEvents} scrollToIndexRef={scrollToIndexRef} />
      <ScrollButtons />
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
        className="p-3 rounded-2xl liquid-glass liquid-glass-hover shadow-lg"
        aria-label="Scroll to top"
      >
        <ArrowUp className="w-4 h-4 text-slate-600 dark:text-neutral-300" />
      </button>
      <button
        onClick={() => scrollTo("bottom")}
        className="p-3 rounded-2xl liquid-glass liquid-glass-hover shadow-lg"
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="w-4 h-4 text-slate-600 dark:text-neutral-300" />
      </button>
    </div>
  );
}
