import { useMemo } from "react";
import type { TimelineEvent } from "../types";

export interface ToolUsageEntry {
  toolName: string;
  count: number;
  percentage: number;
}

export function useToolUsage(events: TimelineEvent[]): ToolUsageEntry[] {
  return useMemo(() => {
    const counts = new Map<string, number>();

    for (const ev of events) {
      if (ev.type === "tool_call" && ev.toolName) {
        counts.set(ev.toolName, (counts.get(ev.toolName) || 0) + 1);
      }
    }

    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] || 1;

    return entries.map(([toolName, count]) => ({
      toolName,
      count,
      percentage: (count / max) * 100,
    }));
  }, [events]);
}
