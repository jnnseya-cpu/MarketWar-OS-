#!/usr/bin/env node
// PROVE THE HUNTER ADAPTER AGAINST THE REAL API, BEFORE A CREDIT IS SPENT IN ANGER.
//
// WHY THIS SCRIPT EXISTS AND NOT JUST THE ADAPTER. `enrichment-adapters.ts`
// carries a rule this repository wrote for itself and has been right about:
//
//   "A stub that compiles and has never been run against the real API is worse
//    than an absence: it looks like coverage in a code review, it passes a type
//    check, and it fails the first time somebody pays for it — with a mapping
//    nobody verified and error shapes nobody has seen."
//
// The adapter is now written, and it was written against Hunter's documented
// responses — because the environment it was written in cannot reach
// api.hunter.io at all. So the mapping is REASONED, not OBSERVED, and this
// script is what converts one into the other. Until it has been run and passed,
// the adapter is unverified and this file says so out loud.
//
//   HUNTER_API_KEY=xxx node scripts/check-hunter.mjs
//   HUNTER_API_KEY=xxx node scripts/check-hunter.mjs stripe.com
//
// IT PRINTS NO KEY, EVER. It reports the fields the adapter depends on, whether
// each was present, and what the adapter would have produced — so a Hunter
// change to a field name shows up here as a named absence rather than as an
// empty result in production.
//
// IT SPENDS REAL CREDITS: one Domain Search, one Email Finder and one
// verification, about $0.11 at list price. That is the cheapest possible way to
// find out the integration is wrong.

const key = (process.env.HUNTER_API_KEY || "").trim();
if (!key) {
  console.error("HUNTER_API_KEY is not set in this shell.\n  HUNTER_API_KEY=xxx node scripts/check-hunter.mjs");
  process.exit(2);
}
const domain = process.argv[2] || "stripe.com";

const get = async (path, params) => {
  const q = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`https://api.hunter.io/v2/${path}?${q}`, { headers: { Accept: "application/json" } });
  let body = null;
  try { body = await res.json(); } catch { /* handled by the caller */ }
  return { status: res.status, body };
};

// Never print the key, and never print a URL that contains it.
const safe = (s) => String(s).split(key).join("«key»");

let failures = 0;
const field = (label, present, value) => {
  if (!present) failures += 1;
  console.log(`    ${present ? "✓" : "✗ MISSING"}  ${label}${present && value !== undefined ? `  → ${safe(value)}` : ""}`);
};

console.log("\nHunter adapter check");
console.log("────────────────────");

// 0. THE ACCOUNT. Answers "is the key live and does it have credits" before any
//    result is interpreted — an empty balance and a wrong mapping look identical
//    from a lookup that returned nothing.
const acct = await get("account", {});
if (acct.status !== 200) {
  console.error(`\n✗ The key was refused (HTTP ${acct.status}). ${safe(JSON.stringify(acct.body?.errors ?? acct.body ?? {}))}`);
  console.error("  Nothing else was attempted, because every result below would be meaningless.\n");
  process.exit(1);
}
const a = acct.body?.data ?? {};
const req = a.requests ?? {};
console.log(`  plan            : ${safe(a.plan_name ?? "?")}`);
console.log(`  search credits  : ${req.searches?.available ?? "?"} available, ${req.searches?.used ?? "?"} used`);
console.log(`  verify credits  : ${req.verifications?.available ?? "?"} available, ${req.verifications?.used ?? "?"} used`);

