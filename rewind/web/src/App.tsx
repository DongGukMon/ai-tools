import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "./types";
import { Timeline } from "./components/Timeline";
import { Header } from "./components/Header";

const Minimap = lazy(() => import("./components/Minimap"));
const LiquidGlassFilters = lazy(() => import("./components/LiquidGlassFilters"));

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enhancementsReady, setEnhancementsReady] = useState(false);
  const scrollToIndexRef = useRef<((index: number) => void) | undefined>(undefined);

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
        <>
          <Suspense fallback={null}>
            <LiquidGlassFilters />
          </Suspense>
          <Suspense fallback={null}>
            <Minimap
              events={session.events}
              scrollToIndex={(i) => scrollToIndexRef.current?.(i)}
            />
          </Suspense>
        </>
      )}
      <Header session={session} />
      <Timeline events={session.events} scrollToIndexRef={scrollToIndexRef} />
    </div>
  );
}
