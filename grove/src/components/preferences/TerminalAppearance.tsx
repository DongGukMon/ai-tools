import { cn } from "../../lib/cn";

export default function TerminalAppearance() {
  return (
    <div>
      <h4 className={cn("text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-4")}>
        Appearance
      </h4>
      <p className={cn("text-xs text-muted-foreground")}>Theme settings will be migrated here.</p>
    </div>
  );
}
