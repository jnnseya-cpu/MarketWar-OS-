// npm run check:key-reads
//
// IS ANY CREDENTIAL CAPTURED AT IMPORT TIME, WHERE IT CAN NEVER CHANGE?
//
// WHY THIS IS A GATE. §170 moved the owner's API keys into the admin account.
// They are stored encrypted, and hydrated into `process.env` so that all 125
// existing `process.env.<NAME>` reads keep working with no call-site changes. That
// design has exactly one failure mode, and it is silent:
//
//   const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
//   export const checkoutConfigured = Boolean(STRIPE_SECRET_KEY);
//
// A module-level read is evaluated ONCE, the first time the module loads. If
// that happens before the key is hydrated — which it always does, because
// hydration is lazy and happens inside a request — the module holds the empty
// string for the life of the instance. The admin screen says the key is set.
// `/api/health/live` says the key is set. The key IS set. And checkout stays in
// demo mode until the server recycles.
//
// That is a reported success that never happened, on the money path, and it was
// real: this gate exists because the Stripe key was captured exactly that way
// and the feature would have appeared to work for every key except the one that
// takes payment.
//
// WHAT IT ALLOWS, deliberately:
//   • A read INSIDE a function or an arrow — `() => process.env.<NAME>` — which is
//     what the AI gateway already does, and is the correct pattern.
//   • A module-level read of something that is NOT a settable credential: a
//     tuning default like `META_GRAPH_VERSION`, a model id, `NODE_ENV`. Those
//     are not managed from the admin screen, so freezing them is harmless and
//     forcing a refactor would be churn.
//   • `FIELD_ENCRYPTION_MASTER_KEY` in `crypto.ts`, because it CANNOT be set
//     from the admin account — it is what decrypts the store — so capturing it
//     at import is correct rather than a defect.
//
// WHAT IT REFUSES: a module-level read of any catalogued variable that the
// admin account can set. Those must be read at the moment they are used.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const say = (m) => process.stdout.write(m + "\n");

// ---------------------------------------------------------------------------
// Which names the admin account can set — read from the catalogue and the
// refusal list, as TEXT, so this gate does not have to import the backend (and
// with it Firestore) to answer a question about source code.
// ---------------------------------------------------------------------------
const catalogue = readFileSync(join(ROOT, "src/shared/env-catalogue.ts"), "utf8");
const keysSrc = readFileSync(join(ROOT, "src/backend/platform-keys.ts"), "utf8");

