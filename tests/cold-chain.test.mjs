import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE TWO DEFECTS THAT DRIVING THE WHOLE CHAIN FOUND, both on the money path,
// both found BEFORE the owner paid for the keys that would have exposed them.
//
// ONE: THE CHEAPEST PAID SUPPLIER WAS UNREACHABLE ON THE ONLY ROWS IT IS FOR.
// `findCompanyEmail`'s second phase required `findPeople && findEmails` on the
// SAME provider. `leadmagic` has `findEmails` and `findPhones` and no
// `findPeople` — it is a finder, not a directory — so it was skipped, having
// already been asked in phase 1 with no name, which is the one question it
// cannot answer. Measured:
//
//   step leadmagic     emails  cost: 0   <- asked before the name was known
//   step marketwar-web people  cost: 0   <- name found HERE
//   step marketwar-web emails  cost: 0   <- and leadmagic never re-asked
//
// TWO: A BLOCKED RESOLVER WOULD HAVE SUPPRESSED A CUSTOMER'S WHOLE LIST.
// Every lookup returning ENOTFOUND reads as "this domain does not exist", so
// gmail.com and nhs.uk came back removed and marked PERMANENT — which writes a
// suppression row. NXDOMAIN from a healthy resolver is definitive; NXDOMAIN for
// every domain in a batch is a broken resolver.
//
// MUTATION TESTED: 9 mutants, all killed. One near-vacuous attempt of my own is
// recorded: a mutant that changed only the CACHED health value, leaving the
// returned value alone, slipped past a test that looked only at the removals.
// The real one changes `return healthy` and is killed; the test now asserts the
// answer itself, not only its effect.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a named person reaches EVERY email finder, not only one that found them", async () => {
  const { __clearProviders, registerProvider, findCompanyEmail } = await import("../src/backend/enrichment-provider.ts");
  __clearProviders();

  // A free directory that can name a person and sells no addresses — the crawl.
  const asked = [];
  registerProvider({
    id: "free-directory", costAcu: 0, order: 0,
    health: () => ({ id: "free-directory", configured: true, note: "" }),
    async findPeople() { asked.push("people"); return [{ fullName: "Dave Smith", jobTitle: "Director", company: "Quiet Trades Ltd", domain: "quiet-trades.co.uk", sourceUrl: "https://quiet-trades.co.uk/about", fromRegistryOnly: false }]; },
  });
  // A paid finder with NO findPeople — the shape `leadmagic` actually has.
  registerProvider({
    id: "paid-finder", costAcu: 1, order: 1,
    health: () => ({ id: "paid-finder", configured: true, note: "" }),
    async findEmails(input) {
      asked.push(`emails:${input.firstName || "-"}/${input.lastName || "-"}`);
      if (!input.firstName || !input.lastName) return [];   // it cannot answer this
      return [{ value: "dave.smith@quiet-trades.co.uk", provenance: "provider" }];
    },
  });

  const run = await findCompanyEmail({ company: "Quiet Trades Ltd", domain: "quiet-trades.co.uk", maxCostAcu: 8 });
  assert.equal(run.emails[0]?.value, "dave.smith@quiet-trades.co.uk", run.note);
  assert.equal(run.person?.fullName, "Dave Smith");
  // IT WAS ASKED TWICE, and the second time with the name. The first is the
  // cheap company-level question; the second is the one it can answer.
  assert.deepEqual(asked, ["emails:-/-", "people", "emails:Dave/Smith"], asked.join(" | "));
  // CHARGED ONCE, on the call that found something.
  assert.equal(run.costAcu, 1, run.steps.map((s) => `${s.provider}:${s.costAcu}`).join(","));
  assert.equal(run.emailProvider["dave.smith@quiet-trades.co.uk"], "paid-finder",
    "the supplier that actually found it must be the one credited");
  __clearProviders();
});

