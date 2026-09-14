// MAKE STRIPE PROVE THE MONEY PATH. ONE COMMAND, NO CLICKING, NO CARD.
//
// WHY THIS EXISTS. `drive-commercial-loop.mjs` walks the whole commercial path
// and reports honestly that one step cannot be exercised: the delivery it tests
// is one IT signs and IT posts. That proves the route, the dispatcher and the
// wallet. It cannot prove the two things the standing blocker is actually about:
//
//   • that Stripe can reach this deployment at all, and
//   • that STRIPE_WEBHOOK_SECRET is the secret Stripe signs with.
//
// Nothing inside the process can know either. The blocker's own fix text said so
// and ended "…then use Stripe's 'Send test webhook' on it" — a person, a
// browser, a click. This repository has a standing rule against exactly that:
// never tell the owner to do by hand what the platform should do for them. When
// the answer is "go and click", the defect is that nothing is clicking.
//
// SO THIS CLICKS. Stripe emits real events for things its API can cause, and
// delivers them over the real internet with a real signature. This causes one,
// then reads back — from the deployment's own receipt, which is written the
// instant a signature verifies — whether it landed. Every decision about WHAT to
// cause and WHAT the result means lives in `src/shared/stripe-drive.ts`, pure,
// so the interesting branches are tested rather than only ever run in
// production.
//
// THE SAFETY RULE, AND IT IS ABSOLUTE. A LIVE KEY NEVER CREATES A BILLABLE
// OBJECT. In test mode an invoice is a toy; on a live account the identical
// calls invoice a real customer and may email them. A diagnostic that bills
// somebody is not a diagnostic. A restricted key that will not reveal its mode
// counts as live, because the two mistakes are not symmetrical.
//
// Usage:
//   npm run build && npm run start &
//   STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… npm run drive:commerce
//
// Against the live deployment, add BASE_URL=https://… and CRON_SECRET=… so the
// receipt can be read back without a browser session.
//
// Exits non-zero only when something is BROKEN. "Could not be exercised here" is
// reported as exactly that and exits zero — a suite that reports green for what
// it never ran is worth less than no suite.

import { stripeKeyMode, chooseProvocation, driveVerdict } from "../src/shared/stripe-drive.ts";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
// TEST SEAM, AND ONLY A TEST SEAM. The shipped code never reads this — a
// redirectable API base in a route that carries a secret key is a credential
// exfiltration hole. It exists so `tests/helpers/fake-stripe.mjs` can stand in
// for Stripe and this script can be driven end to end in a container with no
// Stripe account, which is the only way its branches get run at all.
const API = (process.env.MW_STRIPE_API_BASE || "https://api.stripe.com").replace(/\/+$/, "");
const CRON = (process.env.CRON_SECRET || "").trim();
const WEBHOOK_PATH = "/api/webhooks/stripe";

const steps = [];
const rec = (name, state, detail) => {
  steps.push({ name, state, detail });
  console.log(`${state === "pass" ? "PASS " : state === "skip" ? "SKIP " : "FAIL "} ${name}\n       ${detail}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stripe's API speaks form-encoding, including for nested metadata. */
function form(obj, prefix = "") {
  const p = new URLSearchParams();
  const walk = (o, pre) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null) continue;
      const key = pre ? `${pre}[${k}]` : k;
      if (typeof v === "object" && !Array.isArray(v)) walk(v, key);
      else p.append(key, String(v));
    }
  };
  walk(obj, prefix);
  return p;
}

async function stripe(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${KEY}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(body ? { body: form(body).toString() } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json, error: json?.error?.message || "" };
}

/**
 * What the deployment recorded THIS event doing to a wallet.
 *
 * MEASURED, NOT INFERRED. The first version of this script had no such call: it
 * reported "the wallet credit ran" from the fact that the event TYPE carries
 * money. The receipt moves on signature verification, before anything
 * downstream can fail, so a delivery that verified and credited nothing looked
 * identical. `processed_events` is written in the same transaction as the
 * credit, so reading it by Stripe's own event id is the only honest proof.
 */
async function readEventOutcome(eventId) {
  try {
    const res = await fetch(`${BASE}/api/health/stripe?event=${encodeURIComponent(eventId)}`, {
      headers: CRON ? { authorization: `Bearer ${CRON}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    const o = body?.webhookDiagnostic?.eventOutcome;
    if (!o || typeof o !== "object" || o.found === false || o.restricted) return null;
    return { orgId: String(o.orgId || ""), creditedAcu: Number(o.creditedAcu) || 0, planId: o.planId ?? null };
  } catch { return null; }
}

