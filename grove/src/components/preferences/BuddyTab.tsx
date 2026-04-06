import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { useBuddyStore } from "../../store/buddy";
import type { BuddyEye, BuddyHat, BuddyRarity, BuddySpecies } from "../../types";
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

const EYES: { value: BuddyEye; label: string }[] = [
  { value: "\u00B7", label: "\u00B7 dot" },
  { value: "\u2726", label: "\u2726 star" },
  { value: "\u00D7", label: "\u00D7 cross" },
  { value: "\u25C9", label: "\u25C9 circle" },
  { value: "@", label: "@ at" },
  { value: "\u00B0", label: "\u00B0 ring" },
];

const HATS: { value: BuddyHat; label: string }[] = [
  { value: "none", label: "None" },
  { value: "crown", label: "Crown" },
  { value: "tophat", label: "Top Hat" },
  { value: "propeller", label: "Propeller" },
  { value: "halo", label: "Halo" },
  { value: "wizard", label: "Wizard" },
  { value: "beanie", label: "Beanie" },
  { value: "tinyduck", label: "Tiny Duck" },
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
  >();
  const [selectedRarity, setSelectedRarity] = useState<
    BuddyRarity | undefined
  >();
  const [selectedEye, setSelectedEye] = useState<BuddyEye | undefined>();
  const [selectedHat, setSelectedHat] = useState<BuddyHat | undefined>();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  // Sync selectors from current buddy on first load
  useEffect(() => {
    if (status?.currentCompanion && !initialized) {
      const c = status.currentCompanion;
      setSelectedSpecies(c.species);
      setSelectedRarity(c.rarity);
      setSelectedEye(c.eye);
      setSelectedHat(c.hat === "none" ? undefined : c.hat);
      setInitialized(true);
    }
  }, [status, initialized]);

  // Preview companion from current selections
  const previewCompanion = selectedSpecies
    ? {
        species: selectedSpecies,
        rarity: selectedRarity ?? "common",
        eye: selectedEye ?? "\u00B7",
        hat: selectedHat ?? "none",
        shiny: false,
      }
    : null;

  // Check if selection differs from current buddy
  const hasChanges =
    status?.currentCompanion &&
    previewCompanion &&
    (previewCompanion.species !== status.currentCompanion.species ||
      previewCompanion.rarity !== status.currentCompanion.rarity ||
      (selectedEye && selectedEye !== status.currentCompanion.eye) ||
      (selectedHat && selectedHat !== status.currentCompanion.hat));

  const handleSearch = async () => {
    const result = await search({
      species: selectedSpecies,
      rarity: selectedRarity,
      eye: selectedEye,
      hat: selectedHat,
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
      <div className={cn("mb-6")}>
        <h4
          className={cn("text-[12px] font-medium text-foreground mb-1.5")}
        >
          Current Buddy
        </h4>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          {(() => {
            if (hasChanges) return "Preview \u2014 click Find & Apply to change";
            if (status?.currentCompanion) return "Active buddy in your Claude Code session";
            return "Select a species and rarity below to find one";
          })()}
        </p>
        {(previewCompanion || status?.currentCompanion) && (
          <div className={cn("w-[160px]")}>
            <BuddyCard
              companion={previewCompanion ?? status!.currentCompanion!}
              salt={hasChanges ? undefined : (status?.currentSalt ?? undefined)}
            />
          </div>
        )}
      </div>

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
        <div className={cn("flex gap-1.5 flex-wrap")}>
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

      {/* Eye Selector */}
      <div className={cn("mb-6")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Eyes
        </h4>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          Optional — leave unselected for any
        </p>
        <div className={cn("flex gap-1.5 flex-wrap")}>
          {EYES.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() =>
                setSelectedEye(selectedEye === e.value ? undefined : e.value)
              }
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                {
                  "border-accent bg-accent/10 font-medium text-foreground":
                    selectedEye === e.value,
                  "border-border text-muted-foreground hover:border-accent/50":
                    selectedEye !== e.value,
                },
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hat Selector */}
      <div className={cn("mb-6")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Hat
        </h4>
        <p className={cn("text-[11px] text-muted-foreground/70 mb-2")}>
          Optional — non-common rarities can wear hats
        </p>
        <div className={cn("flex gap-1.5 flex-wrap")}>
          {HATS.map((h) => (
            <button
              key={h.value}
              type="button"
              onClick={() =>
                setSelectedHat(selectedHat === h.value ? undefined : h.value)
              }
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                {
                  "border-accent bg-accent/10 font-medium text-foreground":
                    selectedHat === h.value,
                  "border-border text-muted-foreground hover:border-accent/50":
                    selectedHat !== h.value,
                },
              )}
            >
              {h.label}
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
