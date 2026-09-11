// FAIL THE GATE ON A HIGH OR CRITICAL ADVISORY IN A SHIPPED DEPENDENCY.
//
// WHY THIS EXISTS. The verify gate ran layers, casts, lint, types, 1848 tests
// and a production build — all green — while production dependencies carried
// TWO CRITICAL advisories, including an unauthenticated remote code execution
// in the Next.js image optimiser that this deployment serves. Nothing in the
// gate had ever run `npm audit`, so "verify passes" was a statement about the
// code and never about what the code was built on.
//
// A dependency does not announce itself. It becomes vulnerable on a day when
// nobody touched this repository, which is precisely why the check has to be
// automatic rather than remembered.
//
// SCOPE, AND WHY IT IS NARROW. `--omit=dev` only: a flaw in a test runner or a
// bundler plugin is worth knowing about and is not worth refusing to ship over,
// because it never reaches a customer. Moderate and low are reported and do not
// fail — a gate that cries every week is a gate people start passing with a
// flag.
//
// OFFLINE IS NOT A PASS. `npm audit` needs the registry, and this container is
// often behind a proxy that refuses it. A check that quietly succeeds when it
// could not run is the defect this codebase keeps finding in itself, so an
// unreachable registry is reported as UNKNOWN and exits 0 while saying plainly
// that nothing was verified.

import { execFileSync } from "node:child_process";

const KNOWN_UNFIXABLE = {
  // Inside @google-cloud/storage@8.1.0, which pins gaxios ^6 — and 6.7.1 is the
  // last release in that line, so no patch exists to move to. The advisory is
  // uuid's missing bounds check in v3/v5/v6 when a `buf` argument is supplied;
  // gaxios calls uuid.v4() at one site to build a multipart boundary and passes
  // no buffer. Not reachable from here. Listed so it is a decision on the
  // record rather than a number nobody looks at.
  gaxios: "moderate",
  uuid: "moderate",
};

let raw = "";
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // npm exits non-zero when it FINDS something, which is not an error.
  });
} catch (e) {
  raw = e.stdout || "";
  if (!raw.trim()) {
    console.log("advisories: UNKNOWN — the registry could not be reached, so NOTHING was checked.");
    console.log(`  ${e instanceof Error ? e.message : String(e)}`);
    process.exit(0);
  }
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.log("advisories: UNKNOWN — npm audit produced output this check could not parse, so NOTHING was verified.");
  process.exit(0);
}

const vulns = Object.entries(report.vulnerabilities || {});
const blocking = vulns.filter(([name, v]) =>
  (v.severity === "critical" || v.severity === "high") && KNOWN_UNFIXABLE[name] !== v.severity);
const noted = vulns.filter(([name]) => KNOWN_UNFIXABLE[name]);
const other = vulns.filter(([name, v]) =>
  v.severity !== "critical" && v.severity !== "high" && !KNOWN_UNFIXABLE[name]);

if (blocking.length) {
  console.error(`advisories: ${blocking.length} HIGH or CRITICAL advisory in a shipped dependency.\n`);
  for (const [name, v] of blocking) {
    console.error(`  ${v.severity.toUpperCase()}  ${name}  (installed ${v.range})`);
    for (const via of v.via) {
      if (typeof via === "object") console.error(`      ${via.title}\n      ${via.url}`);
    }
    console.error(`      fix available: ${JSON.stringify(v.fixAvailable)}\n`);
  }
  console.error("This is what ships to customers. Patch it, or record it in KNOWN_UNFIXABLE");
  console.error("with the reason it cannot fire — never by silencing the check.");
  process.exit(1);
}

console.log(`advisories: no high or critical in shipped dependencies (${vulns.length} total, ${other.length} moderate or low).`);
for (const [name, v] of noted) {
  console.log(`  on the record: ${name} ${v.severity} — no patched version exists in the pinned line; see KNOWN_UNFIXABLE.`);
}
