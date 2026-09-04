#!/usr/bin/env node
// PROVE THE HUNTER ADAPTER AGAINST THE REAL API, BEFORE A CREDIT IS SPENT IN ANGER.
//
// WHY THIS EXISTS. `enrichment-adapters.ts` carries a rule this repository wrote
// for itself and has been right about:
//
//   "A stub that compiles and has never been run against the real API is worse
//    than an absence: it looks like coverage in a code review, it passes a type
//    check, and it fails the first time somebody pays for it — with a mapping
//    nobody verified and error shapes nobody has seen."
//
// The Hunter adapter is written, and the environment it was written in cannot
// reach api.hunter.io at all. Its field mapping is therefore REASONED, not
// OBSERVED, and this is what converts one into the other.
//
//   HUNTER_API_KEY=xxx node --import tsx scripts/check-hunter.mjs
//   HUNTER_API_KEY=xxx node --import tsx scripts/check-hunter.mjs acme.co.uk
//
// IT RUNS THE SERVER'S OWN PROBE — `backend/hunter-probe.ts`, the same module
// `/api/health/enrichment?probe=1` calls. There is no second copy of the field
// list to drift from the first, so a pass here is a pass in production.
//
// If you would rather not use a terminal: deploy, sign in as a platform admin,
// and open /api/health/enrichment?probe=1. Identical checks, identical cost.
//
// IT SPENDS REAL CREDITS: one domain search, one email finder and one
// verification, about $0.11 at list price. That is the cheapest possible way to
// find out the integration is wrong.
//
// IT PRINTS NO KEY, AND NO CONTACT DATA. Field presence, statuses and counts —
// never an address, never a name.

if (!(process.env.HUNTER_API_KEY || "").trim()) {
  console.error("HUNTER_API_KEY is not set in this shell.\n  HUNTER_API_KEY=xxx node --import tsx scripts/check-hunter.mjs");
  process.exit(2);
}

const { probeHunter } = await import("../src/backend/hunter-probe.ts");
const report = await probeHunter(process.argv[2] || "stripe.com");

console.log("\nHunter adapter check");
console.log("────────────────────");
console.log(`  configured      : ${report.configured ? "yes" : "NO"}`);
console.log(`  search credits  : ${report.searchCreditsLeft ?? "—"}`);
console.log(`  verify credits  : ${report.verifyCreditsLeft ?? "—"}`);

for (const s of report.sections) {
  console.log(`\n  ${s.endpoint}${s.status === null ? "  (no response)" : `  HTTP ${s.status}`}`);
  for (const c of s.checks) {
    console.log(`    ${c.present ? "✓" : "✗ MISSING"}  ${c.field}  → ${c.saw}`);
  }
  console.log(`    → the adapter would produce: ${s.wouldProduce}`);
  if (s.error) console.log(`    ! ${s.error}`);
}

console.log(`\n${report.ok ? "✓" : "✗"} ${report.verdict}`);
console.log(`  ${report.costNote}\n`);
process.exit(report.ok ? 0 : 1);
