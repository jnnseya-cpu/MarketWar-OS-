// LAUNCH-AUDIT FINDING D-03 (P2): lint had never run on this codebase.
//
// There was a `lint` script in package.json and no ESLint configuration behind
// it, so `npm run lint` dropped into `next lint`'s interactive first-run wizard
// — which in CI would hang and locally just looked like a question nobody
// answered. The script existed, was named in the verify chain, and had never
// once produced a finding. That is worse than no script: it reads as coverage.
//
// This is the flat config ESLint 9 requires. `next lint` is deprecated in
// Next 15 and removed in 16, so `npm run lint` now calls the ESLint CLI
// directly and keeps working past that removal.
//
// WHAT IS ON, AND WHY IT IS NOT MORE. Next's own rules, the React hooks rules,
// and a small set of correctness rules that map to defects this repository has
// actually shipped. It deliberately does NOT enable a large stylistic set: a
// first run that produces two thousand findings gets switched off, and a rule
// nobody fixes trains people to ignore the output.

import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "public/**",
      // Generated documents and their build artefacts.
      "docs/**",
      // Tests use deliberate anti-patterns — hostile payloads, fake credentials
      // asserted to be redacted — and are checked by the suite itself.
      "tests/**",
    ],
  },

  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        process: "readonly", console: "readonly", fetch: "readonly", URL: "readonly",
        URLSearchParams: "readonly", Buffer: "readonly", window: "readonly",
        document: "readonly", navigator: "readonly", localStorage: "readonly",
        sessionStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly", AbortController: "readonly",
        Response: "readonly", Request: "readonly", Headers: "readonly", FormData: "readonly",
        Blob: "readonly", File: "readonly", FileReader: "readonly", crypto: "readonly",
        TextDecoder: "readonly", TextEncoder: "readonly", structuredClone: "readonly",
        HTMLElement: "readonly", Image: "readonly", MediaRecorder: "readonly",
        __dirname: "readonly", module: "readonly", require: "readonly", global: "readonly",
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // Only the two TypeScript rules this codebase already suppresses by name.
      // Enabling the full recommended set on a 237-module codebase in one go
      // produces a backlog nobody works through; these two exist because the
      // repository has already argued about them at specific lines.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

      // DEBUG CODE IS A DEFECT, not a style preference — audit finding D-01 was
      // a `console.log` of an import response inside a flow handling customer
      // records. `warn`/`error` stay allowed: this codebase uses them
      // deliberately for failures that must never be silent.
      "no-console": ["error", { allow: ["warn", "error"] }],

      "no-debugger": "error",

      // AN EMPTY CATCH IS HOW A FAILURE BECOMES A SILENT SUCCESS — the single
      // defect class this repository has bled on most.
      "no-empty": ["error", { allowEmptyCatch: false }],

      eqeqeq: ["error", "smart"],
    },
  },

  // THE REACT RULES BELONG TO THE REACT LAYERS ONLY.
  //
  // `react-hooks/rules-of-hooks` reported 137 errors on the first run and every
  // one was a false positive: this codebase has a backend helper called
  // `useDb()` — `const useDb = () => Boolean(adminConfigured && adminDb)` — and
  // the rule treats any `useX` identifier as a React hook. `src/backend` and
  // `src/shared` contain no React at all, which the layer guard already
  // enforces, so the rule cannot be telling the truth there.
  //
  // Scoped rather than disabled: it still runs everywhere React actually lives.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/frontend/**/*.{ts,tsx}"],
    rules: { ...reactHooks.configs.recommended.rules },
  },

  // COMMAND-LINE PROGRAMS PRINT. `scripts/` and `worker/` are Node CLIs and a
  // background worker whose stdout IS the product — a smoke test that cannot
  // report is not a smoke test. `no-console` stays on for `src/`, which is what
  // ships to a browser and a serverless function.
  {
    files: ["scripts/**/*.{js,mjs,ts}", "worker/**/*.{js,mjs,ts}", "*.mjs"],
    rules: { "no-console": "off" },
  },
];
