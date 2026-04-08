import { describe, expect, it } from "vitest";
import type { BuddyStatus } from "../../../types";
import { selectionFromStatus } from "./selection";

describe("selectionFromStatus", () => {
  it("maps the active buddy into local selection state", () => {
    const status: BuddyStatus = {
      binaryPath: "/Applications/Claude.app/Contents/MacOS/claude",
      supported: true,
      supportReason: null,
      currentSalt: "abc123",
      currentCompanion: {
        species: "duck",
        rarity: "epic",
        eye: "✦",
        hat: "wizard",
        shiny: true,
      },
      savedConfig: null,
      userId: "user-1",
      robotUpgraded: true,
    };

    expect(selectionFromStatus(status)).toEqual({
      selectedSpecies: "duck",
      selectedRarity: "epic",
      selectedEye: "✦",
      selectedHat: "wizard",
      selectedShiny: true,
      selectedUpgradeRobot: true,
    });
  });

  it("clears preview state when the current buddy is gone", () => {
    const status: BuddyStatus = {
      binaryPath: "/Applications/Claude.app/Contents/MacOS/claude",
      supported: true,
      supportReason: null,
      currentSalt: null,
      currentCompanion: null,
      savedConfig: null,
      userId: "user-1",
      robotUpgraded: false,
    };

    expect(selectionFromStatus(status)).toEqual({
      selectedSpecies: undefined,
      selectedRarity: undefined,
      selectedEye: undefined,
      selectedHat: undefined,
      selectedShiny: false,
      selectedUpgradeRobot: false,
    });
  });
});
