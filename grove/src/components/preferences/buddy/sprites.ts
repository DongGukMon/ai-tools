// src/components/preferences/buddy/sprites.ts

import type { BuddySpecies } from "../../../types";

export const BUDDY_SPRITES: Record<BuddySpecies, string[]> = {
  duck: [
    "    __    ",
    "  <(· )___",
    "   (  ._> ",
    "    `--´  ",
  ],
  goose: [
    "     (·>  ",
    "     ||   ",
    "   _(__)_ ",
    "    ^^^^  ",
  ],
  blob: [
    "  .----.  ",
    " ( ·  · ) ",
    " (      ) ",
    "  `----´  ",
  ],
  cat: [
    "   /\\_/\\  ",
    "  ( ·  ·) ",
    "  (  ω  ) ",
    '  (")_(") ',
  ],
  dragon: [
    " /^\\  /^\\  ",
    "<  ·  ·  > ",
    "(   ~~   ) ",
    " `-vvvv-´  ",
  ],
  octopus: [
    "  .----.  ",
    " ( ·  · ) ",
    " (______) ",
    " /\\/\\/\\/\\ ",
  ],
  owl: [
    "  /\\  /\\  ",
    " ((·)(·)) ",
    " (  ><  ) ",
    "  `----´  ",
  ],
  penguin: [
    "   .---.  ",
    "   (·>·)  ",
    "  /(   )\\ ",
    "   `---´  ",
  ],
  turtle: [
    "   _,--._  ",
    "  ( ·  · ) ",
    " /[______]\\",
    "  ``    ``  ",
  ],
  snail: [
    " ·    .--.",
    "  \\  ( @ )",
    "   \\_`--´ ",
    "  ~~~~~~~ ",
  ],
  ghost: [
    "  .----.  ",
    " / ·  · \\ ",
    " |      | ",
    " ~`~``~`~ ",
  ],
  axolotl: [
    "}~(______)~{",
    "}~(· .. ·)~{",
    "  ( .--. )  ",
    "  (_/  \\_)  ",
  ],
  capybara: [
    " n______n  ",
    "( ·    · ) ",
    "(   oo   ) ",
    " `------´  ",
  ],
  cactus: [
    "n  ____  n ",
    "| |·  ·| | ",
    "|_|    |_| ",
    "  |    |   ",
  ],
  robot: [
    "  .[||].  ",
    " [ ·  · ] ",
    " [ ==== ] ",
    " `------´ ",
  ],
  rabbit: [
    "  (\\__/)  ",
    " ( ·  · ) ",
    "=(  ..  )=",
    ' (")__(")',
  ],
  mushroom: [
    ".-o-OO-o-.",
    "(__________)",
    "  |·  ·|   ",
    "  |____|   ",
  ],
  chonk: [
    " /\\    /\\  ",
    "( ·    · ) ",
    "(   ..   ) ",
    " `------´  ",
  ],
};

export const RARITY_COLORS: Record<string, string> = {
  common: "text-zinc-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

export const RARITY_LABELS: Record<string, string> = {
  common: "★ Common",
  uncommon: "★★ Uncommon",
  rare: "★★★ Rare",
  epic: "★★★★ Epic",
  legendary: "★★★★★ Legendary",
};

export const ALL_SPECIES: BuddySpecies[] = [
  "duck", "goose", "blob", "cat", "dragon", "octopus",
  "owl", "penguin", "turtle", "snail", "ghost", "axolotl",
  "capybara", "cactus", "robot", "rabbit", "mushroom", "chonk",
];
