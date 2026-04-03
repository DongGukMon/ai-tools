import { cn } from "../../lib/cn";

export default function TerminalTab() {
  return (
    <div>
      <h3 className={cn("text-sm font-semibold text-foreground mb-4")}>Terminal</h3>
      <p className={cn("text-xs text-muted-foreground")}>Link open mode and appearance settings go here.</p>
    </div>
  );
}
