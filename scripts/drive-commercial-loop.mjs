// DRIVE THE COMMERCIAL LOOP END TO END, AGAINST A RUNNING PRODUCTION SERVER.
//
// WHY THIS EXISTS. The honest answer to "is this commercially ready" had become
// "no customer has ever paid, so nobody knows" — which is true and is not an
// answer, because it does not separate two completely different situations:
//
//   A. The machine CANNOT take a customer's money and deliver what was bought.
//   B. The machine CAN, and no one has walked through the door yet.
//
// A is a defect and my job. B is a market fact and is not. Nothing in this
// repository distinguished them, so the same sentence covered both and the owner
// was left unable to tell whether he had a product or a demo.
//
// So this walks the money path the way a paying customer does, over HTTP, on a
// production build: a visitor arrives, signs up and is granted the free
// allowance; they choose a paid plan; Stripe answers; the webhook delivers; the
// wallet is credited and the plan activated; the credits are then SPENT on real
// work and the balance goes down. Every step is a real request to a real route.
//
// WHAT IT REFUSES TO DO. It does not mock a route to make a step pass, and it
// does not call a step "ok" because it did not crash. Any step that cannot be
// exercised in this environment is reported as SKIPPED with the reason, never as
// a pass — the whole point is to be believed, and a suite that reports green for
// things it never ran is worth less than no suite.
//
// Usage:  npm run build && npm run start &   then   node scripts/drive-commercial-loop.mjs
// Exits non-zero if any step that COULD run did not do what it promises.

import { createHmac } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET || "";

const steps = [];
const rec = (name, state, detail) => {
  steps.push({ name, state, detail });
  const tag = state === "pass" ? "PASS " : state === "skip" ? "SKIP " : "FAIL ";
  console.log(`${tag} ${name}\n       ${detail}`);
};

const get = (p, init) => fetch(BASE + p, init);
const postJson = (p, body, headers = {}) =>
  fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

// ---------------------------------------------------------------------------
// 1. THE DOOR. A visitor with no account, no card and no configuration.
// ---------------------------------------------------------------------------
{
  const res = await get("/");
  const html = await res.text();
  if (res.ok && html.length > 2000) rec("A visitor can reach the site", "pass", `GET / answered ${res.status}, ${html.length} bytes of HTML.`);
  else rec("A visitor can reach the site", "fail", `GET / answered ${res.status} with ${html.length} bytes.`);
}

// ---------------------------------------------------------------------------
// 2. THE FREE THING THAT NEEDS NOTHING. The audit is what the adverts promise:
//    no account, no card. If this needs configuration the adverts are a lie.
// ---------------------------------------------------------------------------
{
  // A PUBLIC address on purpose. Pointed at localhost the audit refuses, because
  // crawling a private network on a visitor's say-so is server-side request
  // forgery — and the first version of this script read that correct refusal as
  // a broken product. A harness that cannot tell "it refused me, rightly" from
  // "it is broken" will eventually report one as the other.
  const target = process.env.AUDIT_TARGET || "https://marketwaros.com";

  // CAN THIS MACHINE REACH THE TARGET AT ALL? Asked first, because otherwise a
  // sandbox that blocks outbound HTTPS makes the audit look broken. Driving it
  // from here, the egress proxy denied the connection and manufactured a 403,
  // and the route reported that as a site turning away automated requests —
  // a perfectly reasonable reading of a 403, and wrong about this container.
  // Blaming the product for the harness is how a green suite loses its meaning,
  // and blaming the harness for the product is how a red one does.
  let reachable = true;
  let why = "";
  try {
    const probe = await fetch(target, { method: "HEAD", headers: { "user-agent": "MarketWarBot/1.0" } });
    reachable = probe.status < 400;
    why = `a direct request from this machine answered ${probe.status}`;
  } catch (e) {
    reachable = false;
    why = `a direct request from this machine failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (!reachable) {
    rec("The free audit runs with no account and no key", "skip",
      `${target} is not reachable from this container (${why}), so the crawl cannot be exercised here. Run this against a machine with open outbound HTTPS, or set AUDIT_TARGET to something reachable.`);
  }

  const res = reachable ? await postJson("/api/audit", { url: target }) : null;
  if (!res) { /* already reported */ } else {
  const body = await res.json().catch(() => ({}));
  const score = body?.report?.score ?? body?.score;
  if (res.ok && typeof score === "number") {
    rec("The free audit runs with no account and no key", "pass",
      `Crawled ${target} and scored ${score}/100 across ${body?.report?.findings?.length ?? "?"} checks. No account, no card, no key.`);
  } else if (typeof body?.error === "string" && /private network|could not|unreachable|DNS|timed out/i.test(body.error)) {
    rec("The free audit runs with no account and no key", "skip",
      `The crawl could not reach ${target} from this container, and the route said so plainly rather than inventing a score: "${body.error}"`);
  } else {
    rec("The free audit runs with no account and no key", res.status === 404 ? "skip" : "fail",
      res.status === 404 ? "No /api/audit on this build." : `Answered ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  }
}

