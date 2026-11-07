import test from "node:test";
import assert from "node:assert/strict";

// ONE MOVEMENT OF MONEY, ONE REVERSAL.
//
// WHERE THIS CAME FROM. The owner selected all 238 Stripe event types on the
// webhook endpoint and Stripe reported it as impacted. Answering "which of
// these must be kept" meant reading what the dispatcher actually acts on — and
// the answer exposed two defects that only show up once more than one event
// about the same money is subscribed, which is exactly what selecting
// everything does:
//
//   1. A DISPUTE REVERSED THE ACUs TWICE. `charge.dispute.created` and
//      `charge.dispute.funds_withdrawn` are two events, with two event ids,
//      carrying the same amount for the same dispute. Idempotency was keyed on
//      the event id, which cannot see that, so both applied: £25 disputed took
//      5,000 ACUs back.
//
//   2. TWO PARTIAL REFUNDS REVERSED MORE THAN WAS REFUNDED. The object on
//      `charge.refunded` is the CHARGE, and `amount_refunded` is CUMULATIVE.
//      Two £10 refunds on a £30 charge arrive as 1000 then 2000, so reversing
//      each took £30 of ACUs back for £20 returned.
//
// Both are the same shape, and it is this repository's oldest: a value that
// exists on one side of a boundary — the identity of the money that moved —
// and never gets carried to the other.
//
// The fix does not depend on which boxes are ticked in a dashboard, because
// that selection is not ours to control.

const sb = await import("../src/backend/stripe-billing.ts");
const w = await import("../src/backend/wallet.ts");

const ev = (id, type, object) => ({ id, type, data: { object } });

test("A DISPUTE REVERSES THE ACUs ONCE, even with both of its events subscribed", async () => {
  w.__resetWallets?.();
  const org = `disp_${Date.now().toString(36)}`;

  // Buy 5,000 ACUs so there is something to take back.
  const bought = await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_buy", "checkout.session.completed", {
    metadata: { orgId: org, marketwar_topup: "true", marketwar_acus: "5000" },
    amount_total: 5000, currency: "gbp",
  })));
  assert.equal(bought.applied, true, bought.reason);
  const start = (await w.getWallet(org)).balanceAcu;
  assert.ok(start >= 5000, `expected the top-up to land, balance is ${start}`);

  // THE DISPUTE, ARRIVING AS BOTH EVENTS. This is what an endpoint subscribed
  // to everything receives, in this order.
  const dispute = { id: "du_abc123", charge: "ch_abc123", amount: 2500, currency: "gbp" };
  const opened = sb.handleStripeEvent(ev("evt_open", "charge.dispute.created", dispute));
  assert.equal(opened.handled, false, "a dispute being opened is a notification, not a movement of money");

  const withdrawn = sb.handleStripeEvent(ev("evt_withdrawn", "charge.dispute.funds_withdrawn", dispute));
  assert.equal(withdrawn.action, "reverse_credit");
  const first = await w.applyWebhookOutcome(org, withdrawn);
  assert.equal(first.applied, true, first.reason);
  const afterOne = (await w.getWallet(org)).balanceAcu;
  assert.equal(afterOne, start - 2500, "the reversal took the disputed amount");

  // AND NOW THE SAME MOVEMENT AGAIN, under a different event id — which is what
  // used to double-reverse. Stripe also redelivers, and a redelivery of the one
  // event has always been safe; this is the case that was not.
  const again = await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_withdrawn_retry", "charge.dispute.funds_withdrawn", dispute)));
  assert.equal(again.applied, false, "the same dispute was applied twice");
  assert.match(again.reason, /already been accounted for|already processed/i, again.reason);
  assert.equal((await w.getWallet(org)).balanceAcu, start - 2500, "the balance moved a second time for one dispute");
});

