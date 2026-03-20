import { useMemo } from "react";
import type { TimelineEvent, TimeAllocation } from "../types";

export function useTimeAllocation(events: TimelineEvent[]): TimeAllocation {
  return useMemo(() => {
    if (events.length < 2) {
      return { userInput: 0, thinking: 0, toolExecution: 0, idle: 0 };
    }

    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    let userInput = 0;
    let thinking = 0;
    let toolExecution = 0;
    let idle = 0;

    for (let i = 1; i < sorted.length; i++) {
      const gap = new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime();
      if (gap <= 0 || gap > 600_000) {
        continue;
      }

      const prevType = sorted[i - 1].type;
      const currType = sorted[i].type;

      // Gap ending with user message = user was reading/thinking before typing
      // This is idle time (user between turns)
      if (currType === "user") {
        idle += gap;
        continue;
      }

      // Gap starting from user message = system processing the prompt
      // Short gaps are processing, attribute to thinking
      if (prevType === "user") {
        userInput += gap;
        continue;
      }

      // Between thinking events or adjacent to thinking
      if (prevType === "thinking" || currType === "thinking") {
        thinking += gap;
        continue;
      }

      // Between tool calls/results
      if (
        prevType === "tool_call" ||
        prevType === "tool_result" ||
        currType === "tool_call" ||
        currType === "tool_result"
      ) {
        toolExecution += gap;
        continue;
      }

      // Between assistant messages — model is generating
      if (prevType === "assistant" && currType === "assistant") {
        thinking += gap;
        continue;
      }

      // Fallback: long gaps are idle, short gaps are thinking
      if (gap > 30_000) {
        idle += gap;
      } else {
        thinking += gap;
      }
    }

    return { userInput, thinking, toolExecution, idle };
  }, [events]);
}
