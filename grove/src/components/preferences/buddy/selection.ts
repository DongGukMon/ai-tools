import type {
  BuddyEye,
  BuddyHat,
  BuddyRarity,
  BuddySpecies,
  BuddyStatus,
} from "../../../types";

export interface BuddySelectionState {
  selectedSpecies: BuddySpecies | undefined;
  selectedRarity: BuddyRarity | undefined;
  selectedEye: BuddyEye | undefined;
  selectedHat: BuddyHat | undefined;
  selectedShiny: boolean;
  selectedUpgradeRobot: boolean;
}

export function selectionFromStatus(status: BuddyStatus | null): BuddySelectionState {
  const companion = status?.currentCompanion;
  if (!companion) {
    return {
      selectedSpecies: undefined,
      selectedRarity: undefined,
      selectedEye: undefined,
      selectedHat: undefined,
      selectedShiny: false,
      selectedUpgradeRobot: status?.robotUpgraded ?? false,
    };
  }

  return {
    selectedSpecies: companion.species,
    selectedRarity: companion.rarity,
    selectedEye: companion.eye,
    selectedHat: companion.hat === "none" ? undefined : companion.hat,
    selectedShiny: companion.shiny,
    selectedUpgradeRobot: status.robotUpgraded,
  };
}
