import { cn } from "../../../lib/cn";
import type { BuddyCompanion } from "../../../types";
import { BUDDY_SPRITES, RARITY_COLORS, RARITY_LABELS } from "./sprites";

interface Props {
  companion: BuddyCompanion;
  salt?: string;
  compact?: boolean;
}

export default function BuddyCard({ companion, salt, compact }: Props) {
  const sprite = BUDDY_SPRITES[companion.species];
  const rarityColor = RARITY_COLORS[companion.rarity] ?? "text-zinc-400";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-secondary/20 p-3",
        { "p-2": compact },
      )}
    >
      <pre
        className={cn(
          "font-mono text-[11px] leading-tight text-foreground/80 text-center select-none",
          { "text-[10px]": compact },
        )}
      >
        {sprite?.join("\n")}
      </pre>
      <div className={cn("mt-2 text-center space-y-0.5")}>
        <p className={cn("text-[11px] font-medium text-foreground capitalize")}>
          {companion.species}
          {companion.shiny && (
            <span className={cn("ml-1 text-yellow-300")}>SHINY</span>
          )}
        </p>
        <p className={cn("text-[10px]", rarityColor)}>
          {RARITY_LABELS[companion.rarity]}
        </p>
        <p className={cn("text-[10px] text-muted-foreground")}>
          eye: {companion.eye} &middot; hat: {companion.hat}
        </p>
        {salt && !compact && (
          <p className={cn("text-[9px] font-mono text-muted-foreground/50 mt-1")}>
            {salt}
          </p>
        )}
      </div>
    </div>
  );
}