test("a published address still ends it, so nothing is bought unnecessarily", async () => {
  const { __clearProviders, registerProvider, findCompanyEmail } = await import("../src/backend/enrichment-provider.ts");
  __clearProviders();
  let paidCalls = 0;
  registerProvider({
    id: "free-crawl", costAcu: 0, order: 0,
    health: () => ({ id: "free-crawl", configured: true, note: "" }),
    async findEmails() { return [{ value: "info@acme.co.uk", provenance: "confirmed" }]; },
    async findPeople() { return [{ fullName: "Dave Smith", jobTitle: "Director", company: "Acme", domain: "acme.co.uk", sourceUrl: "x", fromRegistryOnly: false }]; },
  });
  registerProvider({
    id: "paid-finder", costAcu: 1, order: 1,
    health: () => ({ id: "paid-finder", configured: true, note: "" }),
    async findEmails() { paidCalls++; return [{ value: "dave@acme.co.uk", provenance: "provider" }]; },
  });
  const run = await findCompanyEmail({ company: "Acme Ltd", domain: "acme.co.uk", maxCostAcu: 8 });
  assert.equal(run.emails[0]?.provenance, "confirmed");
  assert.equal(paidCalls, 0, "a published address is the best evidence there is — nothing may be bought to improve on it");
  assert.equal(run.costAcu, 0);
  __clearProviders();
});

test("no person found means the paid finder is not asked a second time", async () => {
  // Spending a credit to be told nothing is the waste the waterfall exists to
  // prevent, and "we did not look" must not become "we looked and found nothing".
  const { __clearProviders, registerProvider, findCompanyEmail } = await import("../src/backend/enrichment-provider.ts");
  __clearProviders();
  let named = 0;
  registerProvider({
    id: "free-crawl", costAcu: 0, order: 0,
    health: () => ({ id: "free-crawl", configured: true, note: "" }),
    async findPeople() { return []; },
  });
  registerProvider({
    id: "paid-finder", costAcu: 1, order: 1,
    health: () => ({ id: "paid-finder", configured: true, note: "" }),
    async findEmails(input) { if (input.firstName) named++; return []; },
  });
  const run = await findCompanyEmail({ company: "Nobody Ltd", domain: "nobody.co.uk", maxCostAcu: 8 });
  assert.equal(run.emails.length, 0);
  assert.equal(named, 0, "with nobody identified there is nobody to ask about");
  assert.equal(run.costAcu, 0);
  __clearProviders();
});

test("a budget that cannot cover the paid finder refuses it BY NAME", async () => {
  const { __clearProviders, registerProvider, findCompanyEmail } = await import("../src/backend/enrichment-provider.ts");
  __clearProviders();
  registerProvider({
    id: "free-crawl", costAcu: 0, order: 0,
    health: () => ({ id: "free-crawl", configured: true, note: "" }),
    async findPeople() { return [{ fullName: "Dave Smith", jobTitle: "Director", company: "Q", domain: "q.co.uk", sourceUrl: "x", fromRegistryOnly: false }]; },
  });
  let called = 0;
  registerProvider({
    id: "paid-finder", costAcu: 5, order: 1,
    health: () => ({ id: "paid-finder", configured: true, note: "" }),
    async findEmails() { called++; return [{ value: "d@q.co.uk", provenance: "provider" }]; },
  });
  const run = await findCompanyEmail({ company: "Q Ltd", domain: "q.co.uk", maxCostAcu: 2 });
  assert.equal(called, 0);
  const refusal = run.steps.find((s) => s.provider === "paid-finder" && !s.ran);
  assert.ok(refusal, run.steps.map((s) => `${s.provider}:${s.ran}`).join(","));
  assert.match(refusal.outcome, /past the 2-ACU limit/);
  __clearProviders();
});

