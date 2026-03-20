import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  User,
  Bot,
  Wrench,
  Brain,
  ArrowLeftRight,
} from "lucide-react";
import type { TimelineEvent } from "../types";
import { cn } from "../lib/utils";

interface TimelineProps {
  events: TimelineEvent[];
  scrollToIndexRef?: { current: ((index: number) => void) | undefined };
  highlightIndex?: number | null;
}

type EventType = TimelineEvent["type"];

interface TimelineRow {
  key: string;
  event: TimelineEvent;
  gapPx: number;
  timestampLabel: string;
  hasContent: boolean;
}

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
    dot: "bg-amber-500",
    textColor: "text-amber-700 dark:text-amber-400",
    badgeBg: "bg-amber-100 dark:bg-amber-500/20",
    expandedBg: "bg-amber-50/40 dark:bg-amber-500/5",
    icon: ArrowLeftRight,
    name: "Result",
  },
  thinking: {
    dot: "bg-emerald-600",
    textColor: "text-emerald-800 dark:text-emerald-300",
    badgeBg: "bg-emerald-200 dark:bg-emerald-600/20",
    expandedBg: "bg-emerald-50/50 dark:bg-emerald-600/5",
    icon: Brain,
    name: "Thinking",
  },
  system: {
    dot: "bg-amber-500",
    textColor: "text-amber-700 dark:text-amber-400",
    badgeBg: "bg-amber-100 dark:bg-amber-500/20",
    expandedBg: "bg-amber-50/40 dark:bg-amber-500/5",
    icon: Bot,
    name: "System",
  },
};

function getTimeGapPx(prevTimestamp: string, currTimestamp: string): number {
  const diff =
    (new Date(currTimestamp).getTime() - new Date(prevTimestamp).getTime()) / 1000;
  if (diff <= 1) return 6;
  if (diff <= 5) return 16;
  if (diff <= 15) return 32;
  if (diff <= 60) return 56;
  if (diff <= 300) return 80;
  return 120;
}

function buildTimelineRows(events: TimelineEvent[]): TimelineRow[] {
  return events.map((event, index) => ({
    key: `${event.timestamp}-${event.type}-${index}`,
    event,
    gapPx:
      index > 0 ? getTimeGapPx(events[index - 1].timestamp, event.timestamp) : 0,
    timestampLabel: event.timestamp
      ? new Date(event.timestamp).toLocaleTimeString()
      : "",
    hasContent: Boolean(event.content || event.toolInput || event.toolResult),
  }));
}

export function Timeline({ events, scrollToIndexRef, highlightIndex }: TimelineProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  useEffect(() => {
    if (highlightIndex == null) return;
    setFlashIndex(highlightIndex);
    const timer = setTimeout(() => setFlashIndex(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightIndex]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const rows = useMemo(() => buildTimelineRows(events), [events]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const updateScrollMargin = () => {
      setScrollMargin(el.offsetTop);
    };

    updateScrollMargin();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollMargin);
    observer?.observe(el);
    window.addEventListener("resize", updateScrollMargin, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateScrollMargin);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => rows[index].gapPx + 48,
    getItemKey: (index) => rows[index].key,
    overscan: rows.length > 1000 ? 10 : 8,
    scrollMargin,
  });

  useEffect(() => {
    if (!scrollToIndexRef) return;

    scrollToIndexRef.current = (index: number) => {
      if (index < 0 || index >= rows.length) return;
      virtualizer.scrollToIndex(index, {
        align: "center",
      });
    };

    return () => {
      scrollToIndexRef.current = undefined;
    };
  }, [rows.length, scrollToIndexRef, virtualizer]);

  const toggleExpanded = useCallback((index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={listRef} className="max-w-4xl mx-auto px-6 py-8">
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        <div className="absolute left-[11px] top-3 bottom-3 w-px bg-slate-300/60 dark:bg-white/8" />

        {virtualItems.map((item) => {
          const row = rows[item.index];

          return (
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
                zIndex: rows.length - item.index,
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <div style={{ paddingTop: row.gapPx }}>
                <TimelineItem
                  index={item.index}
                  row={row}
                  expanded={expandedSet.has(item.index)}
                  onToggle={toggleExpanded}
                  highlight={flashIndex === item.index}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TimelineItemProps {
  index: number;
  row: TimelineRow;
  expanded: boolean;
  onToggle: (index: number) => void;
  highlight?: boolean;
}

const TimelineItem = memo(function TimelineItem({
  index,
  row,
  expanded,
  onToggle,
  highlight,
}: TimelineItemProps) {
  const { event, hasContent, timestampLabel } = row;
  const config = eventConfig[event.type] ?? eventConfig.system;
  const Icon = config.icon;

  const handleToggle = useCallback(() => {
    if (hasContent) {
      onToggle(index);
    }
  }, [hasContent, index, onToggle]);

  const formattedToolInput = useMemo(() => {
    if (!expanded || event.type !== "tool_call" || !event.toolInput) {
      return "";
    }
    return formatJSON(event.toolInput);
  }, [event.toolInput, event.type, expanded]);

  const formattedToolResult = useMemo(() => {
    if (!expanded || event.type !== "tool_result" || !event.toolResult) {
      return "";
    }
    return formatContent(event.toolResult);
  }, [event.toolResult, event.type, expanded]);

  return (
    <div className="timeline-row relative flex items-start gap-4" data-event-index={index}>
      <div
        className={cn(
          "timeline-dot relative z-10 w-[23px] h-[23px] rounded-full mt-[7px]",
          "flex items-center justify-center shrink-0",
          hasContent ? "cursor-pointer" : "",
          config.dot,
        )}
        style={{ boxShadow: "0 0 0 4px var(--ring-bg)" }}
        onClick={hasContent ? handleToggle : undefined}
      >
        <Icon className="w-3 h-3 text-white" strokeWidth={2.5} />
      </div>

      <div
        className={cn(
          "timeline-card flex-1 max-w-[calc(100%-40px)] rounded-xl liquid-glass",
          hasContent ? "cursor-pointer liquid-glass-hover" : "",
          expanded && config.expandedBg,
          highlight && "highlight-flash",
        )}
        onClick={hasContent ? handleToggle : undefined}
      >
        <div className="flex items-center gap-2 px-3 py-2 relative z-[1]">

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

          {timestampLabel && (
            <span className="text-[10px] font-mono text-slate-400 dark:text-neutral-600 shrink-0">
              {timestampLabel}
            </span>
          )}
        </div>

        <div className={cn("collapse-grid", expanded && hasContent && "expanded")}>
          <div>
            {hasContent && (
              <div className="px-3 pb-3 pt-1 relative z-[1]">
                {event.type === "tool_call" && formattedToolInput && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-semibold">
                      Input
                    </div>
                    <pre className="text-xs font-mono text-slate-700 dark:text-neutral-300 bg-black/[0.03] dark:bg-black/30 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                      {formattedToolInput}
                    </pre>
                  </div>
                )}

                {event.type === "tool_result" && formattedToolResult && (
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-semibold">
                      Output
                    </div>
                    <pre className="text-xs font-mono text-slate-700 dark:text-neutral-300 bg-black/[0.03] dark:bg-black/30 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                      {formattedToolResult}
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
});

function formatJSON(value: string): string {
  if (!value) {
    return value;
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatContent(value: string): string {
  if (value.length > 10000) {
    return `${value.slice(0, 10000)}\n\n... (truncated)`;
  }
  return value;
}
