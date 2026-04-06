import { cn } from "../../../lib/cn";
import type { BuddySpecies } from "../../../types";
import { BUDDY_SPRITES, ALL_SPECIES } from "./sprites";

interface Props {
  selected: BuddySpecies | undefined;
  onSelect: (species: BuddySpecies) => void;
}

export default function SpeciesGallery({ selected, onSelect }: Props) {
  return (
    <div className={cn("grid grid-cols-6 gap-1.5")}>
      {ALL_SPECIES.map((species) => (
        <button
          key={species}
          type="button"
          onClick={() => onSelect(species)}
          className={cn(
            "rounded-md border p-1.5 text-center transition-colors cursor-pointer",
            {
              "border-accent bg-accent/10": selected === species,
              "border-border hover:border-accent/50 hover:bg-accent/5":
                selected !== species,
            },
          )}
        >
          <pre
            className={cn(
              "font-mono text-[8px] leading-tight text-foreground/70 select-none whitespace-pre",
            )}
          >
            {BUDDY_SPRITES[species]?.join("\n")}
          </pre>
          <p
            className={cn(
              "mt-1 text-[9px] capitalize",
              {
                "font-medium text-foreground": selected === species,
                "text-muted-foreground": selected !== species,
              },
            )}
          >
            {species}
          </p>
        </button>
      ))}
    </div>
  );
}
