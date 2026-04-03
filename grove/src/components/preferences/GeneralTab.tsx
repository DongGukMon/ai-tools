import { cn } from "../../lib/cn";

export default function GeneralTab() {
  return (
    <div>
      <h3 className={cn("text-sm font-semibold text-foreground mb-4")}>General</h3>
      <p className={cn("text-xs text-muted-foreground")}>Preferred IDE setting goes here.</p>
    </div>
  );
}