// 1. DOMAIN SEARCH — the fields findPeople and findEmails read.
console.log(`\n  domain-search (${domain})`);
const ds = await get("domain-search", { domain, limit: "10" });
if (ds.status !== 200) {
  console.log(`    ✗ HTTP ${ds.status}: ${safe(JSON.stringify(ds.body?.errors ?? {}))}`);
  failures += 1;
} else {
  const d = ds.body?.data ?? {};
  const rows = Array.isArray(d.emails) ? d.emails : [];
  field("data.organization", typeof d.organization === "string", d.organization);
  field("data.pattern", typeof d.pattern === "string" || d.pattern === null, d.pattern);
  field("data.emails is an array", Array.isArray(d.emails), `${rows.length} rows`);
  const r = rows[0] ?? {};
  if (rows.length) {
    field("emails[].value", typeof r.value === "string", r.value);
    field("emails[].first_name", "first_name" in r, r.first_name);
    field("emails[].last_name", "last_name" in r, r.last_name);
    field("emails[].position", "position" in r, r.position);
    field("emails[].sources[].uri", Array.isArray(r.sources) && (r.sources.length === 0 || typeof r.sources[0]?.uri === "string"),
      Array.isArray(r.sources) ? r.sources[0]?.uri : undefined);
    const named = rows.filter((x) => x.first_name || x.last_name).length;
    console.log(`    → the adapter would return ${named} PEOPLE (rows with a name) and ${rows.filter((x) => x.value).length} EMAILS.`);
    if (!named) console.log("      No named rows: findPeople returns [] here, which is correct — a generic mailbox is not a person.");
  } else {
    console.log("    → no rows for this domain. Try another with: node scripts/check-hunter.mjs somedomain.com");
  }
}

// 2. EMAIL FINDER — the narrow, cheaper question the adapter prefers when it has
//    a name. A different endpoint with a different shape, so it is checked
//    separately rather than assumed to match domain-search.
console.log("\n  email-finder (Alexis Ohanian @ reddit.com)");
const ef = await get("email-finder", { domain: "reddit.com", first_name: "Alexis", last_name: "Ohanian" });
if (ef.status !== 200) {
  console.log(`    ✗ HTTP ${ef.status}: ${safe(JSON.stringify(ef.body?.errors ?? {}))}`);
  failures += 1;
} else {
  const d = ef.body?.data ?? {};
  field("data.email", typeof d.email === "string" || d.email === null, d.email);
  field("data.sources", Array.isArray(d.sources), Array.isArray(d.sources) ? `${d.sources.length} sources` : undefined);
  console.log(`    → the adapter would return ${d.email ? "1 email, provenance \"provider\"" : "[]"}.`);
}

// 3. VERIFIER — the reason this provider is worth paying for, and the one place
//    a wrong mapping deletes a real contact.
console.log("\n  email-verifier (patrick@stripe.com)");
const ev = await get("email-verifier", { email: "patrick@stripe.com" });
if (ev.status !== 200) {
  console.log(`    ✗ HTTP ${ev.status}: ${safe(JSON.stringify(ev.body?.errors ?? {}))}`);
  failures += 1;
} else {
  const d = ev.body?.data ?? {};
  field("data.status", typeof d.status === "string", d.status);
  field("data.score", typeof d.score === "number", d.score);
  field("data.accept_all", "accept_all" in d, d.accept_all);
  const known = ["valid", "invalid", "accept_all", "webmail", "disposable", "unknown"];
  if (typeof d.status === "string" && !known.includes(d.status)) {
    console.log(`    ✗ UNKNOWN STATUS "${d.status}" — the adapter maps it to "could not determine", which is safe but loses information.`);
    failures += 1;
  }
  const verdict = d.status === "valid" ? "deliverable: true"
    : d.status === "invalid" ? "deliverable: false, invalid: true"
    : d.accept_all === true || d.status === "accept_all" ? "deliverable: null, catchAll: true"
    : "deliverable: null (an unknown, NOT a rejection)";
  console.log(`    → the adapter would report ${verdict}`);
}

console.log(
  failures === 0
    ? "\n✓ Every field the adapter reads was present and every status was recognised.\n  The mapping is now OBSERVED rather than reasoned. Set HUNTER_API_KEY on the\n  host and the waterfall will use it after the free sources.\n"
    : `\n✗ ${failures} field(s) or status(es) did not match what the adapter expects.\n  Send this output — Hunter has changed a shape and the adapter needs the same change.\n`,
);
process.exit(failures === 0 ? 0 : 1);
