// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// EACH PLATFORM SIGNS DIFFERENTLY, AND ALL THREE ARE UNFORGIVING.
//
// Shopify sends base64 HMAC-SHA256, WooCommerce sends base64 HMAC-SHA256 with a
// different header and a different secret, Stripe sends its own timestamped
// scheme. Getting any of them slightly wrong fails closed — which is safe — but
// getting the RAW BODY wrong fails closed too and looks identical, and that is
// where a day disappears. All three sign the exact bytes received; parsing and
// re-serialising changes key order and whitespace and the signature never
// matches again.
//
// Every one of these endpoints creates money owed, so every one refuses when its
// secret is absent rather than trusting the caller.

import { createHmac, timingSafeEqual } from "crypto";

export type Verdict = { valid: boolean; reason?: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8"); const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

/** Shopify: `X-Shopify-Hmac-Sha256`, base64 HMAC-SHA256 of the raw body. */
export function verifyShopify(rawBody: string, header: string | null | undefined, secret?: string): Verdict {
  const key = (secret ?? process.env.SHOPIFY_WEBHOOK_SECRET ?? "").trim();
  if (!key) return { valid: false, reason: "SHOPIFY_WEBHOOK_SECRET is not set, so a Shopify order cannot be proved genuine." };
  const sig = (header || "").trim();
  if (!sig) return { valid: false, reason: "No X-Shopify-Hmac-Sha256 header." };
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  return safeEqual(sig, expected) ? { valid: true } : { valid: false, reason: "Shopify signature did not match the body." };
}

/** WooCommerce: `X-WC-Webhook-Signature`, base64 HMAC-SHA256 of the raw body. */
export function verifyWoo(rawBody: string, header: string | null | undefined, secret?: string): Verdict {
  const key = (secret ?? process.env.WOO_WEBHOOK_SECRET ?? "").trim();
  if (!key) return { valid: false, reason: "WOO_WEBHOOK_SECRET is not set, so a WooCommerce order cannot be proved genuine." };
  const sig = (header || "").trim();
  if (!sig) return { valid: false, reason: "No X-WC-Webhook-Signature header." };
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  return safeEqual(sig, expected) ? { valid: true } : { valid: false, reason: "WooCommerce signature did not match the body." };
}

/**
 * Stripe: `Stripe-Signature: t=<unix>,v1=<hex>` over `${t}.${rawBody}`.
 *
 * The timestamp is checked as well as the signature. Without that, a signature
 * captured once is valid forever and an old order can be replayed to accrue a
 * second commission — the signature would be perfectly genuine.
 */
export function verifyStripeWebhook(
  rawBody: string,
  header: string | null | undefined,
  nowMs: number,
  secret?: string,
  toleranceSec = 300,
): Verdict {
  const key = (secret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!key) return { valid: false, reason: "STRIPE_WEBHOOK_SECRET is not set, so a Stripe event cannot be proved genuine." };
  const raw = (header || "").trim();
  if (!raw) return { valid: false, reason: "No Stripe-Signature header." };

  const parts = Object.fromEntries(
    raw.split(",").map((p) => { const [k, ...v] = p.split("="); return [k.trim(), v.join("=").trim()]; }),
  ) as Record<string, string>;
  const t = Number(parts.t);
  const v1 = parts.v1 || "";
  if (!Number.isFinite(t) || !v1) return { valid: false, reason: "Stripe-Signature header is malformed." };

  const ageSec = Math.abs(nowMs / 1000 - t);
  if (ageSec > toleranceSec) {
    return { valid: false, reason: `Stripe event is ${Math.round(ageSec)}s old, outside the ${toleranceSec}s window — a replayed event carries a genuine signature.` };
  }
  const expected = createHmac("sha256", key).update(`${t}.${rawBody}`, "utf8").digest("hex");
  return safeEqual(v1, expected) ? { valid: true } : { valid: false, reason: "Stripe signature did not match the body." };
}
