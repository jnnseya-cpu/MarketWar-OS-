import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listHealth, reasonFor, sendSeries } from "../src/shared/list-health.ts";

// STRIP COMMENTS BEFORE ASSERTING ON SOURCE. These tests describe, in their own
// comments and in the code's, exactly the strings they forbid — and the first
// run of the last test failed on a JSX comment of mine quoting "Projected inbox
// rate". Eight tests in this repository have now failed on their own prose; the
// shared `codeOf` in features.test.mjs exists for it, and this is its twin.
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// WHAT THESE TESTS ARE FOR.
//
// The module they cover replaced one that computed a mailing list's composition
// from an FNV-1a hash of the brand's NAME and printed the result as "Projected
// inbox rate 96.8%". The tests that existed for it asserted the response was
// well-formed and labelled an estimate — which it was, and which said nothing
// about whether the numbers meant anything. So these assert the one property
// that matters: every figure is a count of the addresses handed in.

const v = (email, checks = {}) => ({
  email,
  checks: { syntax: true, disposable: false, role: false, suppressed: false, ...checks },
});

test("every count is a count of the addresses handed in", () => {
  const h = listHealth([
    v("a@ok.com"), v("b@ok.com"), v("c@ok.com"),
    v("bad", { syntax: false }),
    v("x@mailinator.com", { disposable: true }),
    v("info@ok.com", { role: true }),
  ]);
  assert.equal(h.total, 6);
  assert.equal(h.sendable, 3);
  assert.equal(h.refused, 3);
  assert.equal(h.healthPct, 50);
  assert.deepEqual(h.refusedBy, { invalid: 1, disposable: 1, role: 1 });
  // The composition must add up to the list. A donut whose slices do not sum to
  // the total is a donut somebody read a share off.
  assert.equal(h.composition.reduce((s, c) => s + c.count, 0), 6);
});

test("the brand's NAME cannot reach the arithmetic — there is nowhere to put it", () => {
  // The defining property of the replacement. The old engine's whole output was
  // a function of a string; this one has no string input at all, so the same
  // list cannot produce two different answers.
  const list = [v("a@ok.com"), v("info@ok.com", { role: true })];
  assert.deepEqual(listHealth(list), listHealth(list));
  // There is no name to pass. The old engine's signature was
  // `emailPosture(business, listSize, days)` and `business` was the seed for
  // every ratio it returned; nothing in this module takes a brand at all.
  const src = codeOf(readFileSync("src/shared/list-health.ts", "utf8"));
  assert.doesNotMatch(src, /\bbusiness\b|\bbrandName\b/,
    "list health must not accept a brand's name — that is what was hashed into the fabricated figures");
});

test("an empty list scores NULL, not zero and not a hundred", () => {
  const h = listHealth([]);
  assert.equal(h.healthPct, null);
  assert.equal(h.total, 0);
  assert.match(h.verdict, /nothing to score/);
  // Same rule the placement report follows: no sample, no share.
  assert.doesNotMatch(h.verdict, /0%|100%/);
});

