import { NextRequest, NextResponse } from "next/server";
import {
  verifyStripeSignature, handleStripeEvent, brandRevenueFromEvent, demoStripe, webhookEndpointUrl,
  HANDLED_EVENTS, SUBSCRIBE_EVENTS, type StripeEventLike,
} from "@/backend/stripe-billing";
import { recordEvent } from "@/backend/ledger";
import { applyWebhookOutcome } from "@/backend/wallet";
import { commissionForPayment, type CommissionOutcome } from "@/backend/marketwar-commission";
import { recordVerifiedDelivery } from "@/backend/webhook-receipt";
import { sendCapiConversion } from "@/backend/meta-capi";
import { getWallet } from "@/backend/wallet";
import { adminAuth, adminConfigured } from "@/backend/firebase-admin";
import { clickIdsFromMetadata } from "@/shared/click-attribution";
import { withStoreDeadline } from "@/shared/store-failure";

// Locate the org whose wallet a payment credits. MarketWar-created checkouts stamp
// the id three ways (client_reference_id + metadata.orgId + metadata.marketwar_org_id)
// so both the initial session event and every recurring invoice can find it.
function orgIdFromEvent(event: StripeEventLike): string {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    obj.client_reference_id,
    meta.orgId,
    meta.marketwar_org_id,
    // invoice.paid nests subscription metadata under lines/subscription_details.
    ((obj.subscription_details as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined)?.orgId,
    ((obj.subscription_details as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined)?.marketwar_org_id,
  ];
  for (const c of candidates) { if (typeof c === "string" && c.trim()) return c.trim(); }
  return "";
}

/**
 * When the money actually moved, according to Stripe.
 *
 * `status_transitions.paid_at` on an invoice, else the object's `created`, else
 * the event's `created`. All are Unix seconds. Falls back to now only when the
 * event carries no timestamp at all, which no real Stripe event does.
 */
function paidAtFromEvent(event: StripeEventLike): string {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  const st = obj.status_transitions as Record<string, unknown> | undefined;
  const candidates = [st?.paid_at, obj.created, (event as { created?: unknown }).created];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return new Date(c * 1000).toISOString();
  }
  return new Date().toISOString();
}

// Stripe webhook endpoint — https://marketwaros.com/api/webhooks/stripe
// Configure this exact URL in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
// Signature is verified with Node crypto (no `stripe` package required); events
// map to ACU-ledger + subscription outcomes. Idempotent by event id. In demo
// (no secret) the signature is not enforced — never run production that way.
//
// Runs on the Node runtime so we can read the raw body for signature checks.
export const runtime = "nodejs";

// AN EXPLICIT CEILING, BECAUSE THE INVISIBLE ONE WAS KILLING THIS ROUTE.
//
// Stripe reported 35 consecutive deliveries with "other errors" — its category
// for an exchange that produced NO HTTP STATUS AT ALL. A route that answers 500
// is retried; a route that answers nothing counts toward having the endpoint
// disabled, which Stripe scheduled for 26 November 2026.
//
// Every other heavy route here states its own `maxDuration` (the agent route
// 120, the trend cron 300). This one never did, so it ran under the platform's
// default — and below it this handler awaited a Firestore transaction, a
// commission write, a wallet read, a Firebase Auth lookup, an outbound call to
// Meta and a ledger write, ALL BEFORE REPLYING. On a cold connection that is
// comfortably past a short default, and the function is killed mid-flight.
//
// §155 is this platform's own note on the same failure, in a different file:
// "a try/catch bounds what happens when a call FAILS, never how long it takes
// to fail — the route is killed first, so Stripe gets no answer at all." That
// fix bounded `webhook-receipt.ts` and stopped there. Everything else on this
// path stayed unbounded.
//
// The ceiling is deliberately well above the internal budget below: the budget
// is what produces an honest 500, and it can only do that if the invocation
// outlives it.
export const maxDuration = 30;

