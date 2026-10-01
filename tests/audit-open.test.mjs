import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// THE FREE AUDIT MUST ANSWER SOMEBODY WITH NO ACCOUNT.
//
// Six adverts say "no account, no card" in those words, and the five Facebook
// image prompts in docs/FACEBOOK-AD-PROMPTS.md say it again. It is the whole
// offer: a stranger who has never heard of MarketWar OS types their website in
// and gets a real answer. If it ever needs a login, every one of those adverts
// becomes false and the paid traffic behind them is being spent on a lie.
//
// WHY THIS IS A TEST AND NOT A GREP. `verify-ads-doc.mjs` guarded this by
// searching the route for `requireAuth|requireUser|getSession` and failing if it
// found any of them. The route now READS auth when a bearer happens to be
// present — to attribute the run and to decide whether the caller is on a paid
// plan for quota — and continues perfectly well without one:
//
//     if (!(req.headers.get("authorization") || "").startsWith("Bearer "))
//       return { accountId: null, paid: false };
//
// So the grep failed the ads build while the adverts were entirely truthful: a
// check failing for a reason unrelated to what it tests, which is this
// repository's second catalogued defect class. The property is behavioural, so
// it is tested behaviourally — drive the real handler with no credential and see
// whether it refuses.

test("the free audit answers a caller with no account and no card", async () => {
  const { NextRequest } = await import("next/server");
  const route = await import("../src/app/api/audit/route.ts");

  const req = new NextRequest("https://mw.test/api/audit", {
    method: "POST",
    // DELIBERATELY NO authorization header, no cookie, nothing.
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" }),
  });

  const res = await route.POST(req);
  const body = await res.json().catch(() => ({}));
  const text = JSON.stringify(body);

  assert.notEqual(res.status, 401, "the audit must never demand a session");
  assert.notEqual(res.status, 403, "the audit must never demand a session");
  assert.doesNotMatch(text, /sign in|log in|signup|account required|unauthorised|unauthorized/i,
    `the audit asked an anonymous caller for an account: ${text.slice(0, 200)}`);

  // It may well fail to reach example.com from a sandbox, and that is fine —
  // what matters is that whatever it says, it is not "who are you". A refusal
  // about the CRAWL is the route working; a refusal about the CALLER is six
  // adverts becoming false.
  if (!res.ok) {
    assert.match(text, /could not|unreachable|DNS|timed out|private network|network|refused|blocked/i,
      `an anonymous audit failed for a reason that was not about the crawl: ${text.slice(0, 200)}`);
  }
});

// MUTANTS RUN AGAINST THE REAL ROUTE, and which test killed which — because the
// two tests below look redundant and are not:
//
//   1. `callerFor` throws instead of returning the anonymous caller.
//      Killed by test 2 and by `ads:verify`. SURVIVED test 1 — and that is an
//      EQUIVALENT MUTANT, not a gap: `callerFor` is called inside the quota
//      try/catch, whose documented behaviour is to ALLOW when the quota cannot
//      be evaluated, so the throw is swallowed and the anonymous caller still
//      gets their audit. The behaviour test is right to pass; the mutant does
//      not change behaviour.
//   2. POST returns 401 when there is no bearer.
//      Killed by test 1. SURVIVED test 2 — the early return is still in the
//      source, so a source assertion cannot see the gate added above it.
//   3. POST returns 200 with `note: "Sign in to see your findings."`.
//      Killed by test 1's body assertion — a refusal does not have to arrive as
//      a status code to make the adverts false.
//
// So neither test subsumes the other: 2 catches a refactor that removes the
// anonymous path, 1 catches a gate added in front of it.

test("the anonymous path is explicit in the route, not an accident", () => {
  // The behavioural test above proves it today. This names the line that makes
  // it true, so somebody refactoring `callerFor` can see what it is load-bearing
  // for before they tidy the early return away.
  const src = readFileSync("src/app/api/audit/route.ts", "utf8");
  assert.match(src, /if \(!\(req\.headers\.get\("authorization"\) \|\| ""\)\.startsWith\("Bearer "\)\) return \{ accountId: null, paid: false \};/,
    "the audit must handle a caller with no bearer by carrying on, not by refusing");
});
