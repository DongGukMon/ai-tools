import type { TimelineEvent, SessionStats } from "../types";
import { useTimeAllocation } from "./useTimeAllocation";
import { useToolFailures } from "./useToolFailures";
import { useIterationHeatmap } from "./useIterationHeatmap";
import { usePromptQuality } from "./usePromptQuality";

export function useSessionStats(events: TimelineEvent[]): SessionStats {
  const timeAllocation = useTimeAllocation(events);
  const { failures: toolFailures, retryHotspots } = useToolFailures(events);
  const fileHeatmap = useIterationHeatmap(events);
  const promptSignals = usePromptQuality(events);

  return {
    timeAllocation,
    toolFailures,
    retryHotspots,
    fileHeatmap,
    promptSignals,
  };
}
