// Categorical series palette — CVD-optimised fixed order, validated against
// the card surface #101624 (dark mode). Shared by server and client code.
export const SERIES = [
  "#3987e5", // 1 blue
  "#199e70", // 2 aqua
  "#c98500", // 3 yellow
  "#008300", // 4 green
  "#9085e9", // 5 violet
  "#e66767", // 6 red
  "#d55181", // 7 magenta
  "#d95926", // 8 orange
] as const;

// Ordinal ramp for funnels/tiers (sequential blue, dark-surface band).
export const ORDINAL = ["#86b6ef", "#5598e7", "#3987e5", "#256abf", "#184f95"] as const;
