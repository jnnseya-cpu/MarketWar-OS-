// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE META CONVERSIONS API — the server's copy of a conversion the browser may
// never have been able to send.
//
// WHAT IT ADDS. The Pixel misses conversions it cannot see: an ad blocker,
// Safari's tracking prevention, a customer who closes the tab before Stripe
// redirects them back, a renewal confirmed by a webhook weeks later with no
// browser involved at all. The server sees every one of those, because the money
// arrived here.
//
// WHAT IT MUST NOT DO, and the two failures are the whole design:
//
//   1. DOUBLE-COUNT. Meta de-duplicates a Pixel event against a Conversions API
//      event when `event_name` AND `event_id` both match. `conversionEventId`
//      derives that id from Stripe's own event id on BOTH sides, so the pair
//      counts once. A random id would make every payment two conversions, the
//      revenue in Ads Manager twice what the bank says, and the bidding trained
//      on it — strictly worse than not having this at all.
//
//   2. SEND WITHOUT CONSENT. A server-to-server call bypasses the cookie banner,
//      Consent Mode, the ad blocker and the browser's own tracking prevention.
//      It is the one tracking path a person cannot refuse by any means available
//      to them, which is exactly why it is gated on a DURABLE consent record
//      (`analytics-consent.ts`) and sends nothing without one.
//
// WHAT NEVER LEAVES THIS FILE IN PLAINTEXT. Meta matches on hashed identifiers,
// so the email is SHA-256'd here and the digest is what travels. The plaintext
// is never logged, never returned, and never put in an error message — a failure
// line quoting the address it failed on is the leak the hashing was for.

import { createHash } from "crypto";
import {
  buildCapiEvent, normaliseEmail, normalisePhone, conversionEventId,
  type CapiEvent, type RawUserData,
} from "@/shared/capi";
import { mayReportConversions } from "@/backend/analytics-consent";

// READ AT CALL TIME, NOT AT MODULE LOAD.
//
// A module-level `const` snapshots the environment when the first request happens
// to import this file, so an operator who sets META_CAPI_TEST_CODE — which is a
// switch they flip while watching Events Manager → Test Events, and unset again
// twenty minutes later — would find it took effect only on the next cold start.
// A toggle that needs a redeploy is not a toggle. It also made the ON and OFF
// states untestable in one process, which is how the "a test code is actually
// sent" branch went unproven: `import("…?x=1")` resolves to the same module, so
// there is no second instance to load with different settings.
const graphVersion = () => process.env.META_GRAPH_VERSION || "v21.0";
const pixelId = () => (process.env.NEXT_PUBLIC_META_PIXEL_ID || "1080646761094543").trim();
const accessToken = () => (process.env.META_CAPI_ACCESS_TOKEN || "").trim();
/** Events Manager → Test Events. Present only while somebody is watching. */
const testCode = () => (process.env.META_CAPI_TEST_CODE || "").trim();

/**
 * A single HTTP call still has a timeout, and that is not a limit on effort.
 *
 * The effort law's own note: a socket held open forever eats the whole
 * invocation and the customer gets nothing. A conversion report is also the
 * LEAST important thing a webhook does — the money is already credited — so it
 * must never be what makes the webhook time out and Stripe redeliver.
 */
const TIMEOUT_MS = 6_000;

/**
 * Is server-side conversion reporting switched on?
 *
 * A FUNCTION, not a constant, for the reason above: a deployment that gains a
 * token must not need a cold start to notice.
 */
export const capiConfigured = (): boolean => Boolean(accessToken() && pixelId());

