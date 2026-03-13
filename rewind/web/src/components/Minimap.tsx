import { useCallback, useEffect, useMemo, useState } from "react";
import type { TimelineEvent } from "../types";

interface MinimapProps {
  events: TimelineEvent[];
  scrollToIndex?: (index: number) => void;
}

type MinimapColor = "--minimap-user" | "--minimap-bot" | "--minimap-tool";

function getMinimapColor(type: TimelineEvent["type"]): MinimapColor {
  switch (type) {
    case "user":
      return "--minimap-user";
    case "assistant":
    case "thinking":
      return "--minimap-bot";
    default:
      return "--minimap-tool";
  }
}

function buildMinimapGradient(events: TimelineEvent[]): string {
  if (events.length === 0) {
    return "transparent";
  }

  const step = 100 / events.length;
  const stops: string[] = [];
  let runStart = 0;
  let runColor = getMinimapColor(events[0].type);

  for (let i = 1; i <= events.length; i++) {
    const color = i < events.length ? getMinimapColor(events[i].type) : null;
    if (color !== runColor) {
      const c = `var(${runColor})`;
      stops.push(
        `${c} ${(runStart * step).toFixed(3)}%`,
        `${c} ${(i * step).toFixed(3)}%`,
      );
      runStart = i;
      runColor = color!;
    }
  }

  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

export default function Minimap({ events, scrollToIndex }: MinimapProps) {
  const [viewport, setViewport] = useState({ top: 0, height: 20 });

  const gradient = useMemo(() => buildMinimapGradient(events), [events]);

  useEffect(() => {
    let ticking = false;

    const updateViewport = () => {
      const scrollH = document.documentElement.scrollHeight;
      const viewH = window.innerHeight;
      const scrollY = window.scrollY;

      if (scrollH <= viewH) {
        setViewport({ top: 0, height: 100 });
        return;
      }

      const top = (scrollY / scrollH) * 100;
      const height = (viewH / scrollH) * 100;
      setViewport({ top, height });
    };

    const onViewportChange = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateViewport();
        ticking = false;
      });
    };

    updateViewport();
    window.addEventListener("scroll", onViewportChange, { passive: true });
    window.addEventListener("resize", onViewportChange, { passive: true });

    return () => {
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [events.length]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const index = Math.floor((y / rect.height) * events.length);
      const clamped = Math.max(0, Math.min(events.length - 1, index));

      if (scrollToIndex) {
        scrollToIndex(clamped);
      } else {
        document
          .querySelector(`[data-event-index="${clamped}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [events.length, scrollToIndex],
  );

  if (events.length === 0) return null;

  return (
    <div className="fixed left-3 top-1/2 -translate-y-1/2 z-30 hidden lg:block">
      <div
        className="relative w-2 rounded-full overflow-hidden cursor-pointer"
        style={{ height: "min(60vh, 400px)" }}
        onClick={handleClick}
      >
        <div
          className="absolute inset-0"
          style={{ background: gradient, opacity: 0.6 }}
        />

        <div
          className="absolute left-0 right-0 rounded-full bg-black/20 dark:bg-white/25 pointer-events-none"
          style={{
            top: `${viewport.top}%`,
            height: `max(${viewport.height}%, 8px)`,
            transition: "top 0.1s ease-out",
          }}
        />
      </div>
    </div>
  );
}
