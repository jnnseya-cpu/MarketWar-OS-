// npm run check:register
//
// DOES THE DATA REGISTER STILL DESCRIBE THE WHOLE PLATFORM?
//
// WHY THIS IS A GATE. `src/backend/privacy.ts` answers two questions with legal
// weight: what does MarketWar hold about this customer, and what happens when
// they ask for it to be erased. Both answers are only as good as the register
// they read from, and a register maintained by hand is wrong the moment the
// ninety-first collection is written — silently, and in the direction that
// matters, because an export that misses a store still looks like a success and
// an erasure that misses one still prints a receipt.
//
// That is this repository's oldest defect class (a value that exists on one side
// of a boundary and never gets carried across) in its most expensive form. So
// completeness is enforced here rather than asserted in a comment:
//
//   • Every collection the backend touches must appear in DATA_STORES.
//   • Every entry in DATA_STORES must correspond to a collection that exists,
//     so the register cannot drift the other way either and carry entries for
//     stores that were removed.
//
// HOW COLLECTIONS ARE FOUND. `.collection("literal")` and `.collection(IDENT)`
// where IDENT is a string constant in the same file — which is how all sixty
// backend modules do it. A collection name built at runtime from a variable
// would be invisible, so the scan also reports any `.collection(x)` it could
// NOT resolve and fails on it: an unresolvable name means this gate has stopped
// being able to see the truth, which is worse than a missing entry.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const BACKEND = join(ROOT, "src/backend");
const REGISTER = join(BACKEND, "privacy.ts");

const say = (m) => process.stdout.write(m + "\n");

// --- what the code touches -------------------------------------------------
const inCode = new Map();      // collection -> Set(file)
const unresolved = [];

for (const file of readdirSync(BACKEND)) {
  if (!file.endsWith(".ts")) continue;
  if (file === "privacy.ts") continue;               // the register itself
  // PROSE IS NOT CODE. This gate failed once on a doc-comment that explained
  // the rule by quoting an unresolvable call — a check that fails for a reason
  // unrelated to what it tests, which is the other defect class this repository
  // keeps producing. Whole-line comments are dropped before the scan; a comment
  // in the middle of a line of code is left alone, because dropping it needs a
  // tokeniser and getting that wrong would hide a real call.
  const text = readFileSync(join(BACKEND, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
    .join("\n");

  // String constants in this file, so `.collection(COLLECTION)` resolves.
  const consts = new Map();
  for (const m of text.matchAll(/\b(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*string\s*)?=\s*"([a-zA-Z0-9_]+)"/g)) {
    consts.set(m[1], m[2]);
  }

  for (const m of text.matchAll(/\.collection\(\s*(?:"([a-zA-Z0-9_]+)"|([A-Za-z_][A-Za-z0-9_]*))\s*\)/g)) {
    const name = m[1] || consts.get(m[2]);
    if (!name) { unresolved.push(`${file} → .collection(${m[2]})`); continue; }
    if (!inCode.has(name)) inCode.set(name, new Set());
    inCode.get(name).add(file);
  }
}

// --- what the register declares --------------------------------------------
// Read as TEXT on purpose. `privacy.ts` imports half the backend; importing it
// here would make a gate about a data register depend on Firestore, the crypto
// layer and every module they pull in — and a gate that cannot run without the
// system it checks is not a gate.
const registerSrc = readFileSync(REGISTER, "utf8");
const declared = new Set();
for (const m of registerSrc.matchAll(/\{\s*collection:\s*"([a-zA-Z0-9_]+)"/g)) declared.add(m[1]);

// The register names its own receipt store, which no other module writes yet.
const WRITTEN_BY_THE_REGISTER = new Set(["erasure_receipts"]);

const missing = [...inCode.keys()].filter((c) => !declared.has(c)).sort();
const stale = [...declared].filter((c) => !inCode.has(c) && !WRITTEN_BY_THE_REGISTER.has(c)).sort();

if (unresolved.length) {
  say(`check:register FAILED — ${unresolved.length} collection name(s) this gate cannot resolve:\n`);
  for (const u of unresolved) say(`  ${u}`);
  say("");
  say("A collection named by a runtime value is invisible to the register, so the");
  say("export and the erasure cannot be known to be complete. Name it with a string");
  say("constant in the same module.");
  process.exit(1);
}

if (missing.length) {
  say(`check:register FAILED — ${missing.length} collection(s) the backend writes are NOT in the data register:\n`);
  for (const c of missing) say(`  ${c}   (written by ${[...inCode.get(c)].join(", ")})`);
  say("");
  say("Add each to DATA_STORES in src/backend/privacy.ts with how it is keyed and");
  say("what erasure may do to it. Until then the GDPR export and erasure silently");
  say("miss it — and both still report success, which is the defect this gate exists");
  say("to prevent.");
  process.exit(1);
}

if (stale.length) {
  say(`check:register FAILED — ${stale.length} register entr(ies) for collections nothing writes:\n`);
  for (const c of stale) say(`  ${c}`);
  say("");
  say("A register that describes stores the platform no longer has overstates what");
  say("we hold. Remove the entry, or add it to WRITTEN_BY_THE_REGISTER if the");
  say("register itself is the writer.");
  process.exit(1);
}

say(`check:register passed — ${inCode.size} collections in the backend, all ${declared.size} declared in the data register.`);
say("  Export and erasure walk the register, so every store is accounted for — reached, retained with a stated basis, or named as unreachable.");
process.exit(0);
