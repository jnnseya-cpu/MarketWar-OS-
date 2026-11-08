import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A GATE NOTHING RUNS IS A COMMENT.
//
// WHAT THIS CAUGHT, on the day it was written. Twelve `check:*` gates existed
// in `package.json`. `npm run verify` ran nine of them. The CI workflow ran
// FIVE. So seven gates — the data register, route exposure, module-level
// credential reads, Firestore indexes, orphan modules, dead controls, and the
// advisory record — existed, passed when I ran them by hand, and were never run
// by anything that could block a merge.
//
// Every one of those was built in response to a real defect. Each of them was
// then left where nothing would notice if it started failing, which is the same
// class of silence as the defect it was built to catch: the gate had not been
// deleted, so nothing looked wrong, and it simply stopped being part of the
// wall.
//
// The owner's instruction was *"stabilise and lock everything that has been
// done so far and nothing silently change or drop"* — and the gates are part of
// "everything that has been done". A wall with a hole in it is not stabilised
// by adding bricks somewhere else.

const ROOT = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8"));
const ci = readFileSync(new URL(".github/workflows/ci.yml", ROOT), "utf8");

const gates = Object.keys(pkg.scripts).filter((k) => k.startsWith("check:")).sort();

test("EVERY GATE EXISTS, AND THERE ARE AT LEAST THE TWELVE THAT WERE BUILT", () => {
  assert.ok(gates.length >= 12, `only ${gates.length} gates — one has been removed: ${gates.join(", ")}`);
  // Named individually, because "there are twelve" stays true when one is
  // swapped for another.
  for (const required of [
    "check:advisories", "check:casts", "check:contrast", "check:controls",
    "check:exposure", "check:indexes", "check:key-reads", "check:layers",
    "check:lock", "check:orphans", "check:palette", "check:register",
  ]) {
    assert.ok(gates.includes(required), `${required} has gone from package.json`);
  }
});

test("EVERY GATE IS IN `npm run verify`", () => {
  const verify = pkg.scripts.verify || "";
  const missing = gates.filter((g) => !verify.includes(`npm run ${g}`));
  assert.deepEqual(missing, [], `verify does not run: ${missing.join(", ")} — so "it passed verify" would be a weaker statement than it sounds`);
  // And the five that are not `check:*` but are the whole point of verifying.
  for (const also of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "npm run verify:drivers"]) {
    assert.ok(verify.includes(also), `verify does not run \`${also}\``);
  }
  // THE DRIVERS RUN AFTER THE BUILD, because one of them audits the SHIPPED
  // pages and skips itself without `.next/BUILD_ID`. Before the build it would
  // skip on every run and report nothing, which reads like a pass.
  assert.ok(
    verify.indexOf("npm run verify:drivers") > verify.indexOf("npm run build"),
    "verify runs the drivers before the build, so the one that audits the shipped pages skips itself every time",
  );
});

test("EVERY GATE IS IN THE CI WORKFLOW", () => {
  // Locally a gate runs when somebody remembers. Here it runs whether they do
  // or not, which is the only version that stabilises anything.
  const missing = gates.filter((g) => !ci.includes(`npm run ${g}`));
  assert.deepEqual(missing, [], `the CI workflow does not run: ${missing.join(", ")}`);
  for (const also of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "npm run verify:drivers"]) {
    assert.ok(ci.includes(also), `the CI workflow does not run \`${also}\``);
  }
  assert.ok(
    ci.indexOf("npm run verify:drivers") > ci.indexOf("npm run build"),
    "CI runs the drivers before the build, so the one that audits the shipped pages skips itself every time",
  );
});

test("CI RUNS THE GATE RATHER THAN A SECOND COPY OF ITS RULE", () => {
  // The audit step used to be a bare `npm audit --audit-level=high`, while
  // `check:advisories` held the same rule PLUS the record of advisories with no
  // patched version in the pinned line. Two expressions of one rule, and the
  // one that decided a merge was the one with less information in it.
  const bare = ci.match(/^\s*(?:run:\s*)?npm audit[^\n]*/gm) || [];
  const offending = bare.filter((line) => !line.includes("||")); // informational prints are fine
  assert.deepEqual(offending, [], `CI re-implements the advisory rule instead of running the gate: ${offending.join(" | ")}`);
});

