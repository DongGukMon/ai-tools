import { useMemo } from "react";
import type { TimelineEvent, FileHeat } from "../types";

const PATH_KEYS = ["file_path", "path", "file", "filename", "glob", "pattern"];

function extractPaths(toolInput: string): string[] {
  const paths: string[] = [];
  try {
    const obj = JSON.parse(toolInput);
    for (const key of PATH_KEYS) {
      if (typeof obj[key] === "string" && obj[key].length > 0) {
        paths.push(obj[key]);
      }
    }
    // Also check command field for common path patterns
    if (typeof obj.command === "string") {
      const matches = obj.command.match(/(?:^|\s)(\/[\w./-]+|\.\/[\w./-]+)/g);
      if (matches) {
        for (const m of matches) {
          const p = m.trim();
          if (p.length > 2 && !p.startsWith("//")) paths.push(p);
        }
      }
    }
  } catch {
    // not valid JSON, skip
  }
  return paths;
}

export function useIterationHeatmap(events: TimelineEvent[]): FileHeat[] {
  return useMemo(() => {
    const counts = new Map<string, number>();

    for (const ev of events) {
      if (ev.type === "tool_call" && ev.toolInput) {
        for (const p of extractPaths(ev.toolInput)) {
          counts.set(p, (counts.get(p) || 0) + 1);
        }
      }
    }

    const entries = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const maxCount = entries[0]?.[1] || 1;

    return entries.map(([filePath, count]) => ({
      filePath,
      count,
      percentage: (count / maxCount) * 100,
    }));
  }, [events]);
}
