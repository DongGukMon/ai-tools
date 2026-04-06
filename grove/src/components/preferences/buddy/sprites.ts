import type { BuddySpecies, BuddyEye, BuddyHat } from "../../../types";

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

export const HAT_SPRITES: Record<Exclude<BuddyHat, "none">, string> = {
  crown: "  _^^_  ",
  tophat: "  _===_ ",
  propeller: "  ^/^\\  ",
  halo: "   ooo  ",
  wizard: "   /^\\  ",
  beanie: "  (___) ",
  tinyduck: "    ,>  ",
};

/** Replace default eye `·` with the selected eye character. */
export function applyEye(lines: string[], eye: BuddyEye): string[] {
  if (eye === "\u00B7") return lines; // default, no change
  return lines.map((l) => l.replaceAll("\u00B7", eye));
}

/** Prepend hat ASCII above sprite lines. */
export function applyHat(lines: string[], hat: BuddyHat): string[] {
  if (hat === "none") return lines;
  const hatLine = HAT_SPRITES[hat];
  if (!hatLine) return lines;
  return [hatLine, ...lines];
}

export const RARITY_COLORS: Record<string, string> = {
  common: "text-zinc-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

export const RARITY_BORDER_COLORS: Record<string, string> = {
  common: "border-zinc-500/30",
  uncommon: "border-green-500/40",
  rare: "border-blue-500/40",
  epic: "border-purple-500/50",
  legendary: "border-amber-500/60",
};

export const RARITY_LABELS: Record<string, string> = {
  common: "\u2605 Common",
  uncommon: "\u2605\u2605 Uncommon",
  rare: "\u2605\u2605\u2605 Rare",
  epic: "\u2605\u2605\u2605\u2605 Epic",
  legendary: "\u2605\u2605\u2605\u2605\u2605 Legendary",
};

export const ALL_SPECIES: BuddySpecies[] = [
  "duck", "goose", "blob", "cat", "dragon", "octopus",
  "owl", "penguin", "turtle", "snail", "ghost", "axolotl",
  "capybara", "cactus", "robot", "rabbit", "mushroom", "chonk",
];