/**
 * Does this deployment's own webhook address accept a correctly signed delivery?
 *
 * THE ONE QUESTION THAT SEPARATES the two causes of "Stripe delivered nothing":
 * an address Stripe cannot reach, and an address that refuses the signature.
 * They look identical in Stripe's own event record — a 400 and a connection
 * that never opened both leave the attempt outstanding — and they have opposite
 * fixes. `/api/health/stripe` already probes it, so it is ASKED rather than
 * guessed. `null` when the probe did not run, and then nothing is asserted.
 */
async function endpointReachable(endpointUrl) {
  try {
    const res = await fetch(`${BASE}/api/health/stripe`, { headers: CRON ? { authorization: `Bearer ${CRON}` } : {} });
    const body = await res.json().catch(() => ({}));
    const sd = body?.webhookDiagnostic?.selfDelivery;
    if (!sd?.ran || !Array.isArray(sd.results) || !sd.results.length) return null;
    // IT MUST BE THE SAME ADDRESS, and this line is the second wrong-remedy
    // defect this run found in itself. `selfDelivery` probes only `https://`
    // URLs on this app's own path — correct in production, where the endpoint
    // IS https, and NOT the address Stripe used when driving a local server over
    // http. Taking `some(r => r.ok)` answered "unreachable" about addresses
    // Stripe never touched, and the run then blamed DNS for a wrong secret:
    // a check failing for a reason unrelated to what it tests, producing the
    // exact wrong-remedy fault it had just been fixed for.
    //
    // So the result must be FOR the endpoint Stripe delivered to. No matching
    // probe means the question was not answered — `null`, and the verdict then
    // asserts neither cause instead of guessing.
    const want = String(endpointUrl || "").replace(/\/+$/, "");
    const mine = sd.results.find((r) => String(r?.url || "").replace(/\/+$/, "") === want);
    return mine ? mine.ok === true : null;
  } catch { return null; }
}

/**
 * The deployment's own record of the last verified delivery.
 *
 * READ FROM THE PLATFORM, NOT INFERRED. It is privileged, so without a bearer
 * this returns null and the run reports that it could not read back rather than
 * guessing from a launch finding that might have moved for another reason.
 */