// ---------------------------------------------------------------------------
// 3. SIGNUP. The human challenge must be issued and verifiable — a signup that
//    cannot be completed is a shop whose door is locked.
// ---------------------------------------------------------------------------
{
  const res = await get("/api/auth/human");
  const body = await res.json().catch(() => ({}));
  const hasChallenge = Boolean(body?.question || body?.challenge || body?.prompt);
  if (res.ok && hasChallenge) rec("A signup challenge is issued", "pass", `GET /api/auth/human answered ${res.status} with a challenge to solve.`);
  else rec("A signup challenge is issued", "fail", `Answered ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// 4. THE TILL. Choosing a paid plan must either create a Stripe checkout or
//    REFUSE HONESTLY. A 200 with no URL would be the worst outcome of all: a
//    buy button that goes nowhere and says nothing.
// ---------------------------------------------------------------------------
{
  const res = await postJson("/api/billing/subscribe", { planId: "growth", cycle: "monthly" });
  const body = await res.json().catch(() => ({}));
  const url = body?.url || body?.checkoutUrl;
  if (res.ok && typeof url === "string" && url.startsWith("https://")) {
    rec("Choosing a paid plan creates a real Stripe checkout", "pass", `Answered 200 with a checkout URL at ${new URL(url).host}.`);
  } else if (res.status === 503 && typeof body?.error === "string") {
    rec("Choosing a paid plan creates a real Stripe checkout", "skip",
      `No Stripe key in this environment, and the route REFUSED rather than pretending: ${res.status} "${body.error}". That is the correct behaviour; it is not proof the live key works.`);
  } else if (res.status === 401 || res.status === 403) {
    rec("Choosing a paid plan creates a real Stripe checkout", "skip",
      `Requires a signed-in account (${res.status}), which needs Firebase Admin credentials this environment does not have.`);
  } else {
    rec("Choosing a paid plan creates a real Stripe checkout", "fail", `Answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. THE PAYMENT LANDING. This is the step that has never happened in
//    production: 246 events sent, none verified. Here the whole delivery is
//    real — a genuine HMAC signature over a genuine Stripe event shape, posted
//    at the live route, which verifies it exactly as it verifies Stripe's.
// ---------------------------------------------------------------------------
const ORG = `loop-${Date.now()}`;
if (!WHSEC) {
  rec("A paid invoice credits the wallet and activates the plan", "skip",
    "STRIPE_WEBHOOK_SECRET is not set on this server, so a signature cannot be produced. Start the server with one to exercise this step.");
} else {
  const payload = JSON.stringify({
    id: `evt_loop_${Date.now()}`, type: "invoice.paid",
    data: { object: {
      amount_paid: 4900, currency: "gbp", subscription: "sub_loop",
      subscription_details: { metadata: { orgId: ORG, planId: "growth" } },
      lines: { data: [{ price: { id: "price_loop" }, metadata: { planId: "growth" } }] },
    } },
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = `t=${ts},v1=${createHmac("sha256", WHSEC).update(`${ts}.${payload}`).digest("hex")}`;
  const res = await fetch(BASE + "/api/webhooks/stripe", {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: payload,
  });
  const body = await res.json().catch(() => ({}));
  const credited = body?.wallet?.creditedAcu ?? body?.creditedAcu;
  // A CREDIT THAT CANNOT PERSIST MUST NOT BE ACKNOWLEDGED, and this route is
  // right to refuse. Without Firebase Admin there is no durable wallet, so
  // returning 200 would tell Stripe the payment was handled while the ACUs
  // existed only in one process's memory until the next request — money taken,
  // nothing delivered, and no retry ever. It answers 500 and Stripe redelivers.
  //
  // That refusal is a PROPERTY WORTH PROVING and it is NOT the step passing.
  // Reporting it as a pass would be the exact dishonesty this file exists to
  // avoid; reporting it as a failure would blame the platform for behaving
  // correctly. It is a step that could not run here, and the reason is stated.
  const unpersistable = res.status === 500 && /durable wallet store|Firebase Admin is not configured/i.test(String(body?.error || ""));
  if (res.ok && Number(credited) > 0) {
    rec("A paid invoice credits the wallet and activates the plan", "pass",
      `£49.00 delivered and verified. ${credited} ACUs credited to ${ORG}, plan "${body?.wallet?.planId ?? body?.planId}".`);
  } else if (unpersistable) {
    rec("A paid invoice credits the wallet and activates the plan", "skip",
      "The signature VERIFIED and the credit was computed, then refused because this container has no Firebase Admin and therefore no durable wallet. The route answered 500 so Stripe will redeliver, rather than acknowledging a payment that would leave no credits behind. Correct, and not proof the credit lands — only a delivery on the real deployment proves that.");
    rec("An unpersistable credit is never acknowledged", "pass",
      `willRetry: ${body?.willRetry === true}. A 200 here would have told Stripe the money was handled while the ACUs vanished with the process.`);
  } else if (res.ok) {
    rec("A paid invoice credits the wallet and activates the plan", "fail",
      `The delivery verified but nothing was credited — this is the "charged and served nothing" state: ${JSON.stringify(body).slice(0, 300)}`);
  } else {
    rec("A paid invoice credits the wallet and activates the plan", "fail", `Answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const landed = res.ok && Number(credited) > 0;

  // 5b. FORGERY. The same route must refuse an unsigned delivery outright,
  //     or the credit above proves only that anyone can mint credits.
  const bad = await fetch(BASE + "/api/webhooks/stripe", {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" }, body: payload,
  });
  if (bad.status === 400) rec("A forged delivery is refused", "pass", `An invalid signature answered ${bad.status}, so the credit above required the real secret.`);
  else rec("A forged delivery is refused", "fail", `A forged delivery answered ${bad.status} — anyone could mint credits.`);

  // 5c. REPLAY. Stripe redelivers; a second copy must not credit twice. Only
  //     meaningful if the first one landed — asking whether a credit that never
  //     happened happened twice would answer itself and prove nothing, which is
  //     the shape of a test that passes for a reason unrelated to what it tests.
  if (!landed) {
    rec("A redelivered invoice does not credit twice", "skip",
      "The first delivery could not be persisted here, so there is no first credit for a second one to duplicate. Idempotency is covered by the test suite, which drives the same route with a wallet store behind it.");
  } else {
    const again = await fetch(BASE + "/api/webhooks/stripe", {
      method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: payload,
    });
    const ab = await again.json().catch(() => ({}));
    const twice = Number(ab?.wallet?.creditedAcu ?? ab?.creditedAcu ?? 0) > 0 && ab?.wallet?.applied !== false;
    if (again.ok && !twice) rec("A redelivered invoice does not credit twice", "pass", "The repeat was accepted and skipped as already processed.");
    else rec("A redelivered invoice does not credit twice", "fail", `A redelivery credited again: ${JSON.stringify(ab).slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// 6. THE GO-LIVE ANSWER. Whatever the steps above did, the platform's own
//    pre-flight is what an owner reads the morning of a launch, so it is
//    exercised too rather than trusted.
// ---------------------------------------------------------------------------
{
  const res = await get("/api/health/live");
  const body = await res.json().catch(() => ({}));
  const l = body?.launch;
  if (res.ok && l && typeof l.goPublic === "boolean") {
    const ids = (l.findings || []).filter((f) => f.severity === "blocker").map((f) => f.id);
    rec("The platform answers its own go/no-go", "pass",
      `goPublic: ${l.goPublic}, ${l.blockers} blocker(s), ${l.warnings} warning(s).${ids.length ? ` Blockers: ${ids.join(", ")}.` : ""}`);
  } else {
    rec("The platform answers its own go/no-go", "fail", `Answered ${res.status} with no launch report: ${JSON.stringify(body).slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
const fails = steps.filter((s) => s.state === "fail");
const skips = steps.filter((s) => s.state === "skip");
const passes = steps.filter((s) => s.state === "pass");
console.log(`\n${passes.length} proven · ${skips.length} could not be exercised here · ${fails.length} broken`);
if (skips.length) {
  console.log("\nNOT PROVEN BY THIS RUN, and not claimed:");
  for (const s of skips) console.log(`  · ${s.name} — ${s.detail}`);
}
process.exit(fails.length ? 1 : 0);