// WHAT THE CALLER WAITS, per step. Chosen to match the measured figures already
// recorded in `webhook-receipt.ts` — a cold Firestore write ~2.5s, the same
// write against an unreachable store >75,000ms.
//
// The money path gets a real ceiling and treats a timeout as RETRIABLE: Stripe
// redelivers for three days and every write on it is idempotent, so a 500 costs
// nothing and loses nothing. The best-effort tail gets a small one and is simply
// abandoned, because none of it can fail a payment that already landed.
const WALLET_DEADLINE_MS = 6_000;
const COMMISSION_DEADLINE_MS = 6_000;
/** The whole conversion/attribution tail — three network calls that must never delay an ack. */
const TAIL_DEADLINE_MS = 2_500;
/**
 * Past this, the tail is skipped outright rather than started.
 *
 * A payment whose money already persisted is a payment Stripe must be told
 * about. Spending another second of a dying invocation on a conversion report
 * is how the acknowledgement itself gets lost.
 */
const ACK_TARGET_MS = 9_000;

export async function POST(req: NextRequest) {
  // ANCHORED AT ARRIVAL. A budget measured from anywhere later is a budget that
  // ignores the work already done, which is the fiction that produces a killed
  // invocation instead of an answer.
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  // Raw body is required for signature verification — read text, not json.
  const raw = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const nowSec = Math.floor(Date.now() / 1000);

  // Fail CLOSED in production if the signing secret is missing: without it the
  // verifier returns demo-valid, and an unauthenticated POST could persist
  // arbitrary attributed revenue to any brand. Never accept unsigned in prod.
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json({ error: "Webhook signing secret not configured — refusing unsigned event." }, { status: 500 });
  }

  const verdict = verifyStripeSignature(raw, sig, secret, 300, nowSec);
  if (!verdict.valid) {
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  let event: StripeEventLike;
  try { event = JSON.parse(raw) as StripeEventLike; } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Malformed Stripe event (missing id/type)" }, { status: 400 });
  }

  // A DELIVERY VERIFIED, AND THAT IS THE ONLY PROOF THE SECRET IS THE RIGHT ONE.
  //
  // This account has SEVEN webhook endpoints and each has its own signing
  // secret, so a value that is present, well-formed and belongs to this account
  // can still fail every delivery. Stripe never returns a signing secret on a
  // list, only on create, so nothing but an arriving event can settle it — and
  // until this line existed, the go-live report called the money path fine while
  // 246 events landed nowhere.
  //
  // RECORDED HERE rather than beside the wallet write: an event that verifies
  // and needs no wallet change is still proof the secret is right, and hanging
  // the proof off the credit would leave a working webhook reading as unproven.
  // Awaited but never allowed to fail the response — the module swallows its own
  // errors, because a bookkeeping write that throws would make Stripe retry a
  // delivery we have already accepted.
  await recordVerifiedDelivery(event.type);

  // Compute the outcome, then PERSIST it: credit the org's ACU wallet + activate
  // its plan. applyWebhookOutcome is idempotent by event.id (records the id in the
  // same transaction as the credit), so a redelivered event never double-credits.
  const outcome = handleStripeEvent(event);
  let walletApplied: { applied: boolean; reason: string; creditedAcu?: number; planId?: string } | null = null;
  if (outcome.handled) {
    // A CREDIT THAT DID NOT PERSIST MUST NOT BE ACKNOWLEDGED.
    //
    // This used to swallow everything and always answer 200, on the reasoning
    // that "Stripe would retry" — but a 200 is precisely the instruction NOT to
    // retry. So a wallet write that failed was reported to Stripe as delivered,
    // to the log as `applied: false`, and to the customer as nothing at all.
    // Where the failure is the store's rather than the event's, the right answer
    // is 500: Stripe redelivers for three days and the credit lands by itself
    // once the store is reachable. Idempotency by event id makes that safe.
    try {
      const orgId = orgIdFromEvent(event);
      // BOUNDED. A hanging transaction used to take the whole invocation with
      // it, and Stripe was told nothing at all — which is worse than any error,
      // because nothing is what gets an endpoint disabled.
      const applied = await withStoreDeadline("the wallet credit", WALLET_DEADLINE_MS, () =>
        applyWebhookOutcome(orgId, outcome));
      if (!applied.ok) {
        return NextResponse.json({
          received: false,
          error: applied.failure.why,
          fix: applied.failure.fix,
          eventId: event.id,
          willRetry: true,
          // Said plainly, because the two are different problems with the same
          // status: the store refused us, or the store never answered.
          timedOut: applied.timedOut,
        }, { status: 500 });
      }
      const res = applied.value;
      walletApplied = { applied: res.applied, reason: res.reason, creditedAcu: res.creditedAcu, planId: res.planId };
      if (res.retriable) {
        return NextResponse.json({ received: false, error: res.reason, eventId: event.id, willRetry: true }, { status: 500 });
      }
    } catch (e) {
      // An exception here is a storage fault, not a malformed event. Same rule.
      const reason = e instanceof Error ? e.message : "wallet apply failed";
      return NextResponse.json({ received: false, error: `Could not persist this payment: ${reason}`, eventId: event.id, willRetry: true }, { status: 500 });
    }
  }

  // THE CREATOR WHO SENT THIS CUSTOMER GETS PAID — launch-audit finding D-12.
  //
  // §101 attributed the signup and nothing ever turned that into money. This is
  // the join: a payment that credited a wallet, against the referral recorded
  // when the account was created.
  //
  // A STORAGE FAILURE HERE RETURNS 500 ON PURPOSE. Stripe redelivers for three
  // days and `commissionForPayment` is idempotent by invoice id, so the accrual
  // lands by itself once the store is reachable. The alternative — acking a 200
  // and logging the miss — is a commission somebody earned and will never be
  // paid, discovered only if they complain.
  let commission: CommissionOutcome | null = null;
  if (outcome.handled && walletApplied?.applied) {
    const obj = (event.data?.object ?? {}) as Record<string, unknown>;
    const accrued = await withStoreDeadline("the creator commission accrual", COMMISSION_DEADLINE_MS, () => commissionForPayment({
      orgId: orgIdFromEvent(event),
      // The INVOICE id where there is one, so two events describing the same
      // payment cannot both accrue; the event id otherwise.
      paymentId: typeof obj.id === "string" && obj.id ? obj.id : event.id,
      amountPaidPence: typeof obj.amount_paid === "number" ? obj.amount_paid
        : typeof obj.amount_total === "number" ? obj.amount_total : 0,
      // Gross minus tax. Paying a creator a share of VAT is paying them out of
      // money that was never ours.
      taxPence: typeof obj.tax === "number" ? obj.tax
        : typeof obj.total_tax_amounts === "object" && Array.isArray(obj.total_tax_amounts)
          ? obj.total_tax_amounts.reduce((n: number, t: unknown) => n + (typeof (t as { amount?: unknown })?.amount === "number" ? (t as { amount: number }).amount : 0), 0)
          : 0,
      // WHEN STRIPE SAYS IT WAS PAID, not when we happened to process it.
      // Using `now` here meant a redelivery three days later carried a LATER
      // timestamp than the original, which moved this payment's position in the
      // ordering that derives its payment number — the one input the accrual id
      // is hashed from. The order-id guard in `commissionForPayment` catches it,
      // but a timestamp that changes per delivery is wrong on its own terms and
      // would surface again the moment that guard was touched.
      paidAtISO: paidAtFromEvent(event),
      nowISO: new Date().toISOString(),
    }));
    // A TIMEOUT IS A STORAGE FAILURE AND GETS THE SAME ANSWER. The paragraph
    // above chose 500 for a store that refuses; a store that never replies has
    // cost this payment exactly the same thing, and the accrual is idempotent
    // by invoice id, so the redelivery lands it.
    if (!accrued.ok) {
      return NextResponse.json({
        received: false, error: accrued.failure.why, fix: accrued.failure.fix,
        eventId: event.id, willRetry: true, timedOut: accrued.timedOut,
      }, { status: 500 });
    }
    commission = accrued.value;
    if (!commission.ok && !commission.terminal) {
      return NextResponse.json(
        { received: false, error: commission.reason, eventId: event.id, willRetry: true },
        { status: 500 },
      );
    }
  }

  // REPORT THE CONVERSION FROM THE SERVER — the half the browser can never send.
  //
  // WHY THIS IS HERE AND NOT IN THE BROWSER. `ConversionReporter` only runs if
  // the customer's browser comes back to the success_url. An ad blocker, Safari's
  // tracking prevention, a closed tab, or a RENEWAL — which has no browser
  // involved at all — and the Pixel reports nothing while the money is in the
  // bank. This is the copy that covers those.
  //
  // IT CANNOT DOUBLE-COUNT. Meta de-duplicates on `event_name` + `event_id`, and
  // `conversionEventId` derives that id from THIS Stripe event id on both sides,
  // so when the browser did report it the pair counts once.
  //
  // IT CANNOT MAKE THE WEBHOOK FAIL. The money is already credited by the time
  // this runs. A conversion report is the least important thing on this path, so
  // every failure is captured and reported in the body — never a 500, which would
  // make Stripe redeliver a payment that landed perfectly.
  //
  // IT SENDS NOTHING WITHOUT CONSENT. `sendCapiConversion` checks a durable
  // record first; see `backend/analytics-consent.ts` for why a server-side pixel
  // without that check is the one tracking path a person cannot refuse.
  let conversion: { sent: boolean; why?: string; eventId?: string } | null = null;
  // THE TAIL NEVER DELAYS THE ACKNOWLEDGEMENT.
  //
  // What follows is three network calls — a wallet read, a Firebase Auth
  // lookup and an outbound request to Meta — on a payment whose money has
  // ALREADY persisted. The comment below says truthfully that none of it can
  // fail the webhook, and that was only ever true of errors: unbounded, it
  // could and did delay the reply until the invocation was killed, which is
  // the one outcome worse than any failure here.
  //
  // So it is skipped outright once the budget is spent. A conversion report is
  // the least important thing on this path and is explicitly allowed to be the
  // thing that gets dropped.
  if (outcome.handled && walletApplied?.applied && elapsed() > ACK_TARGET_MS) {
    conversion = { sent: false, why: `skipped: the money took ${elapsed()}ms to persist and acknowledging Stripe matters more than reporting the conversion` };
  } else if (outcome.handled && walletApplied?.applied) {
    try {
      const orgId = orgIdFromEvent(event);
      // The STAMP, not the event: `applyWebhookOutcome` writes `lastCredit` in the
      // same transaction as the credit, so its presence is the proof the money
      // landed, and its absence means this event was not a sale (a grace period,
      // a downgrade, a refund, or a subscription start whose invoice pays).
      const read = await withStoreDeadline("the wallet read for conversion reporting", TAIL_DEADLINE_MS, () => getWallet(orgId));
      const credit = read.ok ? read.value.lastCredit : null;
      if (!read.ok) {
        conversion = { sent: false, why: `the wallet could not be read in time to report this conversion (${read.failure.kind}). The payment is unaffected.` };
      } else if (!credit || credit.eventId !== event.id) {
        conversion = { sent: false, why: "this event credited no money, so there is no conversion to report" };
      } else {
        // The identifier Meta matches on. Read from Firebase Auth rather than
        // from the Stripe event: the Stripe customer email is whatever was typed
        // at checkout, and the account email is who this actually is. Hashed
        // inside `sendCapiConversion` and never logged in either form.
        let email: string | null = null;
        if (adminConfigured && adminAuth) {
          // Bounded like everything else on this path: `.catch()` handles a
          // rejection and says nothing about a lookup that never returns.
          const found = await withStoreDeadline("the account email lookup", TAIL_DEADLINE_MS, () =>
            adminAuth!.getUser(orgId).then((u) => u.email ?? null));
          email = found.ok ? found.value : null;
        }
        // The click ids stamped on the session when checkout started. For a
        // RENEWAL the invoice carries the subscription's metadata, which is where
        // the original click survives — so a customer who came from an advert in
        // January is still attributed to it when they renew in June.
        const obj = (event.data?.object ?? {}) as Record<string, unknown>;
        const subMeta = (obj.subscription_details as { metadata?: Record<string, unknown> } | undefined)?.metadata;
        const click = clickIdsFromMetadata({
          ...(subMeta ?? {}),
          ...((obj.metadata as Record<string, unknown> | undefined) ?? {}),
        });

        const res = await sendCapiConversion({
          name: credit.kind === "topup" ? "topup" : "subscribe",
          stripeEventId: event.id,
          uid: orgId,
          value: typeof credit.amountMinor === "number" ? credit.amountMinor / 100 : undefined,
          currency: credit.currency,
          plan: credit.planId,
          atMs: Date.parse(credit.at) || Date.now(),
          user: { email, fbp: click.fbp, fbc: click.fbc },
        });
        conversion = res.sent
          ? { sent: true, eventId: res.eventId }
          : { sent: false, why: res.why };
      }
    } catch (e) {
      // Including a thrown error, which `sendCapiConversion` promises not to do —
      // belt and braces, because this must never be the reason a payment is
      // redelivered.
      conversion = { sent: false, why: `conversion reporting failed: ${e instanceof Error ? e.message : "unknown"}` };
    }
  }

  // Automatic revenue attribution: if this is a payment on a MarketWar-created
  // checkout (metadata.marketwar_brand_id), record it as attributed revenue for
  // that brand — idempotent by event id. Never blocks the 200 response.
  let attributed: { brandId: string; amountGbp: number; source: string } | null = null;
  const revenueEvent = brandRevenueFromEvent(event);
  if (revenueEvent) {
    try {
      // Bounded and best-effort: an attribution row is worth something, and it
      // is worth less than Stripe being answered.
      const wrote = await withStoreDeadline("the revenue attribution write", TAIL_DEADLINE_MS, () => recordEvent(revenueEvent));
      if (wrote.ok) attributed = { brandId: revenueEvent.brandId, amountGbp: revenueEvent.amountGbp, source: revenueEvent.source };
    } catch {
      /* attribution is best-effort; the webhook still acks */
    }
  }

  // `conversion` is reported in the body and never in the status — a conversion
  // that could not be sent is not a payment that failed, and Stripe reads a
  // non-200 as "send it again".
  // HOW LONG IT TOOK, in the answer.
  //
  // Thirty-five deliveries failed with no status and nothing on this side could
  // say whether the handler had been slow, because the one number that would
  // have settled it was never recorded anywhere. Stripe shows the response body
  // on every delivery in the dashboard, so putting it here means the next
  // person looking at a failing endpoint can read the duration of the ones that
  // succeeded instead of guessing.
  return NextResponse.json({ received: true, ms: elapsed(), demoSignature: verdict.demo ?? false, outcome, walletApplied, attributed, commission, conversion });
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    engine: "Stripe webhook — subscription → ACU allocation",
    doctrine: "Verifies the Stripe signature (Node crypto, no SDK), then maps a small allowlist of billing events to append-only ACU-ledger + subscription outcomes. Idempotent by event id — and, where two events describe one movement of money, by the refund or dispute itself, so a dispute cannot reverse the same ACUs twice. ACUs are allocated at 20% of the plan price via the subscription engine. Provider/secret values are never returned.",
    // The host THIS request arrived on, not a constant. A hard-coded domain is
    // what sent 246 events to an address that redirected.
    endpointUrl: webhookEndpointUrl(req.headers.get("host") || undefined),
    // TWO LISTS, AND THE DIFFERENCE MATTERS TO WHOEVER IS TICKING BOXES.
    // `subscribeEvents` is what to select in Stripe; `handledEvents` is the
    // subset the dispatcher acts on. `charge.succeeded` is on the first and not
    // the second because it is read for a customer's own sales rather than for
    // our wallet. Everything else is acknowledged with 200 and ignored, so a
    // wider selection costs delivery volume and buys nothing.
    subscribeEvents: SUBSCRIBE_EVENTS,
    handledEvents: HANDLED_EVENTS,
    note: `Select exactly these ${SUBSCRIBE_EVENTS.length} events. Selecting all of them is what overwhelms an endpoint; selecting fewer than these is how money stops arriving.`,
    demo: demoStripe(),
  });
}
