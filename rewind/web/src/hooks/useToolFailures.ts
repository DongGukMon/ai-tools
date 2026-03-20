import { useMemo } from "react";
import type { TimelineEvent, ToolFailure, RetryHotspot } from "../types";

// Only match patterns that strongly indicate tool failure, not normal output
// that happens to contain "error" or "failed" in code/logs.
const STRONG_ERROR_PATTERNS = [
  /^Error:/m,                      // Claude Code tool error prefix
  /^error:/m,                      // Common error prefix at line start
  /Exit code [1-9]/i,              // Non-zero exit code
  /ENOENT/,                        // File not found (system-level)
  /Permission denied/,             // FS permission error
  /Traceback \(most recent/,       // Python traceback
  /panic:/,                        // Go panic
  /FATAL/,                         // Fatal errors
  /command not found/,             // Shell command missing
  /No such file or directory/,     // FS error
  /Cannot find module/,            // Node module resolution
  /SyntaxError:/,                  // Parse errors
  /TypeError:/,                    // Runtime type errors
  /ReferenceError:/,               // Undefined variable
  /compilation failed/i,           // Build failure
  /build failed/i,                 // Build failure
];

function isErrorResult(event: TimelineEvent): boolean {
  const text = event.toolResult || event.content || "";
  // Short results are more likely to be pure error messages
  // Long results (>2000 chars) with "error" are often normal output containing that word
  if (text.length > 2000) {
    // For long output, only match if error appears in the first 200 chars
    const head = text.slice(0, 200);
    return STRONG_ERROR_PATTERNS.some((p) => p.test(head));
  }
  return STRONG_ERROR_PATTERNS.some((p) => p.test(text));
}

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
      if (ev.type === "tool_result" && isErrorResult(ev)) {
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
