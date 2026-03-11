import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  User,
  Bot,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
  ArrowLeftRight,
} from "lucide-react";
import type { TimelineEvent } from "../types";
import { cn } from "../lib/utils";

interface TimelineProps {
  events: TimelineEvent[];
  scrollToIndexRef?: { current: ((index: number) => void) | undefined };
}

type EventType = TimelineEvent["type"];

const eventConfig: Record<
  EventType,
  {
    dot: string;
    textColor: string;
    badgeBg: string;
    expandedBg: string;
    icon: typeof User;
    name: string;
  }
> = {
  user: {
    dot: "bg-indigo-500",
    textColor: "text-indigo-700 dark:text-indigo-400",
    badgeBg: "bg-indigo-100 dark:bg-indigo-500/20",
    expandedBg: "bg-indigo-50/40 dark:bg-indigo-500/5",
    icon: User,
    name: "User",
  },
  assistant: {
    dot: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-400",
    badgeBg: "bg-emerald-100 dark:bg-emerald-500/20",
    expandedBg: "bg-emerald-50/40 dark:bg-emerald-500/5",
    icon: Bot,
    name: "Assistant",
  },
  tool_call: {
    dot: "bg-amber-500",
    textColor: "text-amber-700 dark:text-amber-400",
    badgeBg: "bg-amber-100 dark:bg-amber-500/20",
    expandedBg: "bg-amber-50/40 dark:bg-amber-500/5",
    icon: Wrench,
    name: "Tool",
  },
  tool_result: {
    dot: "bg-amber-400",
    textColor: "text-amber-600 dark:text-amber-300",
    badgeBg: "bg-amber-100/80 dark:bg-amber-500/15",
    expandedBg: "bg-amber-50/30 dark:bg-amber-500/5",
    icon: ArrowLeftRight,
    name: "Result",
  },
  thinking: {
    dot: "bg-violet-500",
    textColor: "text-violet-700 dark:text-violet-400",
    badgeBg: "bg-violet-100 dark:bg-violet-500/20",
    expandedBg: "bg-violet-50/40 dark:bg-violet-500/5",
    icon: Brain,
    name: "Thinking",
  },
  system: {
    dot: "bg-slate-400 dark:bg-neutral-500",
    textColor: "text-slate-600 dark:text-neutral-400",
    badgeBg: "bg-slate-100 dark:bg-neutral-500/20",
    expandedBg: "bg-slate-50/40 dark:bg-neutral-500/5",
    icon: Bot,
    name: "System",
  },
};

function getTimeGapPx(prev: string, curr: string): number {
  const diff =
    (new Date(curr).getTime() - new Date(prev).getTime()) / 1000;
  if (diff <= 1) return 4;
  if (diff <= 10) return 12;
  if (diff <= 60) return 24;
  return 48;
}

export function Timeline({ events, scrollToIndexRef }: TimelineProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const gaps = useMemo(
    () =>
      events.map((_, i) =>
        i > 0
          ? getTimeGapPx(events[i - 1].timestamp, events[i].timestamp)
          : 0,
      ),
    [events],
  );

  useLayoutEffect(() => {
    if (listRef.current) {
      setScrollMargin(listRef.current.offsetTop);
    }
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: events.length,
    estimateSize: (i) => gaps[i] + 48,
    overscan: 8,
    scrollMargin,
  });

  // Expose scrollToIndex for Minimap
  if (scrollToIndexRef) {
    scrollToIndexRef.current = (index: number) => {
      virtualizer.scrollToIndex(index, {
        align: "center",
        behavior: "smooth",
      });
    };
  }

  const toggle = (index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} className="max-w-4xl mx-auto px-6 py-8">
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {/* Continuous vertical line */}
        <div className="absolute left-[11px] top-3 bottom-3 w-px bg-slate-300/60 dark:bg-white/8" />

        {virtualItems.map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="virtual-item"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <div style={{ paddingTop: gaps[item.index] }}>
              <TimelineItem
                index={item.index}
                event={events[item.index]}
                expanded={expandedSet.has(item.index)}
                onToggle={() => toggle(item.index)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TimelineItemProps {
  index: number;
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
}

function TimelineItem({
  index,
  event,
  expanded,
  onToggle,
}: TimelineItemProps) {
  const config = eventConfig[event.type] ?? eventConfig.system;
  const Icon = config.icon;
  const hasContent = event.content || event.toolInput || event.toolResult;
  const timestamp = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString()
    : "";

  return (
    <div
      className="relative flex items-start gap-4"
      data-event-index={index}
    >
      {/* Dot */}
      <div
        className={cn(
          "timeline-dot relative z-10 mt-2.5 w-[23px] h-[23px] rounded-full",
          "flex items-center justify-center shrink-0",
          config.dot,
        )}
        style={{ boxShadow: "0 0 0 4px var(--ring-bg)" }}
      >
        <Icon className="w-3 h-3 text-white" strokeWidth={2.5} />
      </div>

      {/* Liquid Glass Card */}
      <div
        className={cn(
          "flex-1 max-w-[calc(100%-40px)] rounded-xl liquid-glass mb-1",
          hasContent ? "cursor-pointer liquid-glass-hover" : "",
          expanded && config.expandedBg,
        )}
        onClick={hasContent ? onToggle : undefined}
      >
        <div className="flex items-center gap-2 px-3 py-2 relative z-[1]">
          {hasContent &&
            (expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500 shrink-0" />
            ))}

          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
              config.textColor,
              config.badgeBg,
            )}
          >
            {config.name}
          </span>

          {event.toolName && (
            <code className="text-xs font-mono text-amber-700 dark:text-amber-300/80 bg-amber-100/80 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">
              {event.toolName}
            </code>
          )}

          <span className="text-sm text-slate-700 dark:text-neutral-300 truncate flex-1">
            {event.summary}
          </span>

          {timestamp && (
            <span className="text-[10px] font-mono text-slate-400 dark:text-neutral-600 shrink-0">
              {timestamp}
            </span>
          )}
        </div>

        {/* Animated expand/collapse content */}
        <div
          className={cn(
            "collapse-grid",
            expanded && hasContent && "expanded",
          )}
        >
          <div>
            {hasContent && (
              <div className="px-3 pb-3 pt-1 relative z-[1]">
                {event.type === "tool_call" && event.toolInput && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-semibold">
                      Input
                    </div>
                    <pre className="text-xs font-mono text-slate-700 dark:text-neutral-300 bg-black/[0.03] dark:bg-black/30 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                      {formatJSON(event.toolInput)}
                    </pre>
                  </div>
                )}

                {event.type === "tool_result" && event.toolResult && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-semibold">
                      Output
                    </div>
                    <pre className="text-xs font-mono text-slate-700 dark:text-neutral-300 bg-black/[0.03] dark:bg-black/30 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                      {formatContent(event.toolResult)}
                    </pre>
                  </div>
                )}

                {(event.type === "user" ||
                  event.type === "assistant" ||
                  event.type === "thinking") &&
                  event.content && (
                    <pre className="text-xs text-slate-700 dark:text-neutral-300 bg-black/[0.03] dark:bg-black/30 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-[inherit]">
                      {event.content}
                    </pre>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatJSON(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function formatContent(s: string): string {
  if (s.length > 10000) {
    return s.slice(0, 10000) + "\n\n... (truncated)";
  }
  return s;
}
