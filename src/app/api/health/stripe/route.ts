import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { verifyStripeSignature, MAIN_DOMAIN, STRIPE_WEBHOOK_PATH } from "@/backend/stripe-billing";
import { classifyEndpoints } from "@/shared/stripe-endpoints";

// Stripe self-diagnostic — is the money path live? Reports which Stripe env vars
// are present (booleans only) and validates the secret key by calling Stripe
// read-only (GET /v1/balance), reporting live-vs-test mode and the exact error
// if the key is rejected. This is the definitive "can we take payment?" probe.
//
// SAFE: read-only balance lookup; never returns the key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const present = {
    STRIPE_SECRET_KEY: Boolean(secret),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  };
  // Recognise both standard (sk_) and restricted (rk_) keys, live vs test.
  const keyMode = /^(sk|rk)_live/.test(secret) ? "live" : /^(sk|rk)_test/.test(secret) ? "test" : secret ? "unknown" : "none";

  let probe: Record<string, unknown> = { ran: false, note: "No STRIPE_SECRET_KEY — payments run in demo mode (no real charges)." };
  if (secret) {
    try {
      const res = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${secret}` } });
      if (res.ok) probe = { ran: true, ok: true, keyMode, note: `Stripe key valid (${keyMode} mode). Checkout links + subscriptions will charge for real${keyMode === "test" ? " — but in TEST mode (no real money). Switch to a live key to take real payments." : "."}` };
      else {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        probe = { ran: true, ok: false, keyMode, error: j.error?.message || `HTTP ${res.status}`, fix: "The Stripe secret key is invalid or revoked. Copy a fresh one from Stripe → Developers → API keys and set STRIPE_SECRET_KEY in Vercel." };
      }
    } catch (e) { probe = { ran: true, ok: false, error: (e as Error).message, fix: "Server couldn't reach Stripe — a network/egress issue on the host." }; }
  }

  // -------------------------------------------------------------------------
  // THE WEBHOOK, DIAGNOSED WITHOUT LEAVING THE SERVER.
  //
  // Reported as "stripe webhook is not working" while the Stripe dashboard
  // showed the endpoint Active with 246 events delivered. Everything a person
  // can check from outside said it was fine, so the three things that can
  // actually be wrong are checked here instead — none of which needs the secret
  // to be shown, or Stripe to be called.
  // -------------------------------------------------------------------------
  const whsec = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

  // 1. SHAPE. A truncated paste, a quoted value, or the API key pasted into the
  //    webhook slot all fail every delivery with an indistinguishable 400.
  const shape = !whsec
    ? { ok: false, note: "STRIPE_WEBHOOK_SECRET is not set. In production the route refuses every event with a 500 rather than accept an unsigned one." }
    : !whsec.startsWith("whsec_")
      ? { ok: false, note: `The value does not start with "whsec_" (it starts "${whsec.slice(0, 3)}…"). A signing secret is not the API key, and it is not the endpoint id.` }
      : whsec.length < 32
        ? { ok: false, note: `Only ${whsec.length} characters — a Stripe signing secret is longer than that, so this looks truncated.` }
        : { ok: true, note: `Well formed: whsec_ prefix, ${whsec.length} characters.` };

  // 2. ROUND TRIP. Sign a payload with the configured secret and put it through
  //    the SAME verifier the webhook uses. This proves the secret and the
  //    verifier agree. It CANNOT prove the secret matches the endpoint in
  //    Stripe — only Stripe knows that — and it says so rather than implying it.
  let roundTrip: Record<string, unknown> = { ran: false, note: "No secret to test." };
  if (whsec) {
    const t = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: "evt_selftest", type: "ping" });
    const v1 = createHmac("sha256", whsec).update(`${t}.${payload}`, "utf8").digest("hex");
    const verdictSelf = verifyStripeSignature(payload, `t=${t},v1=${v1}`, whsec, 300, t);
    roundTrip = {
      ran: true, ok: verdictSelf.valid, reason: verdictSelf.reason,
      note: verdictSelf.valid
        ? "The configured secret and the verifier agree. This does NOT prove the secret belongs to the endpoint Stripe is posting to — if this account has several webhook endpoints, each has its own signing secret and copying the wrong one fails every delivery with a signature mismatch. Compare it against the endpoint's own secret in Stripe."
        : "The verifier rejected a signature this server produced with its own secret, which means the secret itself is unusable.",
    };
  }

  // 3. THE URL. Stripe does NOT follow redirects: if it posts to a host that
  //    308s to another, every delivery is recorded as failed. The canonical
  //    domain in the code is the apex, so a deployment served on www is exactly
  //    that mismatch — and this compares the code's answer with the host this
  //    very request arrived on, which is the only host that is certainly real.
  const servingHost = (req.headers.get("host") || "").trim().toLowerCase();
  const configuredUrl = `https://${MAIN_DOMAIN}${STRIPE_WEBHOOK_PATH}`;
  const servingUrl = servingHost ? `https://${servingHost}${STRIPE_WEBHOOK_PATH}` : "";
  const hostMatches = Boolean(servingHost) && servingHost === MAIN_DOMAIN;
  const endpointUrl = {
    inCode: configuredUrl,
    servingThisRequest: servingUrl,
    matches: hostMatches,
    note: hostMatches
      ? "The host serving this request is the one the code names, so the URL in Stripe should be this exact address."
      : servingHost
        ? `MISMATCH. This request arrived on "${servingHost}" but the code names "${MAIN_DOMAIN}". Stripe does not follow redirects, so if its endpoint is set to the other host and that host redirects, every delivery is recorded as failed with nothing reaching this route. Set the Stripe endpoint to ${servingUrl} — or make both hosts serve without a redirect.`
        : "No Host header on this request, so the serving host could not be compared.",
  };

  // 4. WHICH ENDPOINTS DOES THIS ACCOUNT ACTUALLY HAVE?
  //
  // This is the question the diagnostic could not answer and the one that
  // matters: the account has SEVEN webhook endpoints, each with its own signing
  // secret, and copying the wrong one fails every delivery with a signature
  // mismatch that looks identical to a wrong URL. Stripe will list them
  // read-only, and it does NOT return signing secrets on a list — only on
  // create — so this can name the endpoints without ever handling a secret.
  //
  // With the list in hand, "which of the seven is mine" stops being a guess:
  // the one whose URL matches the host serving this request is the one whose
  // secret belongs in STRIPE_WEBHOOK_SECRET.
  let endpoints: Record<string, unknown> = { ran: false, note: "No STRIPE_SECRET_KEY, so the account's endpoints cannot be listed." };
  if (secret) {
    try {
      const res = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=100", { headers: { Authorization: `Bearer ${secret}` } });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        endpoints = { ran: true, ok: false, error: j.error?.message || `HTTP ${res.status}`, note: "A restricted key without webhook read permission will fail here; that is not itself a fault." };
      } else {
        const j = (await res.json().catch(() => ({}))) as { data?: unknown };
        const rows = Array.isArray(j.data) ? j.data : [];
        // The classification is pure and lives in `shared/stripe-endpoints.ts`,
        // because inline here it could only be exercised with a live Stripe key
        // — and a branch that can only run in production is an untested branch.
        endpoints = { ran: true, ok: true, ...classifyEndpoints({ rows, servingHost, webhookPath: STRIPE_WEBHOOK_PATH }) };
      }
    } catch (e) {
      endpoints = { ran: true, ok: false, error: (e as Error).message, note: "Could not reach Stripe to list endpoints." };
    }
  }

  const webhook = present.STRIPE_WEBHOOK_SECRET;
  const verdict = !secret
    ? "RED — no Stripe key; cannot take payment (demo mode)."
    : !(probe as { ok?: boolean }).ok
      ? "RED — Stripe key present but rejected (see fix)."
      : keyMode === "live"
        ? (webhook
            ? "GREEN — live key + webhook secret set. You can take real payments and revenue auto-attributes."
            : "AMBER — live key charges for real, but STRIPE_WEBHOOK_SECRET is missing, so subscriptions/credits won't auto-activate on payment. Add the webhook: Stripe → Developers → Webhooks → add endpoint /api/webhooks/stripe → copy its signing secret.")
      : keyMode === "test"
        ? "AMBER — key works but is a TEST key (no real money). Set a LIVE key to charge."
        : `AMBER — key valid but its mode couldn't be determined (likely a restricted key). If it's a LIVE key you can charge${webhook ? "" : "; also set STRIPE_WEBHOOK_SECRET so subscriptions/credits auto-activate"}. If it's a TEST key, no real money moves.`;

  return NextResponse.json({
    service: "stripe",
    verdict,
    keyMode,
    present,
    probe,
    webhookDiagnostic: {
      secretShape: shape,
      signatureRoundTrip: roundTrip,
      endpointUrl,
      accountEndpoints: endpoints,
      whatThisCannotSee: "The signing secrets themselves — Stripe returns those only when an endpoint is created, so no diagnostic can compare them for you. `accountEndpoints` narrows it to the ONE endpoint whose secret should be in STRIPE_WEBHOOK_SECRET; reveal that endpoint's secret in Stripe and compare it by eye. Also invisible here: what status Stripe recorded per delivery. Open a failed event in Stripe and read the response body — this route returns the reason in it.",
    },
  });
}
