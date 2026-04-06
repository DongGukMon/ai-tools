export type BuddySpecies =
  | "duck" | "goose" | "blob" | "cat" | "dragon" | "octopus"
  | "owl" | "penguin" | "turtle" | "snail" | "ghost" | "axolotl"
  | "capybara" | "cactus" | "robot" | "rabbit" | "mushroom" | "chonk";

export type BuddyRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type BuddyEye = "·" | "✦" | "×" | "◉" | "@" | "°";

export type BuddyHat =
  | "none" | "crown" | "tophat" | "propeller" | "halo"
  | "wizard" | "beanie" | "tinyduck";

export interface BuddyCompanion {
  species: BuddySpecies;
  rarity: BuddyRarity;
  eye: BuddyEye;
  hat: BuddyHat;
  shiny: boolean;
}

export interface BuddyConfig {
  salt: string;
  companion: BuddyCompanion;
  patchedAt: string;
}

export interface BuddyStatus {
  binaryPath: string;
  currentSalt: string | null;
  currentCompanion: BuddyCompanion | null;
  savedConfig: BuddyConfig | null;
  userId: string;
}

export interface BuddySearchFilter {
  species?: BuddySpecies;
  rarity?: BuddyRarity;
  eye?: BuddyEye;
  hat?: BuddyHat;
  shiny?: boolean;
}

export interface BuddySearchResult {
  salt: string;
  companion: BuddyCompanion;
}
