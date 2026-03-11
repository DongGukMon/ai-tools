import { useEffect, useRef, useState } from "react";
import type { TimelineEvent } from "../types";

interface MinimapProps {
  events: TimelineEvent[];
  scrollToIndex?: (index: number) => void;
}

type MinimapColor = "user" | "bot" | "tool";

function getMinimapColor(type: TimelineEvent["type"]): MinimapColor {
  switch (type) {
    case "user":
      return "user";
    case "assistant":
    case "thinking":
      return "bot";
    default:
      return "tool";
  }
}

export function Minimap({ events, scrollToIndex }: MinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 20 });

  useEffect(() => {
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

    updateViewport();
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [events.length]);

  const handleClick = (e: React.MouseEvent) => {
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
  };

  if (events.length === 0) return null;

  return (
    <div className="fixed left-3 top-1/2 -translate-y-1/2 z-30 hidden lg:block">
      <div
        ref={containerRef}
        className="relative w-2 rounded-full overflow-hidden cursor-pointer"
        style={{ height: "min(60vh, 400px)" }}
        onClick={handleClick}
      >
        {/* Colored segments */}
        <div className="flex flex-col h-full">
          {events.map((event, i) => {
            const color = getMinimapColor(event.type);
            return (
              <div
                key={i}
                className={`flex-1 min-h-px minimap-${color}`}
                style={{ opacity: 0.6 }}
              />
            );
          })}
        </div>

        {/* Viewport indicator */}
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
