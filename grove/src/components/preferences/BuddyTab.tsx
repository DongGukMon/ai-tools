import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { useBuddyStore } from "../../store/buddy";
import type { BuddyRarity, BuddySpecies } from "../../types";
import BuddyCard from "./buddy/BuddyCard";
import SpeciesGallery from "./buddy/SpeciesGallery";
import { RARITY_LABELS } from "./buddy/sprites";

const RARITIES: BuddyRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

export default function BuddyTab() {
  const status = useBuddyStore((s) => s.status);
  const loading = useBuddyStore((s) => s.loading);
  const searching = useBuddyStore((s) => s.searching);
  const error = useBuddyStore((s) => s.error);
  const init = useBuddyStore((s) => s.init);
  const search = useBuddyStore((s) => s.search);
  const apply = useBuddyStore((s) => s.apply);
  const restore = useBuddyStore((s) => s.restore);

  const [selectedSpecies, setSelectedSpecies] = useState<
    BuddySpecies | undefined
  >("cat");
  const [selectedRarity, setSelectedRarity] = useState<
    BuddyRarity | undefined
  >("legendary");

  useEffect(() => {
    init();
  }, [init]);

  const handleSearch = async () => {
    const result = await search({
      species: selectedSpecies,
      rarity: selectedRarity,
    });
    if (result) {
      await apply(result.salt, result.companion);
    }
  };

  if (loading && !status) {
    return (
      <div>
        <h3 className={cn("text-sm font-semibold text-foreground mb-6")}>
          Buddy
        </h3>
        <p className={cn("text-[11px] text-muted-foreground")}>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className={cn("text-sm font-semibold text-foreground mb-6")}>
        Buddy
      </h3>

      {error && (
        <div
          className={cn(
            "mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-2.5",
          )}
        >
          <p className={cn("text-[11px] text-destructive")}>{error}</p>
        </div>
      )}

      {/* Current Buddy */}
      {status?.currentCompanion && (
        <div className={cn("mb-6")}>
          <h4
            className={cn("text-[12px] font-medium text-foreground mb-1.5")}
          >
            Current Companion
          </h4>
          <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
            Active buddy in your Claude Code session
          </p>
          <div className={cn("w-[160px]")}>
            <BuddyCard
              companion={status.currentCompanion}
              salt={status.currentSalt ?? undefined}
            />
          </div>
        </div>
      )}

      {!status?.currentCompanion && status && (
        <div className={cn("mb-6")}>
          <h4
            className={cn("text-[12px] font-medium text-foreground mb-1.5")}
          >
            Current Companion
          </h4>
          <p className={cn("text-[11px] text-muted-foreground/70")}>
            No buddy detected. Select a species and rarity below to find one.
          </p>
        </div>
      )}

      <div className={cn("border-t border-border mb-6")} />

      {/* Species Gallery */}
      <div className={cn("mb-6")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Choose Species
        </h4>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          Select the companion species you want
        </p>
        <SpeciesGallery
          selected={selectedSpecies}
          onSelect={setSelectedSpecies}
        />
      </div>

      <div className={cn("border-t border-border mb-6")} />

      {/* Rarity Selector */}
      <div className={cn("mb-6")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Rarity
        </h4>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          Higher rarity buddies have better stats and hats
        </p>
        <div className={cn("flex gap-1.5")}>
          {RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRarity(r)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                {
                  "border-accent bg-accent/10 font-medium text-foreground":
                    selectedRarity === r,
                  "border-border text-muted-foreground hover:border-accent/50":
                    selectedRarity !== r,
                },
              )}
            >
              {RARITY_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("border-t border-border mb-6")} />

      {/* Actions */}
      <div className={cn("flex items-center gap-3")}>
        <Button
          variant="default"
          size="sm"
          onClick={handleSearch}
          disabled={searching || loading || !selectedSpecies}
        >
          {searching ? "Searching..." : "Find & Apply"}
        </Button>
        {status?.savedConfig && (
          <Button
            variant="ghost"
            size="sm"
            onClick={restore}
            disabled={loading}
          >
            Restore Original
          </Button>
        )}
      </div>
      {searching && (
        <p className={cn("mt-2 text-[11px] text-muted-foreground")}>
          Brute-forcing salt... This usually takes 1-5 seconds.
        </p>
      )}
    </div>
  );
}
