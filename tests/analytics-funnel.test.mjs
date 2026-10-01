import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// THE FUNNEL, AND THE GUARD THAT SHOULD HAVE EXISTED FIRST.
//
// Two events were being fired from `/audit` — the page every advert points at —
// under names that were not in `MW_EVENTS`. `buildPayload` returns null for an
// unknown name, so both did nothing, in silence, for their entire life. The file
// that defines the list predicted it in writing: "an event invented at a call
// site is one nobody configured a conversion for at the other end, so it
// silently does nothing while looking like it works."
//
// Nothing could have noticed. That is the defect, and the first test below is the
// fix for it; the rest are the funnel itself.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = walk("src");

/**
 * The files that use the ANALYTICS `track`, found by their import.
 *
 * SCOPED BY THE IMPORT ON PURPOSE. `src/app/api/health/live/route.ts` has its own
 * local `track(name, result)` helper for probe results; a grep for `track(` finds
 * it and would fail this test over `track("storage", …)`, which is not an
 * analytics event at all. My own first pass at this check did exactly that in the
 * other direction: a pattern that required a quote straight after `track(` missed
 * `track(cond ? "a" : "b")` and reported two live events as never fired. Both are
 * the same fault — a check answering a question next to the one it was asked.
 */
const ANALYTICS_FILES = FILES.filter((f) => /from "@\/frontend\/analytics"/.test(readFileSync(f, "utf8")))
  .filter((f) => !f.endsWith(join("src", "frontend", "analytics.ts")));