test("a dead resolver removes nothing and suppresses nothing", async () => {
  // THE WORST FAILURE AVAILABLE TO A MAILING PLATFORM: a DNS outage that
  // permanently suppresses a live list, and stays suppressed after it recovers.
  const verify = await import("../src/backend/address-verify.ts");
  verify.clearResolverHealth();
  verify.clearMailRouteCache();

  // This container has no DNS, so this IS the measured case rather than a mock.
  // THE HEALTH ANSWER ITSELF, asserted — not only its effect. A mutant that
  // returned `true` unconditionally slipped past a test that only looked at the
  // removals, because the cached value and the returned value are two things.
  const healthy = await verify.resolverHealthy();
  const res = await verify.verifyRecipients(["a@gmail.com", "b@nhs.uk", "c@bbc.co.uk"]);
  assert.equal(typeof healthy, "boolean");
  if (!healthy) {
    assert.ok(res.unknown > 0, "an unhealthy resolver must produce unknowns, not removals");
  }
  if (res.unknown > 0) {
    assert.equal(healthy, false, "unknowns on real domains mean the resolver said so");
    assert.equal(res.removed.length, 0, "nothing may be removed on a resolver that cannot answer for gmail.com");
    assert.equal(res.deliverable.length, 3, "every address is kept");
    assert.match(res.note, /RESOLVER ON THIS HOST IS NOT ANSWERING/);
    assert.match(res.note, /the fault is DNS here, not the list/);
  } else {
    // DNS works here, so the veto cannot be exercised — the real domains answer.
    // Asserted the other way round rather than skipped: these must NOT be removed.
    assert.equal(res.removed.length, 0, "gmail.com, nhs.uk and bbc.co.uk all accept mail");
  }
  verify.clearResolverHealth();
});

test("the veto is asked for only when something came back negative", async () => {
  // One extra lookup on a run that found a dead domain; none at all on a clean
  // run. A sanity check that costs a query per send would be its own problem.
  const code = codeOf(readFileSync("src/backend/address-verify.ts", "utf8"));
  // `fromResolver` IS PART OF IT, and that is the correction: a syntactic
  // refusal (`notadomain` has no dot) is not a DNS verdict, so the resolver's
  // health has no bearing on it. Vetoing those kept addresses that can never
  // work, which an existing §160 test caught.
  assert.match(code, /const anyNegative = \[\.\.\.routes\.values\(\)\]\.some\(\(r\) => r\.certainty === "certain" && !r\.accepts && r\.fromResolver\)/);
  assert.match(code, /const dnsTrustworthy = anyNegative \? await resolverHealthy\(\) : true/);
  // AND THE VETO KEEPS THE ADDRESS, which is the rule the module was built on.
  assert.match(code, /if \(!dnsTrustworthy && route\.fromResolver\) \{ vetoed\+\+; unknown\+\+; deliverable\.push\(a\); continue; \}/);
  // `true` when it cannot tell: this function exists to VETO removals, so a
  // wrong `false` keeps addresses that should have gone and a wrong `true`
  // deletes a live list.
  assert.match(code, /RESOLVER_CONTROLS = \["gmail\.com", "cloudflare\.com", "bbc\.co\.uk"\]/);
});

test("a string that is not a domain is removed even when DNS is dark", async () => {
  // THE CORRECTION TO MY OWN FIX. The first veto was indiscriminate, so with the
  // resolver unreachable it kept `notadomain` — an address that can never work,
  // whose refusal involved no lookup at all. The resolver's health is irrelevant
  // to a fact about the string.
  const verify = await import("../src/backend/address-verify.ts");
  verify.clearResolverHealth();
  verify.clearMailRouteCache();
  const res = await verify.verifyRecipients(["a@localhost", "b@notadomain"]);
  assert.equal(res.removed.length, 2, res.note);
  assert.equal(res.deliverable.length, 0);
  // `domainsChecked` counts domains CONSIDERED, not queries spent — these two
  // never reached the resolver, which is why the veto must not cover them.
  assert.deepEqual(res.removed.map((r) => r.kind), ["no-mail-route", "no-mail-route"]);
  assert.ok(res.removed.every((r) => /is not a domain/.test(r.reason)), res.removed[0]?.reason);
  verify.clearResolverHealth();
});

test("the waterfall's two phases are separate, and the second needs no findPeople", async () => {
  const code = codeOf(readFileSync("src/backend/enrichment-provider.ts", "utf8"));
  // The requirement that made the cheapest supplier unreachable must be gone.
  assert.doesNotMatch(code, /if \(!p\.findPeople \|\| !p\.findEmails \|\| !p\.health\(\)\.configured\) continue;/,
    "requiring both capabilities on one provider is the defect");
  assert.match(code, /if \(!p\.findPeople \|\| !p\.health\(\)\.configured\) continue;/, "phase 2a: who");
  assert.match(code, /if \(person\) \{/, "phase 2b runs only when somebody was identified");
  assert.match(code, /const got = await run\(p, "emails", \(sig\) => p\.findEmails!\(named, sig\)\);/);
});