async function readReceipt() {
  try {
    const res = await fetch(`${BASE}/api/health/stripe`, {
      headers: CRON ? { authorization: `Bearer ${CRON}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    const v = body?.webhookDiagnostic?.verifiedDelivery;
    if (!v || typeof v !== "object") return null;
    return { lastVerifiedAt: v.lastVerifiedAt ?? null, verifiedCount: Number(v.verifiedCount) || 0 };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 0. CAN THIS RUN AT ALL, AND IS IT SAFE?
// ---------------------------------------------------------------------------
const mode = stripeKeyMode(KEY);
if (mode === "none") {
  rec("Stripe proves the money path itself", "skip",
    "No STRIPE_SECRET_KEY in this environment, so Stripe cannot be asked to emit anything. That is demo mode, not a "
    + "fault — but the money path is unproven here and this run does not claim otherwise.");
  console.log("\n0 proven · 1 could not be exercised here · 0 broken");
  process.exit(0);
}
console.log(`Key mode: ${mode.toUpperCase()}${mode === "test" ? " (no real money exists in test mode)" : ""}`);
if (mode !== "test") {
  console.log("A live or unrecognised key will NOT create any billable object. Only free, no-money provocations are "
    + "available, and they prove reachability and the signing secret — never the wallet credit.");
}

// ---------------------------------------------------------------------------
// 1. WHICH ENDPOINT IS OURS, AND WHAT DOES IT SUBSCRIBE TO?
//
//    Stripe delivers only what an endpoint asked for. An event type the endpoint
//    is not subscribed to is not a failed delivery — it is NO delivery, which
//    looks identical from here and has a completely different fix.
// ---------------------------------------------------------------------------
let ourEndpoint = null;
let enabledEvents = [];
{
  const res = await stripe("GET", "/v1/webhook_endpoints?limit=100");
  if (!res.ok) {
    rec("The account's webhook endpoints can be listed", "skip",
      `Stripe answered ${res.status}: ${res.error}. A restricted key without webhook read permission fails here, and `
      + "that is not itself a fault — but without the listing there is no way to know what the endpoint subscribes to.");
  } else {
    const rows = Array.isArray(res.json?.data) ? res.json.data : [];
    const baseHost = new URL(BASE).host.toLowerCase();
    const here = rows.filter((r) => String(r?.url || "").endsWith(WEBHOOK_PATH));
    const exact = here.filter((r) => { try { return new URL(r.url).host.toLowerCase() === baseHost; } catch { return false; } });
    ourEndpoint = exact[0] || here[0] || null;
    enabledEvents = Array.isArray(ourEndpoint?.enabled_events) ? ourEndpoint.enabled_events : [];
    if (!ourEndpoint) {
      rec("The account's webhook endpoints can be listed", "fail",
        `${rows.length} endpoint(s) on this account and NONE points at ${WEBHOOK_PATH}. Stripe is posting somewhere `
        + `else entirely, which by itself explains delivered events and nothing landing. Add an endpoint at ${BASE}${WEBHOOK_PATH}.`);
    } else {
      rec("The account's webhook endpoints can be listed", "pass",
        `${rows.length} endpoint(s); ${ourEndpoint.id} at ${ourEndpoint.url} is this deployment's`
        + `${exact.length ? "" : " (PATH matches, HOST does not — Stripe does not follow redirects, so check this)"}. `
        + `Subscribed to ${enabledEvents.includes("*") ? "everything (*)" : `${enabledEvents.length} event type(s)`}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2. WHAT CAN WE SAFELY MAKE STRIPE DO? Decided in the pure module.
// ---------------------------------------------------------------------------
const provocation = chooseProvocation({ mode, enabledEvents });
if (!provocation.kind) {
  rec("Stripe can be made to emit an event this deployment receives", "skip", provocation.blocker);
} else {
  rec("Stripe can be made to emit an event this deployment receives", "pass",
    `${provocation.eventType} — ${provocation.why}`);
}

// ---------------------------------------------------------------------------
// 3. READ THE RECEIPT BEFORE, so "it moved" is a measurement and not a guess.
//    A receipt that was already non-empty proves nothing about THIS run, and
//    asserting on its mere presence is a check that passes for a reason
//    unrelated to what it tests.
// ---------------------------------------------------------------------------
const before = await readReceipt();
if (!before) {
  rec("The deployment's delivery receipt can be read back", "skip",
    CRON
      ? `${BASE}/api/health/stripe did not return a verifiedDelivery block. Either the build predates it, or the `
        + "bearer was refused — check CRON_SECRET matches the deployment's."
      : "The receipt is privileged and no CRON_SECRET was given, so there is nothing to compare against. Set "
        + "CRON_SECRET to the deployment's value and run again; without it this run cannot prove a delivery landed.");
} else {
  rec("The deployment's delivery receipt can be read back", "pass",
    `Before: ${before.verifiedCount} verified delivery/deliveries, last at ${before.lastVerifiedAt ?? "never"}.`);
}

// ---------------------------------------------------------------------------
// 4. PROVOKE. Real objects, real events, on Stripe's own servers.
// ---------------------------------------------------------------------------
let eventId = null;
let pendingWebhooks = null;
let customerId = null;
let walletTarget = null;

if (provocation.kind && before) {
  const stamp = Date.now();
  walletTarget = `drive-${stamp}`;

  // The customer is created in BOTH paths: the invoice needs one, and on the
  // free path its creation IS the event. It is deleted in a finally-style block
  // below whatever happens, because a diagnostic that leaves debris in somebody's
  // Stripe account is a diagnostic they stop running.
  const cust = await stripe("POST", "/v1/customers", {
    description: "MarketWar OS drive:commerce — delete on sight",
    metadata: { marketwar_drive: "true", orgId: walletTarget },
  });
  if (!cust.ok) {
    rec("Stripe creates the object that emits the event", "fail",
      `POST /v1/customers answered ${cust.status}: ${cust.error}. Nothing was created and nothing is proven.`);
  } else {
    customerId = cust.json?.id || null;

    if (provocation.kind === "invoice") {
      // TEST MODE ONLY — guaranteed by `chooseProvocation`, which returns this
      // kind for no other mode. The three calls are the ordinary subscription
      // billing shape: an item, an invoice that carries the plan metadata the
      // dispatcher reads, and a payment that makes Stripe emit `invoice.paid`.
      const attach = await stripe("POST", `/v1/payment_methods/pm_card_visa/attach`, { customer: customerId });
      if (attach.ok) {
        await stripe("POST", `/v1/customers/${customerId}`, { invoice_settings: { default_payment_method: attach.json?.id || "pm_card_visa" } });
      }
      await stripe("POST", "/v1/invoiceitems", { customer: customerId, amount: 4900, currency: "gbp", description: "MarketWar OS Growth — drive:commerce" });
      const inv = await stripe("POST", "/v1/invoices", {
        customer: customerId, collection_method: "charge_automatically", auto_advance: false,
        // THE METADATA IS THE POINT. The dispatcher allocates nothing for a
        // payment that does not name its plan — deliberately, because guessing
        // hands out an entitlement nobody paid for. An invoice without these
        // would verify, land, and credit zero, and this run would have to call
        // that a pass.
        metadata: { planId: "growth", cycle: "monthly", orgId: walletTarget },
      });
      if (!inv.ok) {
        rec("Stripe creates the object that emits the event", "fail", `POST /v1/invoices answered ${inv.status}: ${inv.error}`);
      } else {
        const id = inv.json?.id;
        await stripe("POST", `/v1/invoices/${id}/finalize`, {});
        const paid = await stripe("POST", `/v1/invoices/${id}/pay`, { payment_method: "pm_card_visa" });
        if (!paid.ok) {
          rec("Stripe creates the object that emits the event", "fail",
            `POST /v1/invoices/${id}/pay answered ${paid.status}: ${paid.error}. In test mode this should always `
            + "succeed with pm_card_visa; a failure here is about the Stripe account, not this platform.");
        } else {
          rec("Stripe creates the object that emits the event", "pass",
            `Invoice ${id} paid in TEST mode with pm_card_visa — £49.00 of no real money. Stripe now emits invoice.paid `
            + "and delivers it to the endpoint itself.");
        }
      }
    } else {
      rec("Stripe creates the object that emits the event", "pass",
        `Customer ${customerId} created. No money moved and none can: this provocation exists to make Stripe deliver a `
        + "real signed event, nothing more.");
    }
  }

  // Which event did Stripe actually emit? Asked, never assumed — the event we
  // care about is the one Stripe decided to create, and reading its own listing
  // is the only way to learn its id and its delivery state.
  if (customerId) {
    for (let i = 0; i < 10 && !eventId; i++) {
      const ev = await stripe("GET", `/v1/events?limit=25&type=${encodeURIComponent(provocation.eventType)}`);
      const rows = Array.isArray(ev.json?.data) ? ev.json.data : [];
      const mine = rows.find((r) => JSON.stringify(r?.data?.object?.metadata ?? {}).includes(walletTarget))
        || rows.find((r) => r?.data?.object?.customer === customerId)
        || rows.find((r) => r?.data?.object?.id === customerId);
      if (mine) { eventId = mine.id; pendingWebhooks = typeof mine.pending_webhooks === "number" ? mine.pending_webhooks : null; }
      else await sleep(1000);
    }
    if (!eventId) {
      rec("Stripe emits the event and says so", "fail",
        `Ten seconds after the object was created, no ${provocation.eventType} naming it appears in this account's own `
        + "event list. Stripe did not emit what was expected, so nothing downstream can be concluded.");
    } else {
      rec("Stripe emits the event and says so", "pass",
        `${eventId} (${provocation.eventType}), ${pendingWebhooks === null ? "delivery state not reported" : `${pendingWebhooks} delivery attempt(s) outstanding`}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. DID IT LAND? Poll the deployment's own receipt. Stripe delivers within a
//    second or two normally, and retries for hours — waiting a little is not
//    the same as waiting for a retry, and this waits only for the first.
// ---------------------------------------------------------------------------
let after = before;
if (eventId && before) {
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const now = await readReceipt();
    if (now && (now.verifiedCount > before.verifiedCount || (now.lastVerifiedAt && now.lastVerifiedAt !== before.lastVerifiedAt))) {
      after = now;
      break;
    }
    after = now || after;
  }
  // Re-read the event: `pending_webhooks` drains as endpoints accept, so the
  // value AFTER the wait distinguishes "never got out" from "got out, refused".
  const ev = await stripe("GET", `/v1/events/${eventId}`);
  if (ev.ok && typeof ev.json?.pending_webhooks === "number") pendingWebhooks = ev.json.pending_webhooks;
}

// 5b. AND WHAT DID IT DO TO THE WALLET? Asked of the platform, by the id Stripe
//     gave us, so the money claim is a reading rather than an assumption.
const walletOutcome = eventId ? await readEventOutcome(eventId) : null;

// 5c. AND IF IT DID NOT LAND, IS THE ADDRESS EVEN REACHABLE? Asked only when it
//     matters — the probe posts a real delivery, and running it on a healthy
//     account would add a verification to the very receipt this run measures.
const receiptMoved = Boolean(before && after && (after.verifiedCount > before.verifiedCount
  || (after.lastVerifiedAt && after.lastVerifiedAt !== before.lastVerifiedAt)));
const reachable = eventId && !receiptMoved && ourEndpoint?.url ? await endpointReachable(ourEndpoint.url) : null;

// ---------------------------------------------------------------------------
// 6. CLEAN UP. Always. Deleting the customer voids its invoices with it.
// ---------------------------------------------------------------------------
if (customerId) {
  const del = await stripe("DELETE", `/v1/customers/${customerId}`);
  rec("The drive leaves nothing behind in the Stripe account", del.ok ? "pass" : "fail",
    del.ok
      ? `Customer ${customerId} deleted, which voids the invoice with it. Nothing this run created survives it.`
      : `Customer ${customerId} could NOT be deleted (${del.status}: ${del.error}). Delete it by hand in Stripe — a `
        + "diagnostic that leaves debris is one people stop running.");
}

// ---------------------------------------------------------------------------
// 7. THE VERDICT. Decided in the pure module, printed here.
// ---------------------------------------------------------------------------
if (before) {
  // A test key drives test-mode endpoints, which are SEPARATE objects from the
  // live ones with SEPARATE secrets. If the deployment holds the live secret,
  // every signature fails exactly as a wrong secret would — and reporting that
  // as a broken money path would be wrong about the live path in both directions.
  const modeMismatch = mode === "test" && /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || "") && !ourEndpoint;
  const verdict = driveVerdict({ provocation, eventId, pendingWebhooks, before, after: after || before, walletOutcome, endpointReachable: reachable, modeMismatch });
  console.log(`\n${verdict.verdict}`);
  if (verdict.fix) console.log(`\nFIX: ${verdict.fix}`);
  rec(
    "A delivery Stripe itself made verified against this deployment's secret",
    verdict.proven ? "pass" : verdict.outcome === "not_attempted" ? "skip" : "fail",
    verdict.proven
      ? `Receipt moved from ${before.verifiedCount} to ${(after || before).verifiedCount} verified deliveries.`
      : verdict.verdict,
  );
  if (provocation.exercisesWallet) {
    rec("The wallet credit ran on a delivery nobody here forged",
      verdict.walletProven ? "pass" : "fail",
      verdict.walletProven
        ? `${walletOutcome.creditedAcu} ACUs credited to wallet ${walletOutcome.orgId}`
          + `${walletOutcome.planId ? ` on plan ${walletOutcome.planId}` : ""}, read back from the record written in the `
          + "same transaction as the credit. Not inferred from the event type — that claim was wrong once already."
        : "Not proven — see above.");
  } else if (provocation.kind) {
    rec("The wallet credit ran on a delivery nobody here forged", "skip",
      "The only provocation available on this key moves no money, so it cannot prove the credit. That step is covered "
      + "by `npm run drive:loop`, which signs its own delivery — a strictly weaker claim, and named as one.");
  }
}

const fails = steps.filter((s) => s.state === "fail");
const skips = steps.filter((s) => s.state === "skip");
const passes = steps.filter((s) => s.state === "pass");
console.log(`\n${passes.length} proven · ${skips.length} could not be exercised here · ${fails.length} broken`);
if (skips.length) {
  console.log("\nNOT PROVEN BY THIS RUN, and not claimed:");
  for (const s of skips) console.log(`  · ${s.name} — ${s.detail}`);
}
process.exit(fails.length ? 1 : 0);