/** Every string literal passed as the event name, ternaries included. */
function namesIn(src) {
  const code = codeOf(src);
  const out = [];
  // Match the whole first argument up to the comma or closing paren, then take
  // every quoted literal out of it — which is what makes the ternary forms work.
  for (const m of code.matchAll(/\btrack\(([^;]*?)\)/g)) {
    const head = m[1].split(/,(?![^{]*\})/)[0];
    for (const lit of head.matchAll(/["']([a-z0-9_]+)["']/g)) out.push(lit[1]);
  }
  return out;
}

test("every event name fired in src/ exists in MW_EVENTS", async () => {
  const { MW_EVENTS, eventByName } = await import("../src/shared/analytics-events.ts");
  assert.ok(ANALYTICS_FILES.length >= 4,
    `only ${ANALYTICS_FILES.length} files import the analytics track — the scan found nothing to check, which passes for the wrong reason`);

  const problems = [];
  let found = 0;
  for (const file of ANALYTICS_FILES) {
    for (const name of namesIn(readFileSync(file, "utf8"))) {
      found++;
      if (!eventByName(name)) problems.push(`${file}: track("${name}") is not in MW_EVENTS, so it is silently dropped`);
    }
  }
  assert.ok(found >= 6, `the scan found only ${found} track() names — it is not seeing the call sites`);
  assert.deepEqual(problems, [], problems.join("\n"));
  assert.ok(MW_EVENTS.length > 10);
});

test("the two events the audit page fires are among them — the ones that were dropped", async () => {
  const { eventByName, metaCall } = await import("../src/shared/analytics-events.ts");
  for (const name of ["audit_report_downloaded", "audit_cta_signup"]) {
    const e = eventByName(name);
    assert.ok(e, `${name} is fired by FreeAudit.tsx and must be declared`);
    // Custom, not standard: `audit_lead` is the page's Lead event and two
    // standard events on one page split the conversion signal.
    assert.equal(metaCall(e).method, "trackCustom", `${name} must not compete with audit_lead as a standard event`);
  }
  // And the audit page must still be firing them, or declaring them was pointless.
  const audit = codeOf(readFileSync("src/components/FreeAudit.tsx", "utf8"));
  assert.match(audit, /track\("audit_report_downloaded"/);
  assert.match(audit, /track\("audit_cta_signup"\)/);
  assert.match(audit, /track\(withEmail \? "audit_lead" : "audit_started"/,
    "the lead and the start are the two that matter most on the advert destination");
});

// ---------------------------------------------------------------------------
// THE MONEY END. Reported from the wallet, never from the URL.
// ---------------------------------------------------------------------------

const CREDIT = {
  eventId: "evt_1",
  kind: "subscription",
  acu: 980,
  planId: "growth",
  cycle: "monthly",
  amountMinor: 4900,
  currency: "GBP",
  at: "2026-10-01T00:00:00.000Z",
};

test("a confirmed plan payment reports ONE money event, with the money Stripe took", async () => {
  const { conversionsFor } = await import("../src/shared/conversion-report.ts");
  const d = conversionsFor(CREDIT, new Set());
  assert.ok(d);
  assert.equal(d.key, "evt_1", "the de-duplication key is Stripe's own event id");
  assert.equal(d.events.length, 1, "two money events for one payment reports the revenue twice");
  assert.equal(d.events[0].name, "subscribe");
  assert.equal(d.events[0].params.value, 49, "minor units converted, not passed through as 4900");
  assert.equal(d.events[0].params.currency, "GBP");
  assert.equal(d.events[0].params.plan, "growth");
});

test("a top-up reports topup, and a plan payment never reports purchase as well", async () => {
  const { conversionsFor } = await import("../src/shared/conversion-report.ts");
  const top = conversionsFor({ ...CREDIT, eventId: "evt_t", kind: "topup", amountMinor: 2000, acu: 2000, planId: null, cycle: null }, new Set());
  assert.equal(top.events.length, 1);
  assert.equal(top.events[0].name, "topup");
  assert.equal(top.events[0].params.value, 20);

  // The one that would double-count. `purchase`, `subscribe` and `topup` all
  // carry a value and all map onto a Meta standard event.
  for (const kind of ["subscription", "topup"]) {
    const d = conversionsFor({ ...CREDIT, eventId: `e-${kind}`, kind }, new Set());
    assert.ok(!d.events.some((e) => e.name === "purchase"),
      `${kind} must not also report purchase — that is the same money twice`);
  }
});

test("nothing is reported twice, however many times the page is opened", async () => {
  const { conversionsFor } = await import("../src/shared/conversion-report.ts");
  assert.equal(conversionsFor(CREDIT, new Set(["evt_1"])), null, "a refresh must report nothing");
  // Next month's renewal is a different Stripe event and must report.
  const renewal = conversionsFor({ ...CREDIT, eventId: "evt_2" }, new Set(["evt_1"]));
  assert.ok(renewal, "a renewal is a new payment and must be reported");
  assert.equal(renewal.key, "evt_2");
});

test("no amount means no money event — a zero-value sale is worse than none", async () => {
  const { conversionsFor } = await import("../src/shared/conversion-report.ts");
  for (const amountMinor of [undefined, 0, -1, Number.NaN]) {
    assert.equal(conversionsFor({ ...CREDIT, amountMinor }, new Set()), null,
      `amountMinor ${String(amountMinor)} must not produce a conversion`);
  }
  assert.equal(conversionsFor(null, new Set()), null);
  assert.equal(conversionsFor({ ...CREDIT, eventId: "" }, new Set()), null);
});

test("the reporter asks the wallet, and refuses to believe the URL", () => {
  const code = codeOf(readFileSync("src/components/ConversionReporter.tsx", "utf8"));
  assert.match(code, /authedFetch\("\/api\/billing\/wallet"\)/,
    "the confirmation must come from the wallet the webhook credits");
  assert.match(code, /conversionsFor\(last, readReported\(\)\)/);
  // The failure this guards: reading the plan or the amount out of the query
  // string. `?subscribed=growth` is typed by anyone and settles nothing.
  assert.doesNotMatch(code, /searchParams\.get\("subscribed"\)|q\.get\("subscribed"\)/,
    "the plan must not come from the URL");
  assert.doesNotMatch(code, /track\("(purchase|subscribe|topup)"/,
    "the event name is decided by conversionsFor, not hard-coded at the call site");
  // Recorded before fired, or a throwing tag reports the same sale eight times.
  const order = code.indexOf("remember(decision.key)");
  const fire = code.indexOf("for (const e of decision.events)");
  assert.ok(order > 0 && fire > order, "the de-duplication key must be stored before the events fire");
});

test("the landing pages are the ones the server actually redirects to", async () => {
  // FIRST DEFECT CLASS: a value on one side of a boundary that never crosses it.
  // The success_urls live in backend/checkout.ts. If one is renamed and this is
  // not, conversions stop being reported and nothing fails.
  const { returnedFromCheckout } = await import("../src/shared/conversion-report.ts");
  const checkout = readFileSync("src/backend/checkout.ts", "utf8");

  const landings = [...checkout.matchAll(/success_url: `\$\{APP_URL\}([^`]+)`/g)].map((m) => m[1]);
  // Exactly three today. A FOURTH MUST FAIL THIS TEST rather than be silently
  // covered or silently missed: whether a new checkout is MarketWar's own money
  // is a judgement, and a test that quietly guesses is how the wrong answer
  // ships. Grow this list deliberately.
  assert.equal(landings.length, 3, `checkout.ts has ${landings.length} success_urls — decide explicitly whether each one is OUR sale`);

  const recognised = landings.filter((l) => {
    const [path, search] = l.split("?");
    // An interpolated plan id in the query (`subscribed=${...}`) stands in for a
    // real one; the matcher only asks whether the parameter is present.
    return returnedFromCheckout(path, `?${(search || "").replace(/\$\{[^}]+\}/g, "growth")}`);
  });
  assert.deepEqual(
    recognised.sort(),
    ["/dashboard/billing?topup=success", "/dashboard?subscribed=${encodeURIComponent(input.planId)}"].sort(),
    "the plan and the top-up are MarketWar's own money and must be reported",
  );

  // THE THIRD ONE IS SOMEBODY ELSE'S MONEY. `createBrandCheckout` is a MarketWar
  // customer selling to their own buyer, paid into their own Stripe account.
  // Counting it would put their revenue in our Ads Manager and have the bidding
  // chase a ROAS we never earned.
  assert.equal(returnedFromCheckout("/dashboard/revenue", "?paid=1"), false,
    "a customer's own sale is not a MarketWar conversion");

  // And it must NOT fire on an ordinary page, or every anonymous landing-page
  // visitor triggers an authenticated request that 401s.
  assert.equal(returnedFromCheckout("/", ""), false);
  assert.equal(returnedFromCheckout("/audit", "?url=example.com"), false);
  assert.equal(returnedFromCheckout("/dashboard", ""), false, "the dashboard without the marker is just the dashboard");
  assert.equal(returnedFromCheckout("/dashboard/billing", "?topup=cancel"), false, "a cancelled top-up is not a sale");
});

// ---------------------------------------------------------------------------
// THE SERVER SIDE OF IT.
// ---------------------------------------------------------------------------

test("the wallet stamp is written in the same transaction as the credit", () => {
  const wallet = codeOf(readFileSync("src/backend/wallet.ts", "utf8"));
  // Inside the transaction's `next` object, not a second write afterwards: a
  // separate write can fail on its own and leave a credit with no stamp.
  assert.match(wallet, /\.\.\.\(stamp \? \{ lastCredit: stamp \} : \{\}\),\n\s*updatedAt: now,/,
    "lastCredit must be part of the transactional wallet write");
  assert.match(wallet, /const stamp = credit > 0 && reversal === 0 && outcome\.payment/,
    "only a credit-bearing payment is a sale — a refund reported as a Purchase is the worst version of this");
});

test("a refund, a downgrade and a grace period are not sales", async () => {
  const w = await import("../src/backend/wallet.ts");
  const id = `conv-${Date.now()}`;

  // A real payment first, so there is something that could be wrongly overwritten.
  const paid = await w.applyWebhookOutcome(id, {
    eventId: `ev-paid-${id}`, eventType: "invoice.paid", handled: true, action: "allocate_acus",
    planId: "starter", cycle: "monthly", acusAllocated: 380,
    ledgerEntry: { type: "subscription_allocation", direction: "credit", amountAcu: 380, idempotencyKey: `ev-paid-${id}` },
    payment: { amountMinor: 1900, currency: "GBP" }, note: "",
  });
  assert.equal(paid.applied, true, paid.reason);
  assert.equal((await w.getWallet(id)).lastCredit?.amountMinor, 1900);

  // A reversal carries a debit. It must not become a Purchase, and it must not
  // wipe the record of the payment that did happen.
  const back = await w.applyWebhookOutcome(id, {
    eventId: `ev-refund-${id}`, eventType: "charge.refunded", handled: true, action: "reverse_credit",
    ledgerEntry: { type: "acu_reversal", direction: "debit", amountAcu: 100, idempotencyKey: `ev-refund-${id}` },
    payment: { amountMinor: 1900, currency: "GBP" }, note: "",
  });
  assert.equal(back.applied, true, back.reason);
  const after = await w.getWallet(id);
  assert.equal(after.lastCredit?.eventId, `ev-paid-${id}`,
    "a refund must neither report a sale nor erase the one before it");

  // A grace period moves no money at all.
  await w.applyWebhookOutcome(id, {
    eventId: `ev-grace-${id}`, eventType: "invoice.payment_failed", handled: true, action: "grace_period",
    payment: { amountMinor: 1900, currency: "GBP" }, note: "",
  });
  assert.equal((await w.getWallet(id)).lastCredit?.eventId, `ev-paid-${id}`);
});

test("the amount comes from the event, and a subscription start is not stamped twice", async () => {
  const { handleStripeEvent } = await import("../src/backend/stripe-billing.ts");

  // An invoice: this is the payment, and it must carry the money.
  const invoice = handleStripeEvent({
    id: "evt_inv", type: "invoice.paid",
    data: { object: { metadata: { planId: "growth" }, amount_paid: 4900, currency: "gbp" } },
  });
  assert.deepEqual(invoice.payment, { amountMinor: 4900, currency: "GBP" });

  // A DISCOUNT CODE. The list price is £49 and £4.90 arrived; reporting £49
  // would train the bidding on revenue that does not exist.
  const discounted = handleStripeEvent({
    id: "evt_disc", type: "invoice.paid",
    data: { object: { metadata: { planId: "growth" }, amount_paid: 490, currency: "gbp" } },
  });
  assert.equal(discounted.payment.amountMinor, 490, "the money that arrived, never the list price");

  // THE SUBSCRIPTION START. Stripe fires this AND invoice.paid; the session
  // activates the plan and the invoice is the payment. Stamping both reports one
  // subscription as two sales, and the event ids differ so de-duplication cannot
  // save it — which is why the session must carry no payment.
  const session = handleStripeEvent({
    id: "evt_sess", type: "checkout.session.completed",
    data: { object: { mode: "subscription", metadata: { planId: "growth" }, amount_total: 4900, currency: "gbp" } },
  });
  assert.equal(session.action, "renew");
  assert.equal(session.payment, undefined,
    "the subscription session must not carry a payment, or the plan start is reported twice");

  // No amount is absent, never zero.
  const none = handleStripeEvent({
    id: "evt_none", type: "invoice.paid",
    data: { object: { metadata: { planId: "growth" }, currency: "gbp" } },
  });
  assert.equal(none.payment, undefined, "absent must not arrive as 0 — that is a zero-value conversion");
});
