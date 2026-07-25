import { NextResponse } from "next/server";

// Stripe self-diagnostic — is the money path live? Reports which Stripe env vars
// are present (booleans only) and validates the secret key by calling Stripe
// read-only (GET /v1/balance), reporting live-vs-test mode and the exact error
// if the key is rejected. This is the definitive "can we take payment?" probe.
//
// SAFE: read-only balance lookup; never returns the key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const present = {
    STRIPE_SECRET_KEY: Boolean(secret),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  };
  const keyMode = secret.startsWith("sk_live") ? "live" : secret.startsWith("sk_test") ? "test" : secret ? "unknown" : "none";

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

  const verdict = !secret
    ? "RED — no Stripe key; cannot take payment (demo mode)."
    : !(probe as { ok?: boolean }).ok
      ? "RED — Stripe key present but rejected (see fix)."
      : keyMode === "live"
        ? (present.STRIPE_WEBHOOK_SECRET ? "GREEN — live key + webhook secret set. You can take real payments and revenue auto-attributes." : "AMBER — live key works, but STRIPE_WEBHOOK_SECRET is missing: payments will charge, but subscriptions/credits won't auto-activate until the webhook is configured (Stripe → Developers → Webhooks → add /api/webhooks/stripe).")
        : "AMBER — key works but is in TEST mode. Set a LIVE key to take real money.";

  return NextResponse.json({ service: "stripe", verdict, keyMode, present, probe });
}
