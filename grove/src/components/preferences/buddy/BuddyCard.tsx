import { cn } from "../../../lib/cn";
import type { BuddyCompanion } from "../../../types";
import {
  BUDDY_SPRITES,
  CLAUDE_ROBOT_SPRITE,
  RARITY_COLORS,
  RARITY_BORDER_COLORS,
  RARITY_LABELS,
  applyEye,
  applyHat,
} from "./sprites";

interface Props {
  companion: BuddyCompanion;
  salt?: string;
  compact?: boolean;
  upgradeRobot?: boolean;
}

export default function BuddyCard({ companion, salt, compact, upgradeRobot }: Props) {
  const rawSprite =
    companion.species === "robot" && upgradeRobot
      ? CLAUDE_ROBOT_SPRITE
      : BUDDY_SPRITES[companion.species];
  const rarityColor = RARITY_COLORS[companion.rarity] ?? "text-zinc-400";
  const borderColor = RARITY_BORDER_COLORS[companion.rarity] ?? "border-border";

  // Apply eye + hat to sprite
  const sprite = rawSprite
    ? applyHat(applyEye(rawSprite, companion.eye), companion.hat)
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-secondary/20 p-3 relative",
        borderColor,
        {
          "p-2": compact,
          "ring-1 ring-yellow-400/50 shadow-[0_0_8px_rgba(250,204,21,0.25)]":
            companion.shiny,
        },
      )}
    >
      {/* Shiny badge */}
      {companion.shiny && (
        <span
          className={cn(
            "absolute -top-2 -right-2 rounded-full bg-yellow-400 px-1.5 py-0.5",
            "text-[8px] font-bold text-yellow-950 leading-none",
          )}
        >
          SHINY
        </span>
      )}

      {/* ASCII art */}
      <pre
        className={cn(
          "font-mono text-[11px] leading-tight text-center select-none",
          rarityColor,
          { "text-[10px]": compact },
        )}
      >
        {sprite?.join("\n")}
      </pre>

      {/* Info */}
      <div className={cn("mt-2 text-center space-y-0.5")}>
        <p className={cn("text-[11px] font-medium text-foreground capitalize")}>
          {companion.species}
        </p>
        <p className={cn("text-[10px] font-medium", rarityColor)}>
          {RARITY_LABELS[companion.rarity]}
        </p>
        <p className={cn("text-[10px] text-muted-foreground")}>
          eye: {companion.eye} &middot; hat: {companion.hat}
        </p>
        {salt && !compact && (
          <p
            className={cn(
              "text-[9px] font-mono text-muted-foreground/50 mt-1",
            )}
          >
            {salt}
          </p>
        )}
      </div>
    </div>
  );
}
