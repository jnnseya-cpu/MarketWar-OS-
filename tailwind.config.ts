import type { Config } from "tailwindcss";

// THE VISUAL IDENTITY, IN ONE PLACE.
//
// WHY THE PALETTES ARE OVERRIDDEN RATHER THAN THE PAGES EDITED. The app uses
// Tailwind's own colour names directly — 1,678 `emerald-*`, 2,221 `slate-*`,
// 524 `amber-*`, 425 `rose-*` — across 92 pages and 180 components. Editing that
// by hand is not a refactor, it is a rewrite with a thousand chances to miss one
// and leave a green button on a brass page. Redefining the scales here moves
// every one of them at once, and keeps ONE source of truth for what a colour
// means, which is the same rule the rest of this codebase follows.
//
// WHAT WAS WRONG WITH THE OLD ONE, specifically, because "make it look premium"
// is not an instruction anybody can check:
//
//   • EIGHT accent hues on a rainbow ramp (emerald, sky, violet, amber, rose,
//     blue, teal, pink) with cards tinted by rotation. Nothing that has to be
//     trusted with a customer's ad budget looks like that. Premium software
//     commits to ONE accent and spends it carefully.
//   • Emerald-on-blue-black. That exact pairing is the default of every
//     generated dashboard, which is why it reads as generated.
//   • Glow. `0 10px 30px -12px rgba(16,185,129,0.55)` under the primary button
//     and a coloured light behind every panel. Real interfaces are lit, not
//     luminous — a surface that emits its own colour reads as a render.
//
// WHAT REPLACES IT. One accent: BRASS. A struck, slightly desaturated metal —
// the colour of an instrument rather than a screen, and nowhere near any default
// palette. It sits on a WARM GRAPHITE ground rather than blue-black, which is
// what stops the whole app reading as a dark-tech template. Status colours stay
// semantically separate and are deliberately duller than the accent, so a red
// means something has gone wrong rather than something is highlighted.

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The ground and its surfaces. Warm graphite: a hint of red in the
        // neutral so it never reads as "blue tech", and no saturation beyond
        // that — the accent is the only thing on screen with a hue worth naming.
        ink: {
          950: "#0A0A0B",
          900: "#101011",
          850: "#151516",
          800: "#1C1C1E",
          700: "#2A2A2C",
          600: "#3A3A3D",
        },

        // Neutral text and lines. Tailwind's `slate` is blue; this is not, and
        // that single change is most of the difference between the two versions.
        slate: {
          50: "#F8F8F7",
          100: "#EFEFED",
          200: "#DEDEDB",
          300: "#C4C4C0",
          400: "#9C9C97",
          500: "#7A7A75",
          600: "#5E5E5A",
          700: "#464643",
          800: "#2F2F2D",
          900: "#1D1D1C",
          950: "#131312",
        },

        // BRASS — the one accent. Every `emerald-*` in the app becomes this.
        emerald: {
          50: "#FBF7EF",
          100: "#F4EAD6",
          200: "#E8D4AC",
          300: "#DABE81",
          400: "#CDA75E",
          500: "#BE9247",
          600: "#9E763A",
          700: "#7C5C2F",
          800: "#5D4526",
          900: "#43321C",
          950: "#261C10",
        },

        // Caution — clay. Warm, but browner and duller than brass, and always
        // carried by a written label as well, so the two are never told apart
        // by hue alone.
        amber: {
          50: "#FCF5EF",
          100: "#F7E7D7",
          200: "#EDCCAC",
          300: "#DFAC7C",
          400: "#CE8B52",
          500: "#B9703A",
          600: "#985A2F",
          700: "#764726",
          800: "#58361E",
          900: "#402816",
          950: "#24160C",
        },

        // Critical — oxide red. Deliberately dark and matte: an alert should
        // look grave, not neon.
        rose: {
          50: "#FDF3F2",
          100: "#FADFDC",
          200: "#F0BAB4",
          300: "#E0938A",
          400: "#CC6E63",
          500: "#B24C40",
          600: "#933D33",
          700: "#733029",
          800: "#57251F",
          900: "#3F1B17",
          950: "#230F0D",
        },

        // Information — steel blue. The only cool hue on the board, kept quiet.
        sky: {
          50: "#F3F6F9",
          100: "#E1E9F1",
          200: "#C1D2E2",
          300: "#9CB6CE",
          400: "#7597B5",
          500: "#5A7C9C",
          600: "#496681",
          700: "#3A5165",
          800: "#2C3D4C",
          900: "#202D38",
          950: "#131A20",
        },

        // Kept so the handful of existing usages stop being neon. Muted plum.
        violet: {
          50: "#F7F5F8",
          100: "#EBE6EE",
          200: "#D6CCDC",
          300: "#BCADC6",
          400: "#9F8CAD",
          500: "#867192",
          600: "#6D5B78",
          700: "#56475E",
          800: "#3F3546",
          900: "#2D2632",
          950: "#191419",
        },

        war: { DEFAULT: "#BE9247", dim: "#9E763A" },
        alert: "#B24C40",
        caution: "#B9703A",
        intel: "#5A7C9C",
      },

      fontFamily: {
        display: ["var(--font-display)", "Archivo", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      // Tighter than Tailwind's default at display sizes. A headline set at the
      // browser default leading is the most common reason a page looks like a
      // template rather than a designed thing.
      letterSpacing: {
        tightest: "-0.035em",
      },
    },
  },
  plugins: [],
};
export default config;
