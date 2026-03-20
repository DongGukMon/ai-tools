import { useMemo } from "react";
import type { TimelineEvent, PromptSignal } from "../types";

function hasError(ev: TimelineEvent): boolean {
  const text = ev.toolResult || ev.content || "";
  return /^Error:|Exit code [1-9]|ENOENT|Permission denied|panic:|command not found|No such file/m.test(text);
}

function snippet(ev: TimelineEvent, maxLen = 100): string {
  const text = ev.content || ev.summary || "";
  const first = text.split("\n")[0] || text;
  return first.length > maxLen ? first.slice(0, maxLen) + "..." : first;
}

export function usePromptQuality(events: TimelineEvent[]): PromptSignal[] {
  return useMemo(() => {
    const signals: PromptSignal[] = [];

    for (let i = 0; i < events.length; i++) {
      if (events[i].type !== "user") continue;

      const userIdx = i;
      const promptText = snippet(events[userIdx]);
      let j = i + 1;

      let toolCalls = 0;
      let failures = 0;
      let hasAssistantAction = false;
      let nextUserIdx = -1;

      while (j < events.length && events[j].type !== "user") {
        if (events[j].type === "tool_call") toolCalls++;
        if (events[j].type === "tool_result" && hasError(events[j])) failures++;
        if (events[j].type === "assistant" || events[j].type === "tool_call") {
          hasAssistantAction = true;
        }
        j++;
      }

      if (j < events.length && events[j].type === "user") {
        nextUserIdx = j;
      }

      // Spiral: 10+ tool calls with 2+ failures
      if (toolCalls >= 10 && failures >= 2) {
        signals.push({
          type: "spiral",
          startIndex: userIdx,
          endIndex: j - 1,
          description: `${toolCalls} tool calls, ${failures} failures`,
          promptSnippet: promptText,
        });
        continue;
      }

      // Retry: quick user correction after assistant acted
      if (nextUserIdx !== -1 && hasAssistantAction) {
        const gap =
          new Date(events[nextUserIdx].timestamp).getTime() -
          new Date(events[userIdx].timestamp).getTime();
        const nextContent = events[nextUserIdx].content || events[nextUserIdx].summary || "";
        const isShort = nextContent.length < 200;
        if (gap < 60_000 && isShort && toolCalls <= 3) {
          signals.push({
            type: "retry",
            startIndex: userIdx,
            endIndex: nextUserIdx,
            description: `Corrected after ${Math.round(gap / 1000)}s`,
            promptSnippet: promptText,
          });
          continue;
        }
      }

      // Abandon: user interrupts mid-tool-execution
      if (nextUserIdx !== -1 && toolCalls > 0) {
        const lastBefore = events[nextUserIdx - 1];
        if (
          lastBefore &&
          (lastBefore.type === "tool_call" || lastBefore.type === "tool_result")
        ) {
          signals.push({
            type: "abandon",
            startIndex: userIdx,
            endIndex: nextUserIdx,
            description: `Interrupted after ${toolCalls} tool calls`,
            promptSnippet: promptText,
          });
        }
      }
    }

    return signals;
  }, [events]);
}
