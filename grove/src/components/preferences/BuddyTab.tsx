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
  const applying = useBuddyStore((s) => s.applying);
  const error = useBuddyStore((s) => s.error);
  const init = useBuddyStore((s) => s.init);
  const searchAndApply = useBuddyStore((s) => s.searchAndApply);
  const restore = useBuddyStore((s) => s.restore);

  const [selectedSpecies, setSelectedSpecies] = useState<
    BuddySpecies | undefined
  >();
  const [selectedRarity, setSelectedRarity] = useState<
    BuddyRarity | undefined
  >();
  const [selectedEye, setSelectedEye] = useState<BuddyEye | undefined>();
  const [selectedHat, setSelectedHat] = useState<BuddyHat | undefined>();
  const [selectedShiny, setSelectedShiny] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (status?.currentCompanion && !initialized) {
      const c = status.currentCompanion;
      setSelectedSpecies(c.species);
      setSelectedRarity(c.rarity);
      setSelectedEye(c.eye);
      setSelectedHat(c.hat === "none" ? undefined : c.hat);
      setSelectedShiny(c.shiny);
      setInitialized(true);
    }
  }, [status, initialized]);

  const previewCompanion = selectedSpecies
    ? {
        species: selectedSpecies,
        rarity: selectedRarity ?? "common",
        eye: selectedEye ?? "\u00B7",
        hat: selectedHat ?? "none",
        shiny: selectedShiny,
      }
    : null;

  const hasChanges =
    status?.currentCompanion &&
    previewCompanion &&
    (previewCompanion.species !== status.currentCompanion.species ||
      previewCompanion.rarity !== status.currentCompanion.rarity ||
      (selectedEye && selectedEye !== status.currentCompanion.eye) ||
      (selectedHat && selectedHat !== status.currentCompanion.hat) ||
      selectedShiny !== status.currentCompanion.shiny);

  const handleApply = () => {
    searchAndApply({
      species: selectedSpecies,
      rarity: selectedRarity,
      eye: selectedEye,
      hat: selectedHat,
      shiny: selectedShiny || undefined,
    });
  };

  if (applying && !status) {
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
      <h3 className={cn("text-sm font-semibold text-foreground mb-4")}>
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

      {/* Top row: Current Buddy | Species Gallery */}
      <div className={cn("flex gap-4 mb-4")}>
        {/* Left: Current Buddy */}
        <div className={cn("shrink-0 w-[170px]")}>
          <h4
            className={cn("text-[12px] font-medium text-foreground mb-1")}
          >
            Current Buddy
          </h4>
          <p className={cn("text-[10px] text-muted-foreground/70 mb-2")}>
            {(() => {
              if (hasChanges) return "Preview";
              if (status?.currentCompanion) return "Active";
              return "Not set";
            })()}
          </p>
          {(previewCompanion || status?.currentCompanion) && (
            <BuddyCard
              companion={previewCompanion ?? status!.currentCompanion!}
              salt={hasChanges ? undefined : (status?.currentSalt ?? undefined)}
            />
          )}
        </div>

        {/* Right: Species Gallery (scrollable) */}
        <div className={cn("flex-1 min-w-0")}>
          <h4 className={cn("text-[12px] font-medium text-foreground mb-1")}>
            Choose Species
          </h4>
          <div className={cn("overflow-y-auto max-h-[280px] pr-1")}>
            <SpeciesGallery
              selected={selectedSpecies}
              onSelect={setSelectedSpecies}
            />
          </div>
        </div>
      </div>

      <div className={cn("border-t border-border mb-4")} />

      {/* Rarity */}
      <div className={cn("mb-3")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Rarity
        </h4>
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

      {/* Eyes */}
      <div className={cn("mb-3")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Eyes
        </h4>
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

      {/* Hat */}
      <div className={cn("mb-3")}>
        <h4 className={cn("text-[12px] font-medium text-foreground mb-1.5")}>
          Hat
        </h4>
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

      {/* Shiny */}
      <div className={cn("mb-4")}>
        <button
          type="button"
          onClick={() => setSelectedShiny(!selectedShiny)}
          className={cn(
            "rounded-md border px-3 py-1 text-[11px] transition-colors",
            {
              "border-yellow-500/60 bg-yellow-500/10 font-medium text-yellow-400":
                selectedShiny,
              "border-border text-muted-foreground hover:border-accent/50":
                !selectedShiny,
            },
          )}
        >
          {selectedShiny ? "\u2728 Shiny" : "Shiny"}
        </button>
        <span className={cn("ml-2 text-[10px] text-muted-foreground/60")}>
          1% chance — brute-force may take longer
        </span>
      </div>

      <div className={cn("border-t border-border mb-4")} />

      {/* Actions */}
      <div className={cn("flex items-center gap-3")}>
        <Button
          variant="default"
          size="sm"
          onClick={handleApply}
          disabled={applying || !selectedSpecies || !hasChanges}
        >
          {applying ? "Applying\u2026" : "Apply"}
        </Button>
        {status?.savedConfig && (
          <Button
            variant="ghost"
            size="sm"
            onClick={restore}
            disabled={applying}
          >
            {applying ? "Restoring\u2026" : "Restore Original"}
          </Button>
        )}
      </div>
    </div>
  );
}