test("CONSENT IS APPLIED, and applied FIRST — the send applies it first", () => {
  // Found by driving the module harness, whose vault holds one contact with
  // `consent: false`. Without this the panel reported 3 of 4 mailable while the
  // send button underneath it offered 2 — putting the headline and the send back
  // out of step, which is the exact class of defect this whole replacement is
  // fixing. A number that disagrees with the button is not better for being real.
  const h = listHealth([
    v("yes@ok.com"),
    v("no@ok.com", {}),
    v("also@ok.com"),
  ].map((x, i) => (i === 1 ? { ...x, consented: false } : x)));
  assert.equal(h.sendable, 2);
  assert.equal(h.refusedBy.no_consent, 1);

  // Absent means consented, exactly as the preview's `consent !== false` reads —
  // a contact imported without the field must not be dropped.
  assert.equal(listHealth([v("a@ok.com")]).sendable, 1);
  assert.equal(listHealth([{ ...v("a@ok.com"), consented: true }]).sendable, 1);

  // FIRST. A non-consented disposable address is reported as lacking consent,
  // because that is the reason the send refuses it — classifying it as
  // "disposable" would send somebody to clean a list that has a consent problem.
  assert.equal(reasonFor({ ...v("x@mailinator.com", { disposable: true }), consented: false }, new Set()), "no_consent");

  // AND BEFORE THE SYNTAX CHECK TOO. The case above does not prove the ordering:
  // with consent moved below `syntax`, a valid-but-unconsented address still
  // comes back "no_consent", so the mutation survived. Only an address that
  // fails BOTH separates the two orders — and an unconsented contact whose
  // address is also malformed must be reported as a consent problem, because
  // cleaning the syntax would still not make them mailable.
  assert.equal(reasonFor({ ...v("not-an-address", { syntax: false }), consented: false }, new Set()), "no_consent");
});

test("the REAL suppression ledger is applied, not just the in-process flag", () => {
  // `validateAddress` checks an in-PROCESS Set; the durable ledger is in
  // Firestore and is passed in. An address suppressed there must be refused, or
  // list health reports somebody as mailable whom the send will refuse — the
  // preview/send disagreement §116 fixed once already.
  const h = listHealth([v("a@ok.com"), v("gone@ok.com")], new Set(["gone@ok.com"]));
  assert.equal(h.sendable, 1);
  assert.equal(h.refusedBy.suppressed, 1);
});

test("suppression matching is case-insensitive and trimmed, as the ledger stores it", () => {
  const h = listHealth([v("  Gone@OK.com  ")], new Set(["gone@ok.com"]));
  assert.equal(h.refusedBy.suppressed, 1);
  assert.equal(h.sendable, 0);
});

test("an address failing two checks is counted ONCE, in validateAddress's own precedence", () => {
  // Counted twice, the slices stop summing to the list. Counted under the wrong
  // reason, the donut and the send disagree about why somebody was dropped.
  assert.equal(reasonFor(v("info@mailinator.com", { disposable: true, role: true }), new Set()), "disposable");
  assert.equal(reasonFor(v("nope", { syntax: false, disposable: true }), new Set()), "invalid");
  assert.equal(reasonFor(v("info@ok.com", { role: true }), new Set(["info@ok.com"])), "suppressed");
  assert.equal(reasonFor(v("fine@ok.com"), new Set()), null);

  const h = listHealth([v("info@mailinator.com", { disposable: true, role: true })]);
  assert.equal(h.refused, 1);
  assert.equal(h.composition.reduce((s, c) => s + c.count, 0), 1);
});

test("a reason with nobody in it is absent, not a zero slice", () => {
  const h = listHealth([v("a@ok.com"), v("bad", { syntax: false })]);
  assert.deepEqual(Object.keys(h.refusedBy), ["invalid"]);
  assert.equal(h.composition.some((c) => c.count === 0), false);
});

// ---------------------------------------------------------------------------
// THE SERIES. It replaced `peakSend * weekdayWeight[dow] * jitter`.
// ---------------------------------------------------------------------------

test("the series counts real events into real days", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const s = sendSeries([
    { type: "sent", at: "2026-09-15T09:00:00Z" },
    { type: "sent", at: "2026-09-15T10:00:00Z" },
    { type: "sent", at: "2026-09-14T10:00:00Z" },
    { type: "bounce", at: "2026-09-14T11:00:00Z" },
    // A COMPLAINT IS A FAILURE TOO, and counting only bounces survived a
    // mutation: somebody marking the mail as spam is the single worst outcome a
    // send can have — Gmail's threshold for it is three times tighter than for
    // bounces — and a chart that showed a clean day through a complaint would
    // hide exactly the thing the warm-up governor exists to react to.
    { type: "complaint", at: "2026-09-14T11:10:00Z" },
    { type: "open", at: "2026-09-14T11:30:00Z" },
  ], 14, now);
  assert.equal(s.days.length, 14);
  assert.equal(s.empty, false);
  const today = s.days[s.days.length - 1];
  const yesterday = s.days[s.days.length - 2];
  assert.equal(today.sent, 2);
  assert.equal(yesterday.sent, 1);
  assert.equal(yesterday.failed, 2, "a bounce AND a complaint are both failures");
  assert.equal(today.failed, 0);
  // An open is neither a send nor a failure and must not inflate either.
  assert.equal(s.days.reduce((t, d) => t + d.sent + d.failed, 0), 5);
});

