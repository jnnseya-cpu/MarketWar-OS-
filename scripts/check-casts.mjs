// Static cast checker — a type assertion on external data is not a check.
//
// WHY THIS EXISTS, in the words of the two production crashes that caused it:
//
//   /dashboard/video — "Cannot read properties of undefined (reading 'map')".
//   `listVideoJobs` read Firestore with `d.data() as VideoJob`. That is a CAST:
//   it tells TypeScript the shape is guaranteed while guaranteeing nothing. A
//   job written before `outputUrls` existed came back without it, the render
//   farm mapped that field for every row it drew, and the page died on load.
//
//   The client approval portal — the identical `s.data() as ApprovalItem`, with
//   `[...item.history]` behind it. Same crash, but seen by the agency's own
//   customer on a signed link.
//
// Both were invisible to `tsc`, because a cast is the programmer promising the
// compiler something nobody verified. So the compiler cannot catch this class;
// a checker has to.
//
// THE RULE. In src/, a value that came from OUTSIDE the process — a stored
// document (`.data()`) or an HTTP response (`.json()`) — may not be turned into
// a domain type with `as`. Give it a function that checks it and returns null
// when it cannot: `jobFromStored` in backend/video-jobs.ts and
// `approvalFromStored` in backend/approvals.ts are the two worked examples.
//
// A RATCHET, NOT A BIG BANG. There were 115 `.data() as` and 39 `.json() as`
// when this landed. Rewriting them all at once, untested, would risk far more
// than it fixed. So the current counts are a baseline: a NEW one fails the
// build, and every one removed must be removed from the baseline too, so the
// number can only ever go down and the file cannot quietly go stale.
//
//   npm run check:casts              — enforce
//   npm run check:casts -- --update  — after removing some, record the new floor
//
// Runs as part of `npm run verify`, beside the layer check.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ROOT = arg("root", "src");
const BASELINE = arg("baseline", "scripts/casts-baseline.json");

// Comments are stripped before matching. This repository has failed checks on
// their own explanatory comments more than once — including a comment that
// merely NAMED the pattern being banned.
const codeOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// `as const` is not an assertion about external shape, so it is never a hit.
const RULES = [
  {
    id: "data-cast",
    what: "a stored document cast to a domain type",
    // `.data() as X`, including the cast on the next line.
    re: /\.data\(\)\s*(?:\r?\n\s*)?as\s+(?!const\b)/g,
    fix: "read it through a function that checks it — see `jobFromStored` in src/backend/video-jobs.ts",
  },
  {
    id: "json-cast",
    what: "an HTTP response cast to a domain type",
    re: /\.json\(\)\s*(?:\r?\n\s*)?as\s+(?!const\b)|\(await\s+[A-Za-z_$][\w$]*\.json\(\)\)\s*as\s+(?!const\b)/g,
    fix: "check the fields you are about to use — `await res.json()` is typed `any`, so the annotation is a claim nobody verified",
  },
];

function walk(dir, fn) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (/\.(ts|tsx)$/.test(name)) fn(p.replace(/\\/g, "/"), readFileSync(p, "utf8"));
  }
}

/** { ruleId: { file: count } } for everything currently in the tree. */
function measure() {
  const found = Object.fromEntries(RULES.map((r) => [r.id, {}]));
  walk(ROOT, (file, raw) => {
    const src = codeOf(raw);
    for (const rule of RULES) {
      const n = (src.match(rule.re) || []).length;
      if (n > 0) found[rule.id][file] = n;
    }
  });
  return found;
}

const found = measure();

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify(found, null, 2)}\n`);
  const total = RULES.reduce((n, r) => n + Object.values(found[r.id]).reduce((a, b) => a + b, 0), 0);
  console.log(`Baseline written to ${BASELINE} — ${total} cast(s) recorded as the current floor.`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error(`Cast check FAILED — no baseline at ${BASELINE}. Run: npm run check:casts -- --update`);
  process.exit(1);
}

const added = [];   // new or increased — the build must fail
const removed = []; // improved, but the baseline still claims the old number

for (const rule of RULES) {
  const now = found[rule.id] || {};
  const was = baseline[rule.id] || {};
  for (const [file, n] of Object.entries(now)) {
    const before = was[file] || 0;
    if (n > before) {
      added.push(before === 0
        ? `${file}: ${rule.what} (${n}) — ${rule.fix}`
        : `${file}: ${rule.what} went from ${before} to ${n} — ${rule.fix}`);
    }
  }
  for (const [file, before] of Object.entries(was)) {
    const n = now[file] || 0;
    if (n < before) removed.push(`${file}: ${before} → ${n}`);
  }
}

if (added.length) {
  console.error(`Cast check FAILED — ${added.length} new cast(s) on external data:`);
  for (const a of added) console.error(`  ✗ ${a}`);
  console.error("\nA type assertion is the programmer promising the compiler something nobody verified.");
  console.error("Two production crashes came from exactly this, and tsc could not see either.");
  process.exit(1);
}

// A baseline that is allowed to sit above the truth stops being a floor. This
// fails loudly rather than passing quietly, because the whole value of a ratchet
// is that the number it records is the real one.
if (removed.length) {
  console.error(`Cast check: ${removed.length} file(s) improved — record the new floor so it cannot creep back:`);
  for (const r of removed) console.error(`  ↓ ${r}`);
  console.error("\n  npm run check:casts -- --update");
  process.exit(1);
}

const total = RULES.reduce((n, r) => n + Object.values(found[r.id]).reduce((a, b) => a + b, 0), 0);
console.log(`Cast check passed — no new assertions on external data (${total} remaining, and it can only go down).`);
