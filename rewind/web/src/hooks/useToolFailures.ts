import { useMemo } from "react";
import type { TimelineEvent, ToolFailure, RetryHotspot } from "../types";
import { isToolErrorEvent } from "../lib/toolErrors";

export function useToolFailures(events: TimelineEvent[]): {
  failures: ToolFailure[];
  retryHotspots: RetryHotspot[];
} {
  return useMemo(() => {
    const failures: ToolFailure[] = [];
    const retryHotspots: RetryHotspot[] = [];

    // Detect failures
    // tool_result often lacks toolName — infer from preceding tool_call
    let lastToolName = "";
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === "tool_call" && ev.toolName) {
        lastToolName = ev.toolName;
      }
      if (ev.type === "tool_result" && isToolErrorEvent(ev)) {
        const name = ev.toolName || lastToolName || "unknown";
        const text = ev.toolResult || ev.content || "";
        const firstLine = text.split("\n").find((l) => l.trim()) || text;
        failures.push({
          index: i,
          toolName: name,
          errorSnippet: firstLine.slice(0, 120),
        });
      }
      if (ev.type !== "tool_call" && ev.type !== "tool_result") {
        lastToolName = "";
      }
    }

    // Detect retry hotspots: same tool + same primary target called 3+ times consecutively
    // (e.g. Edit on the same file 3x = retry, Read on 3 different files = normal)
    let runStart = -1;
    let runKey = ""; // toolName + primary target
    let runTool = "";
    let runCount = 0;
    let runTargets: string[] = [];

    const extractTarget = (input?: string): string | null => {
      if (!input) return null;
      try {
        const obj = JSON.parse(input);
        return obj.file_path || obj.path || null;
      } catch {
        return null;
      }
    };

    const flushRun = () => {
      if (runCount >= 3) {
        const unique = [...new Set(runTargets)].slice(0, 5);
        retryHotspots.push({
          toolName: runTool,
          startIndex: runStart,
          count: runCount,
          targets: unique,
        });
      }
    };

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === "tool_call" && ev.toolName) {
        const target = extractTarget(ev.toolInput);
        const key = ev.toolName + ":" + (target || "");

        if (key === runKey) {
          runCount++;
          if (target) runTargets.push(target);
        } else {
          flushRun();
          runKey = key;
          runTool = ev.toolName;
          runStart = i;
          runCount = 1;
          runTargets = [];
          if (target) runTargets.push(target);
        }
      } else if (ev.type !== "tool_result") {
        flushRun();
        runKey = "";
        runTool = "";
        runCount = 0;
        runTargets = [];
      }
    }
    flushRun();

    return { failures, retryHotspots };
  }, [events]);
}