test("AND IF WE WIN IT, THE ACUs COME BACK", async () => {
  w.__resetWallets?.();
  const org = `won_${Date.now().toString(36)}`;
  await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_buy2", "checkout.session.completed", {
    metadata: { orgId: org, marketwar_topup: "true", marketwar_acus: "5000" },
    amount_total: 5000, currency: "gbp",
  })));
  const start = (await w.getWallet(org)).balanceAcu;

  const dispute = { id: "du_won1", charge: "ch_won1", amount: 2500, currency: "gbp" };
  await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_w", "charge.dispute.funds_withdrawn", dispute)));
  assert.equal((await w.getWallet(org)).balanceAcu, start - 2500);

  // Without this the reversal was permanent whatever the outcome: a customer
  // who lost their own dispute was still short the ACUs we clawed back.
  const back = await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_r", "charge.dispute.funds_reinstated", dispute)));
  assert.equal(back.applied, true, back.reason);
  assert.equal((await w.getWallet(org)).balanceAcu, start, "a won dispute must restore exactly what it took");

  // And a reinstatement is NOT a sale. A won dispute reported as a Purchase
  // teaches the ad platform to bid for customers who charge back.
  assert.equal((await w.getWallet(org)).lastCredit?.eventId, "evt_buy2", "the reinstatement was stamped as the last sale");

  // Nor does it apply twice.
  const twice = await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_r2", "charge.dispute.funds_reinstated", dispute)));
  assert.equal(twice.applied, false, twice.reason);
  assert.equal((await w.getWallet(org)).balanceAcu, start);
});

test("TWO PARTIAL REFUNDS TAKE BACK EXACTLY WHAT WENT HOME", async () => {
  w.__resetWallets?.();
  const org = `ref_${Date.now().toString(36)}`;
  await w.applyWebhookOutcome(org, sb.handleStripeEvent(ev("evt_buy3", "checkout.session.completed", {
    metadata: { orgId: org, marketwar_topup: "true", marketwar_acus: "3000" },
    amount_total: 3000, currency: "gbp",
  })));
  const start = (await w.getWallet(org)).balanceAcu;

  // £10 of a £30 charge, then another £10. Each refund has its OWN id and its
  // OWN amount — which is the delta, and is why the trigger is refund.created.
  for (const r of [{ id: "re_1", charge: "ch_part", amount: 1000 }, { id: "re_2", charge: "ch_part", amount: 1000 }]) {
    const out = sb.handleStripeEvent(ev(`evt_${r.id}`, "refund.created", r));
    assert.equal(out.action, "reverse_credit");
    assert.equal(out.ledgerEntry.amountAcu, 1000, "a refund must reverse its own amount, not a running total");
    const applied = await w.applyWebhookOutcome(org, out);
    assert.equal(applied.applied, true, applied.reason);
  }
  assert.equal((await w.getWallet(org)).balanceAcu, start - 2000, "£20 refunded must take back 2,000 ACUs, not 3,000");

  // THE EVENT THAT CARRIES THE RUNNING TOTAL IS NOT ACTIONED, and says why.
  const cumulative = sb.handleStripeEvent(ev("evt_charge_refunded", "charge.refunded", {
    id: "ch_part", amount: 3000, amount_refunded: 2000,
  }));
  assert.equal(cumulative.handled, false);
  assert.match(cumulative.note, /CUMULATIVE/i, cumulative.note);
  assert.equal((await w.getWallet(org)).balanceAcu, start - 2000, "the charge event moved the balance");
});

test("two refunds of the same amount on the same charge are two reversals, not one", async () => {
  // THE OTHER DIRECTION, AND THE REASON THE KEY IS THE REFUND RATHER THAN THE
  // CHARGE. Deduping on the charge would have been the easy fix and would have
  // silently swallowed the second genuine refund.
  const a = sb.handleStripeEvent(ev("evt_a", "refund.created", { id: "re_x", charge: "ch_same", amount: 500 }));
  const b = sb.handleStripeEvent(ev("evt_b", "refund.created", { id: "re_y", charge: "ch_same", amount: 500 }));
  assert.notEqual(a.dedupeKey, b.dedupeKey, "two different refunds share a key, so one of them would be dropped");
  assert.ok(a.dedupeKey.includes("re_x") && b.dedupeKey.includes("re_y"));
});

