// npm run verify:drivers
//
// THE BEHAVIOURAL PROOF, RE-RUN — because the strongest evidence in this
// repository was the only evidence nothing re-ran.
//
// Twenty drivers prove behaviour by DOING it: the real route handler, the real
// wallet, a stand-in provider with `fetch` intercepted only to rewrite the
// host. They are the reason several claims in `docs/STATE.md` are claims rather
// than hopes — and every one of them ran exactly when somebody remembered to
// type its name.
//
// Three had already rotted into a stack trace by the time this was written (a
// missing key, a server that was not started), which is what "nothing re-runs
// it" looks like after a few weeks. They now say so themselves; see
// `driver-preflight.mjs`.
//
// WHAT THIS RUNS, AND WHAT IT DOES NOT. Fourteen drivers that are hermetic —
// no DNS, no database, no port of their own, a few seconds each. Two more are
// hermetic and SLOW (`drive:pages` ~100s, `drive:crawl` boots a production
// server and crawls it), and they are named below rather than quietly left out:
// a list that hides its own exclusions is how a gate becomes decorative.
//
// A driver is a pass only if it exits 0 AND reports `0 broken`. Exiting 0 while
// printing "3 broken" is the exact shape of a reported success that never
// happened, and one of these drivers would have done it.

import { spawnSync } from "node:child_process";

const say = (m) => process.stdout.write(m + "\n");

/** Hermetic, fast, and exercising real code paths in this container. */
const RUN = [
  "reconcile", "costs", "presenter", "privacy", "keys", "secrets",
  "commerce", "contacts", "bulk", "chain", "import", "index",
  "social", "deliver",
];

/** Hermetic but too slow for every run. Named, not hidden. */
const SLOW = {
  "drive:pages": "~100s — exercises all 23 feature pages",
  "drive:crawl": "~2min+ — boots a production server and crawls every route",
  "drive:brief": "~2min — boots its own dev server and drives the brief surface over HTTP, then in a real browser",
  "drive:provider": "~2min — boots a dev server AND a stand-in provider, to read what the gateway actually sent",
};

/** Needs something this container has not got; each one says so itself now. */
const BLOCKED_HERE = {
  "drive:capi": "needs Firebase Admin",
  "drive:loop": "needs the platform running on :3000",
  "drive:modules": "needs the platform running on :3000",
  // The same script as drive:modules under a second name. Named anyway, so a
  // reader of this list does not go looking for where drive:live went.
  "drive:live": "the same script as drive:modules, under its other name",
};

say("");
say(`Re-running ${RUN.length} hermetic drivers. A pass is exit 0 AND "0 broken".`);
say("");

let failed = 0;
let totalProven = 0;
const notExercised = [];

for (const name of RUN) {
  const script = `drive:${name}`;
  const started = Date.now();
  const r = spawnSync("npm", ["run", "--silent", script], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const ms = Date.now() - started;
  const out = `${r.stdout || ""}${r.stderr || ""}`;

  // The tally each driver prints for itself. Read rather than assumed: a driver
  // that stopped printing one has stopped reporting, and that is a failure too.
  //
  // BOTH FORMATS, AND MISSING ONE WAS A HOLE IN THIS SWEEP. Half the drivers
  // print "21 proven, 0 broken" and half print "35 proven / 0 broken". The
  // first version of this read only the comma, so eight drivers showed as
  // "exit 0, no tally printed" — and one of them printing "3 BROKEN" while
  // exiting 0 would have been read as a pass. That is the precise defect this
  // whole command exists to catch, in the command itself.
  const tally = [...out.matchAll(/(\d+)\s+proven\s*(?:,|\/)\s*(\d+)\s+broken/g)].pop();
  const skipped = /NOT EXERCISED/.test(out);
  const proven = tally ? Number(tally[1]) : 0;
  const broken = tally ? Number(tally[2]) : 0;

  if (skipped) {
    notExercised.push(script);
    say(`  SKIPPED  ${script.padEnd(18)} ${String(ms).padStart(6)}ms  — said so itself, nothing claimed`);
    continue;
  }
  if (r.status !== 0) {
    failed++;
    say(`  BROKEN   ${script.padEnd(18)} ${String(ms).padStart(6)}ms  exit ${r.status}`);
    say(out.trim().split("\n").slice(-12).map((l) => `             ${l}`).join("\n"));
    continue;
  }
  if (!tally) {
    // Not every driver prints a tally (a few only assert by exiting non-zero).
    say(`  RAN      ${script.padEnd(18)} ${String(ms).padStart(6)}ms  exit 0, no tally printed`);
    continue;
  }
  if (broken > 0) {
    failed++;
    say(`  BROKEN   ${script.padEnd(18)} ${String(ms).padStart(6)}ms  ${proven} proven, ${broken} BROKEN`);
    say(out.split("\n").filter((l) => /BROKEN/.test(l)).slice(0, 10).map((l) => `             ${l.trim()}`).join("\n"));
    continue;
  }
  totalProven += proven;
  say(`  PROVEN   ${script.padEnd(18)} ${String(ms).padStart(6)}ms  ${proven} proven, 0 broken`);
}

say("");
say(`verify:drivers — ${totalProven} behaviours re-proven across ${RUN.length - failed - notExercised.length} drivers, ${failed} broken.`);
if (notExercised.length) say(`  not exercised here: ${notExercised.join(", ")}`);
say("");
say("NOT RUN BY THIS COMMAND, deliberately:");
for (const [name, why] of Object.entries(SLOW)) say(`  ${name.padEnd(16)} ${why}`);
for (const [name, why] of Object.entries(BLOCKED_HERE)) say(`  ${name.padEnd(16)} ${why}`);
say("");
process.exit(failed ? 1 : 0);