const catalogued = new Map(); // name -> secret?
for (const m of catalogue.matchAll(/\{\s*name:\s*"([A-Z0-9_]+)",\s*group:\s*"[^"]*",\s*secret:\s*(true|false)/g)) {
  catalogued.set(m[1], m[2] === "true");
}

// The NOT_STOREABLE block: names the admin account cannot set at all.
const notStoreable = new Set();
const blockStart = keysSrc.indexOf("export const NOT_STOREABLE");
if (blockStart >= 0) {
  const block = keysSrc.slice(blockStart, keysSrc.indexOf("};", blockStart));
  for (const m of block.matchAll(/^\s*([A-Z0-9_]+):/gm)) notStoreable.add(m[1]);
}

/** Settable from the admin account at all. */
const settable = (name) =>
  catalogued.has(name) && !notStoreable.has(name) && !name.startsWith("NEXT_PUBLIC_");

/**
 * A CREDENTIAL that is settable — the only class this gate FAILS on.
 *
 * SCOPED, AFTER THE FIRST RUN REPORTED 32 FINDINGS AND MOST WERE NOISE. The
 * catalogue marks each variable `secret: true/false`, and the non-secrets are
 * tuning and host defaults: `MW_SENDING_HOST`, `ELEVENLABS_MODEL`,
 * `VIDEO_COST_PER_SECOND_GBP`. Freezing one of those at import is the behaviour
 * this platform has always had, it is not what §170 changed, and failing a
 * build over it would be churn dressed as rigour — the first step towards a
 * gate somebody switches off.
 *
 * A frozen SECRET is different in kind: it is the thing the owner just typed
 * into the admin screen, and freezing it means the screen lies. Those fail.
 * The non-secret captures are still printed, as a report, so the information is
 * not lost.
 */
const settableSecret = (name) => settable(name) && catalogued.get(name) === true;

if (catalogued.size < 50 || notStoreable.size < 5) {
  say(`check:key-reads FAILED — this gate could not read what it needs: ${catalogued.size} catalogued names, ${notStoreable.size} refusals.`);
  say("That means the catalogue or the refusal list changed shape, and the gate is");
  say("now blind rather than passing. Fix the parse before trusting a pass.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Find module-level reads.
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (extname(n) === ".ts" || extname(n) === ".tsx") out.push(f);
  }
  return out;
}

const findings = [];
const reported = [];
for (const file of walk(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  // Brace depth tells module level from inside-a-function. Tracked across the
  // file rather than per line, because a declaration can span lines.
  let depth = 0;
  let inBlockComment = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Comments are not code — the same lesson `check:controls` learned by
    // reporting a `<button>` inside a comment describing its own repair.
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      return;
    }
    if (trimmed.startsWith("/*")) { if (!trimmed.includes("*/")) inBlockComment = true; return; }
    const code = trimmed.startsWith("//") ? "" : line.replace(/\/\/.*$/, "");

    if (depth === 0) {
      for (const m of code.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = m[1];
        if (!settable(name)) continue;
        // LAZY READS ON ONE LINE ARE CORRECT, NOT DEFECTS, and the first version
        // of this check reported five of them. All three of these are evaluated
        // per call, not at import:
        //   export function serperKey() { return process.env.SERPER_API_KEY; }
        //   const key = () => process.env.<NAME>;
        //   export function f(raw = process.env.<NAME>) {…}   ← a default parameter
        // So a line carrying `function` or `=>` before the read is a function
        // body or a default, and only a bare assignment is a capture.
        const before = code.slice(0, code.indexOf(m[0]));
        if (/\bfunction\b|=>/.test(before)) continue;
        (settableSecret(name) ? findings : reported).push({ file: relative(ROOT, file), line: i + 1, name, code: code.trim().slice(0, 100) });
      }
    }
    // BRACES ONLY. The first version counted parentheses too, which made the
    // depth meaningless — a multi-line call signature left it permanently
    // above zero, or a `)` dragged it below, so "module level" stopped meaning
    // anything.
    for (const ch of code) {
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  });
}

if (findings.length) {
  say(`check:key-reads FAILED — ${findings.length} credential(s) read at MODULE level, where the value is frozen when the module first loads:\n`);
  for (const f of findings) say(`  ${f.file}:${f.line}\n      ${f.name} — ${f.code}`);
  say("");
  say("A key set in the admin account is hydrated into process.env inside a request,");
  say("which is always AFTER the module loaded. So this module will hold whatever the");
  say("environment had at boot — usually nothing — while the admin screen, the health");
  say("endpoint and the store all correctly report the key as set.");
  say("");
  say("Read it where it is used instead: `const key = () => process.env.<NAME> || \"\"`.");
  process.exit(1);
}

say(`check:key-reads passed — no settable CREDENTIAL is captured at import time (${catalogued.size} catalogued, ${[...catalogued.keys()].filter(settableSecret).length} settable secrets).`);
say("  Each is read at the moment it is used, so a key saved in the admin account takes effect without a redeploy.");

if (reported.length) {
  say("");
  say(`REPORTED, not failed — ${reported.length} NON-SECRET setting(s) frozen at import:`);
  for (const f of reported) say(`  ${f.file}:${f.line}  ${f.name}`);
  say("  These are tuning and host defaults, not credentials. Changing one in the admin");
  say("  account takes effect when the instance next starts. Worth knowing, not worth a");
  say("  refactor of working code.");
}
process.exit(0);
