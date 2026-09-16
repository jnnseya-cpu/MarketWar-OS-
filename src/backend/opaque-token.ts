// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// A TOKEN THAT CARRIES SOMEBODY'S IDENTITY WITHOUT SPELLING IT OUT.
//
// WHAT WAS WRONG. Every tracking pixel, click wrapper and unsubscribe link this
// platform has ever produced carried the recipient's address in the URL:
//
//   /api/track/open?t=bWFya2V0d2F0fHNvbWVib2R5QGV4YW1wbGUuY29tfA.LOCYMglv…
//                     └─ base64url("brandId|somebody@example.com|campaign")
//
// The HMAC after the dot is real and it stops FORGERY. It does nothing about
// READING, because base64 is an encoding and not a cipher. So the address went
// into: our own access logs, every proxy and CDN between the reader and us, the
// Referer header of anything the click redirector forwarded to, and the plain
// text of any message that got forwarded to somebody else. The newsletter path
// had the identical defect in its own function — fixing one instance and leaving
// its twin is a failure this repository has already catalogued.
//
// It also sat oddly beside `backend/crypto.ts`, which encrypts those same
// addresses at rest per tenant, and beside a rule in CLAUDE.md that no secret
// travels in a URL. An email address is not a secret, but it is the personal
// data the encryption-at-rest layer exists to protect, and putting it in a query
// string undoes that protection for anybody who can read a log.
//
// WHAT THIS IS. Authenticated encryption — AES-256-GCM — over the same fields,
// with the key derived by HKDF from the caller's secret and a PURPOSE label. The
// same primitives and idioms as `backend/crypto.ts`, because a second way of
// doing encryption in one codebase is how one of them ends up unreviewed.
//
//   • OPAQUE. The URL carries ciphertext. Nothing can be read out of it without
//     the deployment's secret.
//   • UNFORGEABLE. The GCM tag authenticates; a tampered token fails to open.
//     This replaces the separate HMAC rather than adding to it.
//   • PURPOSE-BOUND. A newsletter unsubscribe token cannot be replayed at the
//     open-tracking endpoint: different purpose, different derived key.
//   • NON-CORRELATABLE. A random IV per token means the same address in two
//     messages produces two unrelated strings, so nobody can tell from the URLs
//     alone that two sends went to the same person.
//
// WHAT IT IS HONESTLY NOT. It is not a stored random id. The ciphertext still
// CONTAINS the address, so an attacker holding both the deployment's secret and
// old logs could read them retroactively. A stored id would not have that
// property — and would cost one datastore write per recipient per send, which on
// a bulk platform is a real cost and a real failure mode: a write that fails
// leaves a dead unsubscribe link. Stateless was the right trade here, and
// stating the residual honestly is part of making it.
//
// THE SECRET MATTERS MORE NOW. With `EMAIL_TRACKING_SECRET` unset the callers
// fall back to a documented default, and a token sealed under a default anybody
// can read from this source is opaque to a log reader and not to a determined
// one. That is acceptable in demo mode and is not acceptable on a deployment
// sending real mail, so `launch-check` raises it there rather than leaving it to
// be discovered.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

/** Format marker. Distinguishes a sealed token from the legacy `base64.hmac` shape. */
export const OPAQUE_PREFIX = "v2";

/**
 * Field separator inside the sealed payload.
 *
 * ASCII UNIT SEPARATOR, not the `|` the legacy format used. A campaign name
 * containing a pipe silently truncated under the old parser — `split("|")` into
 * three consts drops everything after the third field — so a campaign called
 * "spring|summer" came back as "spring". Unit separator cannot occur in a brand
 * id, an address or a campaign name entered through any surface here.
 */
const SEP = "";

function keyFor(secret: string, purpose: string): Buffer {
  // Same construction as `crypto.ts`: HKDF-SHA256, one derived key per purpose,
  // so rotating the secret re-derives everything in one operation and no two
  // purposes ever share key material.
  return Buffer.from(hkdfSync("sha256", secret, "marketwar-os", `token:${purpose}`, 32));
}

/**
 * Seal some fields into an opaque, tamper-proof, URL-safe token.
 *
 * Returns `v2.<base64url(iv ‖ tag ‖ ciphertext)>`.
 */
export function sealToken(parts: readonly string[], purpose: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret, purpose), iv);
  const body = Buffer.concat([cipher.update(parts.join(SEP), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${OPAQUE_PREFIX}.${Buffer.concat([iv, tag, body]).toString("base64url")}`;
}

/** Is this the sealed format? Used to decide whether to try the legacy reader. */
export function isOpaqueToken(token: string): boolean {
  return typeof token === "string" && token.startsWith(`${OPAQUE_PREFIX}.`);
}

/**
 * Open a sealed token, or return NULL.
 *
 * NEVER THROWS. These are read from URLs that anybody can type, so a malformed
 * or tampered token is an ordinary, expected input — and an endpoint that 500s
 * on one hands an attacker a way to fill the error log.
 */
export function openToken(token: string, purpose: string, secret: string): string[] | null {
  if (!isOpaqueToken(token)) return null;
  try {
    // TWO EQUIVALENT MUTANTS LIVE IN THE NEXT TWO LINES, recorded rather than
    // left to look like coverage — a mutation that changes nothing proves
    // nothing, and pretending otherwise is worse than an untested line.
    //
    //  1. `"base64url"` → `"base64"` here survives, because Node's base64
    //     decoder also accepts the URL-safe alphabet. It does NOT survive in
    //     `sealToken`, which is the direction that matters: that is the string
    //     that goes into a URL, and plain base64 would put `+` and `/` in it.
    //  2. The length guard below survives, because `createDecipheriv` and
    //     `setAuthTag` both throw on a short buffer and the catch returns null
    //     anyway. It stays because an explicit rejection is clearer than relying
    //     on an exception from a crypto primitive to mean "malformed".
    const raw = Buffer.from(token.slice(OPAQUE_PREFIX.length + 1), "base64url");
    // 12 IV + 16 tag, and at least one byte of payload.
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret, purpose), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const out = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return out.split(SEP);
  } catch {
    // A wrong key, a wrong purpose, a flipped bit and a truncated paste all land
    // here and are all the same answer: this token is not one of ours.
    return null;
  }
}