/** Meta's hash: SHA-256 of the normalised value, lowercase hex. */
function sha256(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

/**
 * Hash what can be hashed, drop what cannot.
 *
 * A DIGEST OF RUBBISH IS STILL A DISCLOSURE. Hashing "n/a" or a local phone
 * number produces a string that matches nobody and is still a value handed to an
 * advertising network for no benefit, so `normalise*` returns null and the key is
 * simply absent. Absent is honest; a digest that matches nothing looks like data.
 */
export function hashUserData(raw: RawUserData): Record<string, string> {
  const out: Record<string, string> = {};
  const em = normaliseEmail(raw.email);
  if (em) out.em = sha256(em);
  const ph = normalisePhone(raw.phone);
  if (ph) out.ph = sha256(ph);
  return out;
}

export type CapiResult =
  | { sent: true; eventId: string; received: number; fbTraceId?: string }
  | { sent: false; why: string; retriable?: boolean };

export type SendInput = {
  /** A MarketWar money event: `subscribe`, `topup`, `purchase`. */
  name: string;
  /** Stripe's event id for the payment. The de-duplication key both sides use. */
  stripeEventId: string;
  /** The account the payment belongs to. No account → no consent → no send. */
  uid: string | null | undefined;
  value?: number;
  currency?: string;
  plan?: string | null;
  atMs?: number;
  nowMs?: number;
  /** Identifiers, in plaintext. Hashed here and never logged. */
  user?: RawUserData;
  sourceUrl?: string;
};

/**
 * Report one conversion to Meta, or say why not.
 *
 * NEVER THROWS. The caller is a Stripe webhook whose actual job — crediting the
 * wallet — has already succeeded by the time this runs. A conversion report
 * failing must not turn a successful payment into a 500 and a redelivery.
 */
export async function sendCapiConversion(input: SendInput): Promise<CapiResult> {
  if (!capiConfigured()) {
    return { sent: false, why: "META_CAPI_ACCESS_TOKEN is not set, so server-side conversions are off. The browser Pixel still reports what it can see." };
  }

  // CONSENT FIRST, BEFORE ANYTHING IS EVEN ASSEMBLED. Checking it last would
  // leave a version of this function one edit away from sending without it.
  const permitted = await mayReportConversions(input.uid).catch((e) => ({
    ok: false,
    why: `consent could not be read (${e instanceof Error ? e.message : "store error"}), and a consent we cannot read is a consent we do not have`,
  }));
  if (!permitted.ok) return { sent: false, why: permitted.why };

  const nowMs = input.nowMs ?? Date.now();
  const built = buildCapiEvent({
    name: input.name,
    stripeEventId: input.stripeEventId,
    atMs: input.atMs ?? nowMs,
    nowMs,
    value: input.value,
    currency: input.currency,
    plan: input.plan,
    hashed: hashUserData(input.user ?? {}),
    clientIp: input.user?.clientIp,
    userAgent: input.user?.userAgent,
    fbp: input.user?.fbp,
    fbc: input.user?.fbc,
    sourceUrl: input.sourceUrl,
  });
  if (!built.ok) return { sent: false, why: built.why };

  return await postEvents([built.event]);
}

/** The Graph call, kept separate so it can be driven with a built event. */
export async function postEvents(events: CapiEvent[]): Promise<CapiResult> {
  if (!capiConfigured()) return { sent: false, why: "META_CAPI_ACCESS_TOKEN is not set." };
  if (!events.length) return { sent: false, why: "no events to send" };

  const code = testCode();
  const url = `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(pixelId())}/events`;
  const body = {
    data: events,
    ...(code ? { test_event_code: code } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken()}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* keep the text */ }
    const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;

    if (!res.ok) {
      // READ META'S REFUSAL, DO NOT GUESS AT IT — the same rule
      // `provider-failure.ts` applies to the AI providers. A bad token, a pixel
      // the token cannot write to and a malformed event are three different
      // remedies, and they arrive as the same HTTP status.
      const err = (obj.error && typeof obj.error === "object" ? obj.error : {}) as Record<string, unknown>;
      const message = typeof err.message === "string" ? err.message : text.slice(0, 300);
      const code = typeof err.code === "number" ? err.code : res.status;
      // 5xx and a throttle are worth another attempt; a rejected event is not.
      const retriable = res.status >= 500 || res.status === 429 || code === 2 || code === 4 || code === 17;
      return { sent: false, why: `Meta refused the conversion (${res.status}, code ${code}): ${message}`, retriable };
    }

    const received = typeof obj.events_received === "number" ? obj.events_received : 0;
    if (received < events.length) {
      // ACCEPTED BUT NOT ALL OF THEM. Reported rather than read as success: "200"
      // is not the same as "counted", and this platform has shipped that
      // confusion on a money path before.
      return { sent: false, why: `Meta accepted the request but counted ${received} of ${events.length} events.` };
    }
    return {
      sent: true,
      eventId: events[0].event_id,
      received,
      ...(typeof obj.fbtrace_id === "string" ? { fbTraceId: obj.fbtrace_id } : {}),
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      sent: false,
      why: aborted
        ? `Meta did not answer within ${TIMEOUT_MS}ms. The payment is credited and the browser Pixel may already have reported it; this copy was dropped rather than holding the webhook open.`
        : `Could not reach Meta: ${e instanceof Error ? e.message : "network error"}`,
      retriable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** What a health report should say about this, without echoing any secret. */
export function capiStatus(): { configured: boolean; pixelId: string; testMode: boolean; note: string } {
  const id = pixelId();
  const code = testCode();
  return {
    configured: capiConfigured(),
    // A pixel id is public in the page source of every site that runs one.
    pixelId: id ? `${id.slice(0, 4)}…${id.slice(-4)}` : "",
    testMode: Boolean(code),
    note: capiConfigured()
      ? (code
        ? "Server-side conversions are on and tagged with a TEST code, so they appear in Events Manager → Test Events and do NOT count as real conversions. Unset META_CAPI_TEST_CODE to go live."
        : "Server-side conversions are on, de-duplicated against the browser Pixel on Stripe's event id, and sent only for accounts with a stored analytics consent.")
      : "Server-side conversions are off. Set META_CAPI_ACCESS_TOKEN (Events Manager → Settings → Conversions API → Generate access token). The browser Pixel still reports what it can see.",
  };
}

/** Re-exported so a caller never derives the de-duplication key itself. */
export { conversionEventId };
