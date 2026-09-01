// Categorical series palette — CVD-checked in fixed order against the real card
// surface (#121213). Shared by server and client code.
//
// "VALIDATED" USED TO BE A COMMENT, AND THE COMMENT WAS WRONG.
//
// This file previously said "CVD-optimised, validated against the card surface
// #101624". Nothing re-ran when a hex changed, and when the check was finally
// written as code (`scripts/check-palette.mjs`) the old palette FAILED it:
//
//   • series 6 red #e66767 and series 7 magenta #d55181 were ΔE 7.8 apart for
//     NORMAL vision — below the floor of 15, so full-colour readers could not
//     reliably tell them apart either. Under deuteranopia they were 5.8, and
//     under tritanopia 3.2, which is indistinguishable.
//   • series 7 magenta and series 8 orange #d95926 were 5.9 under deuteranopia.
//
// Three of the eight series merged into each other for a reader with the most
// common form of colour blindness, on a claim of being optimised against it.
// That is the same defect as a test that has never failed, wearing chart colours.
//
// HOW THIS SET WAS CHOSEN. Designed first — restrained hues that belong on the
// warm graphite ground rather than glowing off it — then run through the
// checker and adjusted only where it objected. It objected twice: the lavender
// and the green were ΔE 7.1 apart under deuteranopia (fixed by separating them
// in LIGHTNESS, which is the axis colour blindness leaves intact), and the rose
// and the ochre were 14.5 for normal vision (fixed by lightening the rose).
//
// The worst adjacent pair now separates by 17.2 under any simulated deficiency,
// against a floor of 8 and a "needs a legend to be safe" line at 10. Run
// `node scripts/check-palette.mjs` — CI does, so this cannot silently rot again.
//
// WHY THIS IS STILL MULTI-HUE while the interface commits to one accent: the
// accent is identity and belongs to the brand, but a categorical series colour
// is DATA. Eight brass tints would be a sequential ramp, and encoding eight
// unrelated categories on a sequential ramp says they are ordered when they are
// not. Different jobs, different rules.
export const SERIES = [
  "#5B8FB9", // 1 steel blue
  "#D9B36C", // 2 sand
  "#3E9B8F", // 3 teal
  "#D2795A", // 4 clay
  "#A79CE0", // 5 lavender
  "#5F9455", // 6 moss
  "#E39FB4", // 7 dusty rose
  "#9E6C2E", // 8 bronze
] as const;

// Ordinal ramp for funnels and tiers. ONE hue, getting darker every step —
// brass, so magnitude reads in the brand's own colour, and monotonic because a
// sequential ramp that brightens halfway along encodes size as nonsense. The
// checker asserts the direction.
export const ORDINAL = ["#EAD3A8", "#DABE81", "#C79C51", "#A67C39", "#7C5C2F"] as const;
