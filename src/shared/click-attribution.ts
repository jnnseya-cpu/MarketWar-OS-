// WHICH ADVERT CLICK A PAYMENT BELONGS TO.
//
// THE PROBLEM. A Conversions API event sent from a Stripe webhook has no browser
// behind it: no cookies, no IP, no user agent. The best it can match on is the
// account's email, and an email match tells Meta *that a customer bought* without
// telling it *which advert click that customer arrived from* — which is the one
// question an ad campaign is paying to have answered.
//
// Meta's own identifiers for that are two cookies the Pixel sets in the browser:
//
//   _fbp  the browser id. Set by the Pixel on first visit, no click required.
//   _fbc  the CLICK id. Set when somebody lands with `?fbclid=…` on the URL, so
//         it exists only for a visitor who actually came from a Meta advert —
//         which makes it the single most valuable identifier here.
//
// So they are read off the request when checkout STARTS (the browser is present
// then), stamped into the Stripe session metadata, and read back out by the
// webhook hours or weeks later. The click survives the gap.
//
// NEITHER IS PERSONAL DATA IN THE SENSE THE HASHING PROTECTS. They are Meta's own
// opaque identifiers, issued by Meta's own script, and they go back to Meta
// unhashed because that is the format Meta matches them in — hashing them would
// simply break the match. They are still only sent for a customer with a recorded
// consent, like everything else.

/** Meta's cookie names. Public, documented, and stable for years. */
export const FBP_COOKIE = "_fbp";
export const FBC_COOKIE = "_fbc";

export type ClickIds = { fbp?: string; fbc?: string };

/**
 * `_fbp` / `_fbc` out of a Cookie header.
 *
 * VALIDATED, NOT JUST READ. Both have a documented shape — `fb.1.<ms>.<random>`
 * — and anything else is either a different cookie that happens to share the name
 * or something a caller put there. Meta rejects a malformed value, and a rejected
 * event is a rejected request rather than a conversion, so a bad one is dropped
 * here instead of being sent and refused.
 */
export function clickIdsFromCookie(cookieHeader: string | null | undefined): ClickIds {
  const out: ClickIds = {};
  const header = cookieHeader || "";
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== FBP_COOKIE && name !== FBC_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try { value = decodeURIComponent(value); } catch { /* use it as it arrived */ }
    if (!isMetaClickId(value)) continue;
    if (name === FBP_COOKIE) out.fbp = value;
    else out.fbc = value;
  }
  return out;
}

/** `fb.<subdomainIndex>.<creationMs>.<payload>` — Meta's documented format. */
export function isMetaClickId(v: string | null | undefined): boolean {
  const s = (v || "").trim();
  if (!s || s.length > 400) return false;
  const m = /^fb\.(\d)\.(\d{10,16})\.([A-Za-z0-9_-]+)$/.exec(s);
  return Boolean(m);
}

/**
 * Stripe metadata keys. Prefixed like every other MarketWar key on a session.
 *
 * Stripe caps a metadata VALUE at 500 characters, which both of these are well
 * inside, and caps a session at 50 keys. Two more is safe.
 */
export const FBP_META_KEY = "marketwar_fbp";
export const FBC_META_KEY = "marketwar_fbc";

/** The metadata pairs to stamp, or nothing when there is no click to carry. */
export function clickMetadata(ids: ClickIds): Record<string, string> {
  const out: Record<string, string> = {};
  if (ids.fbp && isMetaClickId(ids.fbp)) out[FBP_META_KEY] = ids.fbp;
  if (ids.fbc && isMetaClickId(ids.fbc)) out[FBC_META_KEY] = ids.fbc;
  return out;
}

/**
 * The click ids back out of a Stripe event's metadata.
 *
 * RE-VALIDATED ON THE WAY OUT. Metadata is a free-text store; by the time it is
 * read the value has been through Stripe's API and could have been edited in the
 * dashboard. Trusting a round trip is how a value that was checked once arrives
 * unchecked, which is this codebase's first defect class.
 */
export function clickIdsFromMetadata(meta: Record<string, unknown> | undefined): ClickIds {
  const out: ClickIds = {};
  const fbp = meta?.[FBP_META_KEY];
  const fbc = meta?.[FBC_META_KEY];
  if (typeof fbp === "string" && isMetaClickId(fbp)) out.fbp = fbp;
  if (typeof fbc === "string" && isMetaClickId(fbc)) out.fbc = fbc;
  return out;
}
