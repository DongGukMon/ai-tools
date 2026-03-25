import { cn } from "../../lib/cn";

export default function MissionPanel() {
  return (
    <div className={cn("flex flex-col items-center justify-center py-8 gap-2")}>
      <span className={cn("text-xs text-muted-foreground")}>No missions yet</span>
      <span className={cn("text-[11px] text-[var(--color-text-tertiary)]")}>Click + to create one</span>
    </div>
  );
}