test("THE DEDUPE KEY IS SAFE TO USE AS A DOCUMENT ID", () => {
  // It becomes the id of a document in the idempotency collection, so a
  // hostile or malformed payload must not be able to write outside its own
  // document — which a slash in an id would do.
  for (const bad of ["../../etc/passwd", "a/b/c", "..", "", "x".repeat(400), "du_ok", 42, null, { id: 1 }]) {
    const out = sb.handleStripeEvent(ev("evt_bad", "refund.created", { id: bad, amount: 100 }));
    assert.equal(out.action, "reverse_credit", `a refund with id ${JSON.stringify(bad)} must still reverse`);
    const key = out.dedupeKey || "";
    assert.ok(!key.includes("/"), `the key contains a path separator: ${key}`);
    assert.ok(key !== "." && key !== "..", `the key is a path segment: ${key}`);
    assert.ok(key.length <= 140, `the key is ${key.length} characters`);
  }

  // With nothing readable to key on, it falls back to the event id — which is
  // the behaviour this replaced, and is still correct for a redelivery.
  const noId = sb.handleStripeEvent(ev("evt_noid", "refund.created", { amount: 100 }));
  assert.equal(noId.action, "reverse_credit");
  assert.ok(!noId.dedupeKey, "with no movement id, the event id must be the key");
});

test("the charge falls back to keying on the charge when a refund has no id of its own", () => {
  const out = sb.handleStripeEvent(ev("evt_c", "refund.created", { charge: "ch_only", amount: 700 }));
  assert.equal(out.action, "reverse_credit");
  assert.ok(out.dedupeKey?.includes("ch_only"), `expected the charge in the key, got ${out.dedupeKey}`);
});

test("A REDELIVERY OF AN ORDINARY PAYMENT IS STILL DEDUPED ON THE EVENT ID", async () => {
  // The change must not weaken what already worked. A payment has no movement
  // id of its own, so the event id remains the key — and Stripe redelivering a
  // paid invoice must still credit exactly once.
  w.__resetWallets?.();
  const org = `pay_${Date.now().toString(36)}`;
  const paid = sb.handleStripeEvent(ev("evt_once", "invoice.paid", {
    metadata: { orgId: org, planId: "starter" }, amount_paid: 1900, currency: "gbp",
  }));
  assert.ok(!paid.dedupeKey, "a payment must not invent a movement key");
  const first = await w.applyWebhookOutcome(org, paid);
  assert.equal(first.applied, true, first.reason);
  const balance = (await w.getWallet(org)).balanceAcu;
  const second = await w.applyWebhookOutcome(org, paid);
  assert.equal(second.applied, false, "a redelivered payment credited twice");
  assert.equal((await w.getWallet(org)).balanceAcu, balance);
});

test("THE LIST TO TICK IS EXACTLY TEN, and selecting everything buys nothing", () => {
  // The owner's question: 238 events are selected and the endpoint is impacted.
  assert.equal(sb.SUBSCRIBE_EVENTS.length, 10, `the subscribe list is ${sb.SUBSCRIBE_EVENTS.length} events`);
  assert.equal(new Set(sb.SUBSCRIBE_EVENTS).size, 10, "the subscribe list repeats an event");

  // Every one of them either moves money, changes a plan, or attributes a
  // customer's own sale. Nothing else is on it.
  for (const type of sb.SUBSCRIBE_EVENTS) {
    const handled = sb.HANDLED_EVENTS.includes(type);
    const revenue = sb.brandRevenueFromEvent(ev("e", type, { metadata: { marketwar_brand_id: "b1" }, amount_total: 100 }));
    assert.ok(handled || revenue, `${type} is on the subscribe list but neither the dispatcher nor revenue attribution reads it`);
  }

  // And an event nobody asked for is acknowledged rather than refused, so a
  // wider selection costs delivery volume and nothing else.
  for (const noise of ["issuing_card.created", "terminal.reader.action_failed", "climate.order.delivered", "invoice.upcoming", "customer.updated", "charge.updated"]) {
    const out = sb.handleStripeEvent(ev("e", noise, {}));
    assert.equal(out.handled, false, `${noise} is being actioned`);
    assert.equal(out.action, "ignored");
  }
});
