import type { TimelineEvent } from "../../types";
import { useSessionStats } from "../../hooks/useSessionStats";
import { useToolUsage } from "../../hooks/useToolUsage";
import { useSkillUsage } from "../../hooks/useSkillUsage";
import { TimeAllocationCard } from "./TimeAllocationCard";
import { ToolUsageCard } from "./ToolUsageCard";
import { SkillUsageCard } from "./SkillUsageCard";
import { ToolFailuresCard } from "./ToolFailuresCard";
import { IterationHeatmapCard } from "./IterationHeatmapCard";
import { PromptQualityCard } from "./PromptQualityCard";

interface Props {
  events: TimelineEvent[];
  onJumpToEvent: (eventIndex: number) => void;
}

export default function StatsPage({ events, onJumpToEvent }: Props) {
  const stats = useSessionStats(events);
  const toolUsage = useToolUsage(events);
  const skillUsage = useSkillUsage(events);

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TimeAllocationCard data={stats.timeAllocation} />
        <ToolUsageCard data={toolUsage} />
        <SkillUsageCard data={skillUsage} />
        <ToolFailuresCard
          failures={stats.toolFailures}
          retryHotspots={stats.retryHotspots}
          onJumpToEvent={onJumpToEvent}
        />
        <IterationHeatmapCard data={stats.fileHeatmap} />
        <PromptQualityCard signals={stats.promptSignals} onJumpToEvent={onJumpToEvent} />
      </div>
    </div>
  );
}
