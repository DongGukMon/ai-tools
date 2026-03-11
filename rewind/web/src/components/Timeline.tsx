import { useState } from "react";
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
}

const eventConfig = {
  user: {
    color: "bg-blue-500",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    icon: User,
    label: "User",
  },
  assistant: {
    color: "bg-emerald-500",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/5",
    icon: Bot,
    label: "Assistant",
  },
  tool_call: {
    color: "bg-amber-500",
    textColor: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    icon: Wrench,
    label: "Tool",
  },
  tool_result: {
    color: "bg-amber-500/60",
    textColor: "text-amber-300",
    borderColor: "border-amber-500/20",
    bgColor: "bg-amber-500/5",
    icon: ArrowLeftRight,
    label: "Result",
  },
  thinking: {
    color: "bg-violet-500",
    textColor: "text-violet-400",
    borderColor: "border-violet-500/30",
    bgColor: "bg-violet-500/5",
    icon: Brain,
    label: "Thinking",
  },
  system: {
    color: "bg-neutral-500",
    textColor: "text-neutral-400",
    borderColor: "border-neutral-500/30",
    bgColor: "bg-neutral-500/5",
    icon: Bot,
    label: "System",
  },
} as const;

export function Timeline({ events }: TimelineProps) {
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  const toggle = (index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[11px] top-3 bottom-3 w-px bg-neutral-800" />

        <div className="space-y-1">
          {events.map((event, index) => (
            <TimelineItem
              key={index}
              event={event}
              expanded={expandedSet.has(index)}
              onToggle={() => toggle(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TimelineItemProps {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
}

function TimelineItem({ event, expanded, onToggle }: TimelineItemProps) {
  const config = eventConfig[event.type] ?? eventConfig.system;
  const Icon = config.icon;
  const hasContent = event.content || event.toolInput || event.toolResult;
  const timestamp = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString()
    : "";

  return (
    <div className="relative flex items-start gap-4 group">
      {/* Dot */}
      <div
        className={cn(
          "relative z-10 mt-2.5 w-[23px] h-[23px] rounded-full flex items-center justify-center shrink-0",
          "ring-4 ring-neutral-950",
          config.color,
        )}
      >
        <Icon className="w-3 h-3 text-white" strokeWidth={2.5} />
      </div>

      {/* Card */}
      <div
        className={cn(
          "flex-1 rounded-lg border transition-colors duration-150 mb-1",
          config.borderColor,
          hasContent ? "cursor-pointer" : "",
          expanded ? config.bgColor : "hover:bg-neutral-900/50",
        )}
        onClick={hasContent ? onToggle : undefined}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          {hasContent &&
            (expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            ))}

          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
              config.textColor,
              "bg-neutral-800/50",
            )}
          >
            {config.label}
          </span>

          {event.toolName && (
            <code className="text-xs font-mono text-amber-300/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {event.toolName}
            </code>
          )}

          <span className="text-sm text-neutral-300 truncate flex-1">
            {event.summary}
          </span>

          {timestamp && (
            <span className="text-[10px] font-mono text-neutral-600 shrink-0">
              {timestamp}
            </span>
          )}
        </div>

        {/* Expanded content */}
        {expanded && hasContent && (
          <div className="px-3 pb-3 pt-1 border-t border-neutral-800/50">
            {event.type === "tool_call" && event.toolInput && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Input
                </div>
                <pre className="text-xs font-mono text-neutral-300 bg-neutral-900 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                  {formatJSON(event.toolInput)}
                </pre>
              </div>
            )}

            {event.type === "tool_result" && event.toolResult && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Output
                </div>
                <pre className="text-xs font-mono text-neutral-300 bg-neutral-900 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                  {formatContent(event.toolResult)}
                </pre>
              </div>
            )}

            {(event.type === "user" ||
              event.type === "assistant" ||
              event.type === "thinking") &&
              event.content && (
                <pre className="text-xs text-neutral-300 bg-neutral-900 rounded-md p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-[inherit]">
                  {event.content}
                </pre>
              )}
          </div>
        )}
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