test("THE DRIVERS ARE STILL HOOKED UP, each to a file that exists", async () => {
  // Twenty-one drivers prove behaviour by running it — the real route, the real
  // wallet, a stand-in provider. They are the strongest evidence in the
  // repository and the easiest thing to lose, because unhooking one from
  // package.json removes it without deleting anything.
  const drivers = Object.entries(pkg.scripts).filter(([k]) => k.startsWith("drive:"));
  assert.ok(drivers.length >= 20, `only ${drivers.length} drivers are hooked up`);

  const hooked = new Set();
  for (const [name, cmd] of drivers) {
    const file = (cmd.match(/scripts\/[\w.-]+\.mjs/) || [])[0];
    assert.ok(file, `${name} does not point at a driver script: ${cmd}`);
    assert.doesNotThrow(
      () => readFileSync(new URL(file, ROOT), "utf8"),
      `${name} points at ${file}, which is not there`,
    );
    hooked.add(file);
  }

  // AND THE OTHER DIRECTION, which is the way a driver actually gets lost: the
  // file stays in the tree, nothing in package.json points at it, and it is
  // never run again. Nothing is deleted, so nothing looks wrong.
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(new URL("scripts/", ROOT))
    .filter((f) => f.startsWith("drive-") && f.endsWith(".mjs"))
    .map((f) => `scripts/${f}`);
  assert.ok(files.length >= 19, `only ${files.length} driver files remain`);
  const orphaned = files.filter((f) => !hooked.has(f)).sort();
  assert.deepEqual(orphaned, [], `these drivers exist but no npm script runs them, so nothing ever will: ${orphaned.join(", ")}`);
});

test("THE DRIVER SWEEP NAMES WHAT IT DOES NOT RUN", async () => {
  // A list that hides its own exclusions is how a gate becomes decorative. Six
  // drivers are not in the sweep — two for time, three for a missing
  // precondition, and one that skips itself — and every one of them is printed
  // by name when it runs.
  const sweep = readFileSync(new URL("scripts/verify-drivers.mjs", ROOT), "utf8");
  const drivers = Object.keys(pkg.scripts).filter((k) => k.startsWith("drive:"));
  const missing = drivers.filter((d) => !sweep.includes(d) && !sweep.includes(d.replace("drive:", '"')));
  assert.deepEqual(missing, [], `these drivers are neither run nor named as excluded: ${missing.join(", ")}`);

  // AND A PASS IS NOT JUST AN EXIT CODE. A driver that exits 0 while printing
  // "1 broken" is the exact shape of a reported success that never happened,
  // and one of them did exactly that on the first sweep.
  assert.match(sweep, /broken > 0/, "the sweep does not read the tally, only the exit code");
  assert.match(sweep, /NOT EXERCISED/, "the sweep cannot tell a skip from a pass");
});

test("THE LOCK FILE IS COMMITTED AND IS THE REAL SHAPE", () => {
  // `check:lock` compares the code against this. If it were missing, the gate
  // would fail loudly — but if it were an empty object it would PASS silently,
  // which is the worse failure.
  const lock = JSON.parse(readFileSync(new URL("docs/DELIVERED.lock.json", ROOT), "utf8"));
  assert.ok(lock.inventory, "the lock file carries no inventory");
  assert.ok(lock.lockedItems > 1000, `the lock holds only ${lock.lockedItems} items — it has been emptied`);

  // The parts that matter most are named, so a lock regenerated from a broken
  // inventory cannot pass as a full one.
  for (const section of ["laws", "prices", "stripe", "registries", "surface", "npm"]) {
    assert.ok(lock.inventory[section], `the lock has no ${section} section`);
  }
  for (const law of ["STANDARD_MARKUP", "MARKUP_FLOOR", "ACU_PER_GBP", "ACU_ALLOCATION_RATE", "NET_PROFIT_FLOOR"]) {
    assert.ok(law in lock.inventory.laws, `${law} is not locked`);
  }
  assert.equal(lock.inventory.laws.STANDARD_MARKUP, 4);
  assert.equal(lock.inventory.laws.MARKUP_FLOOR, 2);
  assert.equal(lock.inventory.laws.ACU_ALLOCATION_RATE, 0.2);

  // And no timestamp, because a regenerated-but-identical lock has to produce a
  // byte-identical file or every run of `lock:update` is a diff and the diffs
  // stop being read.
  const raw = readFileSync(new URL("docs/DELIVERED.lock.json", ROOT), "utf8");
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(raw), "the lock file carries a timestamp, so it diffs on every regeneration");
});

test("the lock cannot be cleared by the thing it guards", () => {
  // `lock:update` is the only way to accept a removal, and it is a separate,
  // deliberate command that leaves a reviewable diff. If `verify` or CI ran it,
  // the gate would clear itself and guard nothing.
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (name === "lock:update") continue;
    assert.ok(!cmd.includes("update-lock"), `\`${name}\` regenerates the lock, so the gate clears itself`);
  }
  assert.ok(!ci.includes("lock:update") && !ci.includes("update-lock"), "CI regenerates the lock instead of checking it");
});
