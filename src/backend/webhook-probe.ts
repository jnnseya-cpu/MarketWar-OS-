// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// CALL OUR OWN WEBHOOK ENDPOINT THE WAY STRIPE CALLS IT, AND REPORT WHAT HAPPENS.
//
// WHY THIS EXISTS. Stripe wrote: 73 requests to
// https://www.marketwaros.com/api/webhooks/stripe "had other errors", every one
// since 4 September, and the endpoint will be disabled on the 13th. "Other
// errors" is Stripe's category for an exchange that never produced an HTTP
// status at all — DNS that did not resolve, a TLS handshake that did not
// complete, a connection refused or reset. It is NOT a signature mismatch,
// which would arrive as a 4xx, and it is not our 500, which would arrive as a
// 5xx. Something is wrong BEFORE our code is reached.
//
// Every existing check reasons about that from inside the process, which is the
// one vantage point that cannot see it: `/api/health/stripe` compares the
// configured host against the host serving the request, and a request that never
// arrives serves nothing to compare. The endpoint Stripe cannot reach is, by
// definition, not the one you are reading the diagnostic on.
//
// So this makes the call from outside in: a real HTTPS request to the real
// configured URL, with a real signature, and reports the same thing Stripe would
// have seen. DNS, TLS, redirect, status, body.
//
// REDIRECTS ARE NOT FOLLOWED, ON PURPOSE. Stripe does not follow them. If
// `www.marketwaros.com` answers 308 to the apex, a browser sees a working site
// and Stripe records a failed delivery — the two observations disagree, and only
// this one matches what Stripe does. `redirect: "manual"` is the whole point of
// the function; following the redirect would report success for the exact
// configuration that is failing.
//
// IT MUST NOT MOVE MONEY. The probe signs an event type the dispatcher does not
// act on, so the route verifies the signature, finds nothing to do, and answers
// 200. That exercises DNS, TLS, the middleware, the matcher and the signature
// check — everything between Stripe and the wallet — while touching no wallet,
// no ledger and no subscription.

import { createHmac } from "crypto";

/**
 * A type the dispatcher ignores. Deliberately not in HANDLED_EVENTS: the probe
 * proves the path, never a credit, and an event that credits would make a
 * diagnostic into a transaction.
 */
export const PROBE_EVENT_TYPE = "ping.marketwar.probe";

export type ProbeResult = {
  url: string;
  /** True only when Stripe would have recorded this delivery as successful. */
  ok: boolean;
  status?: number;
  /** Where a redirect pointed, when one came back. Stripe does not follow these. */
  redirectedTo?: string;
  /** What Stripe's own summary would have called this. */
  stripeWouldSee: string;
  /** What to do about it, in one instruction. */
  note: string;
  ms: number;
};

/** Sign a payload the way Stripe signs one, so our verifier treats it as real. */
export function signLikeStripe(payload: string, secret: string, atSec = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${atSec}.${payload}`, "utf8").digest("hex");
  return `t=${atSec},v1=${v1}`;
}

/** The harmless body. Shaped like a Stripe event so the route parses it. */
export function probePayload(now = Date.now()): string {
  return JSON.stringify({
    id: `evt_probe_${now}`,
    type: PROBE_EVENT_TYPE,
    created: Math.floor(now / 1000),
    data: { object: { marketwar_probe: true } },
  });
}

/**
 * Deliver a signed probe to `url` and report what Stripe would have seen.
 *
 * `fetchImpl` is injectable because the outcomes that matter — DNS failure, a
 * 308, a TLS reset — cannot be arranged from a test container, and a branch that
 * can only run in production is a branch nobody has ever run.
 */
export async function probeWebhookEndpoint(
  url: string,
  secret: string,
  deps: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const started = Date.now();
  const done = (r: Omit<ProbeResult, "url" | "ms">): ProbeResult => ({ url, ms: Date.now() - started, ...r });

  if (!secret) {
    return done({
      ok: false, stripeWouldSee: "not attempted",
      note: "No STRIPE_WEBHOOK_SECRET on this deployment, so a signature cannot be produced and the probe would prove nothing.",
    });
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return done({ ok: false, stripeWouldSee: "not attempted", note: `"${url}" is not a URL, so nothing was sent.` });
  }
  if (parsed.protocol !== "https:") {
    return done({ ok: false, stripeWouldSee: "not attempted", note: "Stripe delivers over HTTPS only; this endpoint is not an https:// address." });
  }

  const payload = probePayload();
  const doFetch = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, deps.timeoutMs ?? 10_000));

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      // STRIPE'S OWN HEADERS, because a gate, a firewall or a CDN rule that
      // turns away automated traffic must turn away this request too. Sending a
      // browser-shaped request would make a blocked endpoint look reachable,
      // which is the most expensive way a diagnostic can be wrong.
      headers: {
        "content-type": "application/json",
        "stripe-signature": signLikeStripe(payload, secret),
        "user-agent": "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
      },
      body: payload,
      // NOT FOLLOWED. Stripe does not follow redirects, so following one here
      // would report success for exactly the configuration that is failing.
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = /abort/i.test(msg);
    return done({
      ok: false,
      stripeWouldSee: aborted ? "a timeout" : "\"other errors\" — no HTTP response at all",
      note: aborted
        ? `Nothing answered within the timeout. Stripe gives an endpoint a few seconds; a route that is slow to start is a route that never delivers.`
        : `The request never produced an HTTP response: ${msg}. This is Stripe's "other errors" category, and it happens BEFORE any of our code runs — the host does not resolve, or nothing is serving TLS on it. Check that this exact hostname is attached to the deployment and that DNS points at it.`,
    });
  } finally {
    clearTimeout(timer);
  }

  const status = res.status;
  if (status >= 300 && status < 400) {
    const to = res.headers.get("location") || "";
    return done({
      ok: false, status, redirectedTo: to,
      stripeWouldSee: `a ${status} redirect, which it does not follow`,
      note: `This endpoint redirects to ${to || "another address"}. A browser follows that and the site looks fine; Stripe does not follow it and records every delivery as failed. Point the Stripe endpoint at the address that answers DIRECTLY, or serve both hosts without a redirect.`,
    });
  }
  if (status >= 200 && status < 300) {
    return done({
      ok: true, status,
      stripeWouldSee: "a successful delivery",
      note: "DNS, TLS, the middleware and the signature check all passed, and the route answered 2xx. This is exactly what Stripe needs; the secret configured here matches this endpoint.",
    });
  }
  let body = "";
  try { body = (await res.text()).slice(0, 300); } catch { /* a body we cannot read is not the fault */ }
  if (status === 400) {
    return done({
      ok: false, status,
      stripeWouldSee: "a 400, which it counts as a failed delivery",
      note: `The endpoint was REACHED and rejected the signature. That means this deployment holds a different signing secret from the endpoint at this URL — each endpoint in a Stripe account has its own. Copy this endpoint's secret into STRIPE_WEBHOOK_SECRET. Body: ${body}`,
    });
  }
  return done({
    ok: false, status,
    stripeWouldSee: `an HTTP ${status}`,
    note: `The endpoint was reached and answered ${status}. Stripe treats anything outside 200-299 as a failed delivery and retries. Body: ${body}`,
  });
}