test("nothing sent means EMPTY — never a confident fortnight of traffic", () => {
  const s = sendSeries([], 14, new Date("2026-09-15T12:00:00Z"));
  assert.equal(s.empty, true);
  assert.equal(s.days.every((d) => d.sent === 0 && d.failed === 0), true);
  assert.match(s.note, /no line to draw/);
  // And it must not CLAIM to be a forecast. The chart it replaced was captioned
  // "14-day projection" while being a hash of a company's name. Disclaiming one
  // ("not a forecast") is the opposite of claiming one, so the assertion looks
  // for the affirmative form — the first version banned the word outright and
  // failed on the sentence saying it is not one.
  assert.doesNotMatch(s.note, /\b(is|are)\s+(a\s+)?(projection|forecast|estimate)\b/i);
  assert.doesNotMatch(s.note, /\bprojected\b/i);
  assert.match(s.note, /send ledger/);
});

test("events outside the window are not folded into the edges", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const s = sendSeries([
    { type: "sent", at: "2026-01-01T09:00:00Z" },
    { type: "sent", at: "2099-01-01T09:00:00Z" },
    { type: "sent", at: "not a date" },
  ], 7, now);
  assert.equal(s.empty, true, "three events, none of them in the last 7 days");
});

// ---------------------------------------------------------------------------
// AND THE FABRICATION CANNOT COME BACK.
// ---------------------------------------------------------------------------

test("no headline email figure is derived from a hash, a seed or a random number", () => {
  // THE GUARD THE OLD ENGINE NEEDED AND DID NOT HAVE. `demo.ts` was stripped of
  // invented fixtures and a test holds that boundary — and this engine walked
  // straight past it, because it was not `demo.ts` and it generated its
  // fabrications instead of storing them. A boundary that names one file only
  // guards one file.
  for (const f of ["src/backend/email-metrics.ts", "src/shared/list-health.ts"]) {
    // Comments explain the thing that was removed; code must not do it.
    const code = codeOf(readFileSync(f, "utf8"));
    assert.doesNotMatch(code, /Math\.random/, `${f} must not invent a figure`);
    assert.doesNotMatch(code, /16777619|2166136261|2654435761/, `${f} must not carry a hash constant`);
    assert.doesNotMatch(code, /jitter|weekdayWeight|peakSend|DEFAULT_LIST_SIZE/, `${f} must not shape a curve`);
    assert.doesNotMatch(code, /projectedInboxRate|projectedSpamRate|projectedBounceRate|projectedComplaintRate/,
      `${f} must not offer a projected rate — nothing that reads a contact list can compute one`);
  }
});

test("the Email Centre no longer promises zero bounces or unlimited capacity", () => {
  // Both were on the live page: a headline reading "Zero bounces" above a card
  // targeting "< 0.5%", and "Capacity is unlimited" above a panel reading
  // "warm-up day 1 · today's safe limit 50 emails".
  const code = codeOf(readFileSync("src/app/dashboard/email/page.tsx", "utf8"));
  assert.doesNotMatch(code, /Zero bounces/i);
  assert.doesNotMatch(code, /Capacity is unlimited/i);
  assert.doesNotMatch(code, /Projected inbox rate/i);
});
