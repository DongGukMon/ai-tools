import { useMemo } from "react";
import type { TimelineEvent, PromptSignal } from "../types";
import { isToolErrorEvent } from "../lib/toolErrors";

const CORRECTION_RE =
  /\b(again|actually|clarify|correction|different|instead|meant|no,?|not|rather|retry|use)\b/i;

function snippet(ev: TimelineEvent, maxLen = 100): string {
  const text = ev.content || ev.summary || "";
  const first = text.split("\n")[0] || text;
  return first.length > maxLen ? first.slice(0, maxLen) + "..." : first;
}

function getEventText(ev: TimelineEvent): string {
  return ev.content || ev.summary || ev.toolResult || "";
}

function extractPrimaryTarget(input?: string): string | null {
  if (!input) return null;
  try {
    const obj = JSON.parse(input);
    return obj.file_path || obj.path || obj.file || obj.filename || null;
  } catch {
    return null;
  }
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
      let nextUserIdx = -1;
      let hasAssistantAction = false;
      let lastMeaningfulIdx = userIdx;
      let lastAssistantIdx = -1;
      let lastFailureIdx = -1;
      let repeatedTargetHits = 0;

      let runTool = "";
      let runLength = 0;
      let maxRunLength = 0;
      const toolCounts = new Map<string, number>();
      const targetCounts = new Map<string, number>();

      while (j < events.length && events[j].type !== "user") {
        const ev = events[j];

        if (ev.type !== "thinking" && ev.type !== "system") {
          lastMeaningfulIdx = j;
        }

        if (ev.type === "tool_call") {
          toolCalls++;
          hasAssistantAction = true;
          if (ev.toolName) {
            toolCounts.set(ev.toolName, (toolCounts.get(ev.toolName) || 0) + 1);
            if (ev.toolName === runTool) {
              runLength++;
            } else {
              runTool = ev.toolName;
              runLength = 1;
            }
            maxRunLength = Math.max(maxRunLength, runLength);
          }

          const target = extractPrimaryTarget(ev.toolInput);
          if (target) {
            const nextCount = (targetCounts.get(target) || 0) + 1;
            targetCounts.set(target, nextCount);
            if (nextCount >= 2) {
              repeatedTargetHits++;
            }
          }
        } else if (ev.type !== "tool_result") {
          runTool = "";
          runLength = 0;
        }

        if (ev.type === "tool_result") {
          if (isToolErrorEvent(ev)) {
            failures++;
            lastFailureIdx = j;
          }
        }

        if (ev.type === "assistant") {
          hasAssistantAction = true;
          lastAssistantIdx = j;
        }
        j++;
      }

      if (j < events.length && events[j].type === "user") {
        nextUserIdx = j;
      }

      const nextUser = nextUserIdx !== -1 ? events[nextUserIdx] : null;
      const nextText = nextUser ? getEventText(nextUser).trim() : "";
      const correctionCue = CORRECTION_RE.test(nextText);
      const gapMs =
        nextUserIdx !== -1
          ? new Date(events[nextUserIdx].timestamp).getTime() -
            new Date(events[userIdx].timestamp).getTime()
          : Number.POSITIVE_INFINITY;
      const endedWithAssistant =
        lastAssistantIdx !== -1 && lastAssistantIdx === lastMeaningfulIdx;
      const interruptedMidFlow =
        nextUserIdx !== -1 &&
        lastMeaningfulIdx > userIdx &&
        lastMeaningfulIdx !== lastAssistantIdx &&
        lastMeaningfulIdx === nextUserIdx - 1;
      const recoveredAfterFailure =
        lastFailureIdx !== -1 && lastAssistantIdx > lastFailureIdx;
      const dominantToolUsage = [...toolCounts.values()].some((count) => count >= 4);

      if (
        toolCalls >= 12 ||
        (toolCalls >= 8 && failures >= 2) ||
        (toolCalls >= 6 && failures >= 1 && (dominantToolUsage || repeatedTargetHits >= 2))
      ) {
        signals.push({
          type: "spiral",
          confidence:
            toolCalls >= 12 && failures >= 2
              ? "high"
              : failures >= 2 || repeatedTargetHits >= 2
                ? "medium"
                : "low",
          startIndex: userIdx,
          endIndex: j - 1,
          description: `${toolCalls} tool calls, ${failures} failures${
            repeatedTargetHits > 0 ? `, ${repeatedTargetHits} repeated target hits` : ""
          }`,
          promptSnippet: promptText,
        });
        continue;
      }

      if (nextUserIdx !== -1 && hasAssistantAction && gapMs < 90_000) {
        const shortFollowUp = nextText.length > 0 && nextText.length < 240;
        const missingClosure = !endedWithAssistant || interruptedMidFlow;
        if ((correctionCue || (shortFollowUp && missingClosure)) && toolCalls <= 4) {
          signals.push({
            type: "retry",
            confidence: correctionCue ? "high" : missingClosure ? "medium" : "low",
            startIndex: userIdx,
            endIndex: nextUserIdx,
            description: correctionCue
              ? `Corrected after ${Math.round(gapMs / 1000)}s`
              : `Follow-up retry after ${Math.round(gapMs / 1000)}s`,
            promptSnippet: promptText,
          });
          continue;
        }
      }

      if (nextUserIdx !== -1 && toolCalls > 0 && interruptedMidFlow && !recoveredAfterFailure) {
        const lastBefore = events[lastMeaningfulIdx];
        const endedDuringTooling =
          lastBefore?.type === "tool_call" ||
          lastBefore?.type === "tool_result" ||
          lastBefore?.type === "thinking";
        if (endedDuringTooling && !endedWithAssistant) {
          signals.push({
            type: "abandon",
            confidence:
              lastBefore?.type === "tool_call" || failures > 0 ? "high" : "medium",
            startIndex: userIdx,
            endIndex: nextUserIdx,
            description: `Interrupted after ${toolCalls} tool calls${
              failures > 0 ? ` and ${failures} failures` : ""
            }`,
            promptSnippet: promptText,
          });
        }
      }
    }

    return signals;
  }, [events]);
}
