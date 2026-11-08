// npm run check:lock
//
// HAS ANYTHING BEEN REMOVED, OR QUIETLY CHANGED?
//
// THE OWNER'S INSTRUCTION THIS ENFORCES: *"Stabilise and lock everything that
// has been done so far and nothing silently change or drop."* And before it,
// the standing additive-only law: never delete, never downgrade.
//
// Every other gate in this repository asks whether what is here is CORRECT.
// None of them asks whether what was here is STILL here — and that is the one
// failure that makes no noise. A deleted route still builds. An agent dropped
// from the registry still type-checks. A plan's price edited by one character
// still passes every test, because no test names the old number. A driver
// unhooked from `package.json` simply stops running, and silence from a gate
// that no longer exists reads exactly like a gate that passed.
//
// So: `docs/DELIVERED.lock.json` is a snapshot of the delivered surface, and
// this compares the code against it.
//
//   • ANYTHING ADDED PASSES. That is the additive-only law — growth is the
//     expected direction and never needs permission from a gate.
//   • ANYTHING REMOVED FAILS, by name.
//   • ANY LOCKED NUMBER THAT CHANGED FAILS, with both values.
//
// Accepting a change is deliberate and leaves a diff somebody can read:
// `npm run lock:update`, which rewrites the snapshot and is reviewed like any
// other committed file. The point is not that nothing may ever change — it is
// that nothing changes WITHOUT A LINE IN A DIFF SAYING SO.

import { readFileSync, existsSync } from "node:fs";
import { inventory, flatten, LOCK_PATH } from "./lock-inventory.mjs";

const say = (m) => process.stdout.write(m + "\n");

if (!existsSync(LOCK_PATH)) {
  say("check:lock FAILED — docs/DELIVERED.lock.json does not exist.\n");
  say("  Create it once with `npm run lock:update`, commit it, and every later");
  say("  removal or silent change is then a failing gate rather than a surprise.");
  process.exit(1);
}

let locked;
try {
  locked = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
} catch (e) {
  say(`check:lock FAILED — the lock file is not readable JSON: ${e.message}`);
  process.exit(1);
}

const now = await inventory();
const before = flatten(locked.inventory ?? {});
const after = flatten(now);

const removed = [];
const changed = [];
for (const [key, was] of before) {
  if (!after.has(key)) { removed.push(key); continue; }
  const is = after.get(key);
  if (String(was) !== String(is)) changed.push({ key, was, is });
}
const added = [...after.keys()].filter((k) => !before.has(k));

// --- group a long list of removals by their section, so the message is read
//     rather than scrolled past.
function grouped(keys) {
  const by = new Map();
  for (const k of keys) {
    const section = k.includes("[") ? k.slice(0, k.indexOf("[")) : k.split(".").slice(0, 2).join(".");
    const item = k.includes("[") ? k.slice(k.indexOf("[") + 1, -1) : k;
    if (!by.has(section)) by.set(section, []);
    by.get(section).push(item);
  }
  return by;
}

if (!removed.length && !changed.length) {
  say(`check:lock passed — all ${before.size} locked items are still here${added.length ? `, and ${added.length} new one(s) have been added` : ""}.`);
  if (added.length) {
    const by = grouped(added);
    for (const [section, items] of [...by].sort()) {
      say(`  + ${section}: ${items.slice(0, 6).join(", ")}${items.length > 6 ? ` … and ${items.length - 6} more` : ""}`);
    }
    say("");
    say("  Additions never fail this gate — the additive-only law expects them. Run");
    say("  `npm run lock:update` to record them so a later removal of one of THESE");
    say("  is caught too.");
  }
  process.exit(0);
}

say(`check:lock FAILED — ${removed.length} removed, ${changed.length} silently changed.\n`);

if (removed.length) {
  say("GONE (the additive-only law says these must not be):\n");
  for (const [section, items] of [...grouped(removed)].sort()) {
    say(`  ${section}`);
    for (const i of items.slice(0, 25)) say(`    - ${i}`);
    if (items.length > 25) say(`    … and ${items.length - 25} more`);
  }
  say("");
}

if (changed.length) {
  say("CHANGED (every one of these is a number or a flag somebody relies on):\n");
  for (const c of changed.slice(0, 40)) say(`  ${c.key}: ${c.was}  →  ${c.is}`);
  if (changed.length > 40) say(`  … and ${changed.length - 40} more`);
  say("");
}

say("If the change is deliberate — a renamed module, an upgraded price, a store");
say("that genuinely moved — run `npm run lock:update` and commit the result, so");
say("the diff records what changed and why. If it is not deliberate, this gate");
say("has just caught the one class of defect nothing else here would have.");
process.exit(1);
