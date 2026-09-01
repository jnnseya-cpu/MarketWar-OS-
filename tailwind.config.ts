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
        // EVERY COLOUR IS A VARIABLE, so the same utility can render in two
        // themes. `bg-ink-900` cannot mean one fixed hex if a light mode is ever
        // to exist without editing 92 pages — it has to resolve through a token
        // the document can redefine. The `<alpha-value>` placeholder is what
        // keeps `bg-white/5` and `border-white/10` working: Tailwind
        // substitutes the opacity into the rgb() itself.
        //
        // The values live in globals.css, in two blocks: `:root` (dark, the
        // default and the identity) and `:root[data-theme="light"]`.
        white: "rgb(var(--c-white) / <alpha-value>)",
        ink: {
          600: "rgb(var(--c-ink-600) / <alpha-value>)",
          700: "rgb(var(--c-ink-700) / <alpha-value>)",
          800: "rgb(var(--c-ink-800) / <alpha-value>)",
          850: "rgb(var(--c-ink-850) / <alpha-value>)",
          900: "rgb(var(--c-ink-900) / <alpha-value>)",
          950: "rgb(var(--c-ink-950) / <alpha-value>)",
        },
        slate: {
          50: "rgb(var(--c-slate-50) / <alpha-value>)",
          100: "rgb(var(--c-slate-100) / <alpha-value>)",
          200: "rgb(var(--c-slate-200) / <alpha-value>)",
          300: "rgb(var(--c-slate-300) / <alpha-value>)",
          400: "rgb(var(--c-slate-400) / <alpha-value>)",
          500: "rgb(var(--c-slate-500) / <alpha-value>)",
          600: "rgb(var(--c-slate-600) / <alpha-value>)",
          700: "rgb(var(--c-slate-700) / <alpha-value>)",
          800: "rgb(var(--c-slate-800) / <alpha-value>)",
          900: "rgb(var(--c-slate-900) / <alpha-value>)",
          950: "rgb(var(--c-slate-950) / <alpha-value>)",
        },
        emerald: {
          50: "rgb(var(--c-emerald-50) / <alpha-value>)",
          100: "rgb(var(--c-emerald-100) / <alpha-value>)",
          200: "rgb(var(--c-emerald-200) / <alpha-value>)",
          300: "rgb(var(--c-emerald-300) / <alpha-value>)",
          400: "rgb(var(--c-emerald-400) / <alpha-value>)",
          500: "rgb(var(--c-emerald-500) / <alpha-value>)",
          600: "rgb(var(--c-emerald-600) / <alpha-value>)",
          700: "rgb(var(--c-emerald-700) / <alpha-value>)",
          800: "rgb(var(--c-emerald-800) / <alpha-value>)",
          900: "rgb(var(--c-emerald-900) / <alpha-value>)",
          950: "rgb(var(--c-emerald-950) / <alpha-value>)",
        },
        amber: {
          50: "rgb(var(--c-amber-50) / <alpha-value>)",
          100: "rgb(var(--c-amber-100) / <alpha-value>)",
          200: "rgb(var(--c-amber-200) / <alpha-value>)",
          300: "rgb(var(--c-amber-300) / <alpha-value>)",
          400: "rgb(var(--c-amber-400) / <alpha-value>)",
          500: "rgb(var(--c-amber-500) / <alpha-value>)",
          600: "rgb(var(--c-amber-600) / <alpha-value>)",
          700: "rgb(var(--c-amber-700) / <alpha-value>)",
          800: "rgb(var(--c-amber-800) / <alpha-value>)",
          900: "rgb(var(--c-amber-900) / <alpha-value>)",
          950: "rgb(var(--c-amber-950) / <alpha-value>)",
        },
        rose: {
          50: "rgb(var(--c-rose-50) / <alpha-value>)",
          100: "rgb(var(--c-rose-100) / <alpha-value>)",
          200: "rgb(var(--c-rose-200) / <alpha-value>)",
          300: "rgb(var(--c-rose-300) / <alpha-value>)",
          400: "rgb(var(--c-rose-400) / <alpha-value>)",
          500: "rgb(var(--c-rose-500) / <alpha-value>)",
          600: "rgb(var(--c-rose-600) / <alpha-value>)",
          700: "rgb(var(--c-rose-700) / <alpha-value>)",
          800: "rgb(var(--c-rose-800) / <alpha-value>)",
          900: "rgb(var(--c-rose-900) / <alpha-value>)",
          950: "rgb(var(--c-rose-950) / <alpha-value>)",
        },
        sky: {
          50: "rgb(var(--c-sky-50) / <alpha-value>)",
          100: "rgb(var(--c-sky-100) / <alpha-value>)",
          200: "rgb(var(--c-sky-200) / <alpha-value>)",
          300: "rgb(var(--c-sky-300) / <alpha-value>)",
          400: "rgb(var(--c-sky-400) / <alpha-value>)",
          500: "rgb(var(--c-sky-500) / <alpha-value>)",
          600: "rgb(var(--c-sky-600) / <alpha-value>)",
          700: "rgb(var(--c-sky-700) / <alpha-value>)",
          800: "rgb(var(--c-sky-800) / <alpha-value>)",
          900: "rgb(var(--c-sky-900) / <alpha-value>)",
          950: "rgb(var(--c-sky-950) / <alpha-value>)",
        },
        violet: {
          50: "rgb(var(--c-violet-50) / <alpha-value>)",
          100: "rgb(var(--c-violet-100) / <alpha-value>)",
          200: "rgb(var(--c-violet-200) / <alpha-value>)",
          300: "rgb(var(--c-violet-300) / <alpha-value>)",
          400: "rgb(var(--c-violet-400) / <alpha-value>)",
          500: "rgb(var(--c-violet-500) / <alpha-value>)",
          600: "rgb(var(--c-violet-600) / <alpha-value>)",
          700: "rgb(var(--c-violet-700) / <alpha-value>)",
          800: "rgb(var(--c-violet-800) / <alpha-value>)",
          900: "rgb(var(--c-violet-900) / <alpha-value>)",
          950: "rgb(var(--c-violet-950) / <alpha-value>)",
        },

        war: { DEFAULT: "rgb(var(--c-emerald-500) / <alpha-value>)", dim: "rgb(var(--c-emerald-600) / <alpha-value>)" },
        alert: "rgb(var(--c-rose-500) / <alpha-value>)",
        caution: "rgb(var(--c-amber-500) / <alpha-value>)",
        intel: "rgb(var(--c-sky-500) / <alpha-value>)",
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
