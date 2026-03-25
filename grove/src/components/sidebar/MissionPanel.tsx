import { useMissionStore } from "../../store/mission";
import MissionItem from "./MissionItem";
import { cn } from "../../lib/cn";

export default function MissionPanel() {
  const missions = useMissionStore((s) => s.missions);

  if (missions.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 px-3 py-10")}>
        <span className={cn("text-xs text-muted-foreground")}>No missions yet</span>
        <span className={cn("text-[11px] text-[var(--color-text-tertiary)]")}>
          Click + to create one
        </span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1 py-0.5")}>
      {missions.map((mission) => (
        <MissionItem key={mission.id} mission={mission} />
      ))}
    </div>
  );
}
