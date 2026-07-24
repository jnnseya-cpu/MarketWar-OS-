// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// DKIM signing (RFC 6376) — the cryptographic heart of being an ESP.
//
// When MarketWar OS sends mail on behalf of a customer's own domain, the message
// MUST carry a DKIM-Signature signed with THAT DOMAIN'S private key, whose public
// half the customer published as a DNS TXT record (see sending-domains.ts). Gmail/
// Outlook verify the signature against DNS; a valid signature + aligned SPF/DMARC
// is what earns the inbox instead of the spam folder. Without it, bulk mail from a
// new domain is rejected outright under the 2024 Gmail/Yahoo bulk-sender rules.
//
// Implements relaxed/relaxed canonicalization with rsa-sha256, using Node's own
// crypto — no third-party dependency. Self-consistent: signRoundTrips() proves the
// produced signature verifies against the matching public key.

import { createHash, createSign, createVerify } from "crypto";

// ---- relaxed body canonicalization (RFC 6376 §3.4.4) ----
export function canonicalizeBodyRelaxed(body: string): string {
  // Normalise line endings to CRLF working space via \n first.
  let b = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Per line: collapse WSP runs to a single SP, strip trailing WSP.
  b = b
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, ""))
    .join("\r\n");
  // Ignore all trailing empty lines; a non-empty body ends with exactly one CRLF.
  b = b.replace(/(\r\n)+$/g, "");
  return b.length ? b + "\r\n" : "";
}

// ---- relaxed header canonicalization (RFC 6376 §3.4.2) ----
function canonicalizeHeaderRelaxed(name: string, value: string): string {
  const n = name.toLowerCase().trim();
  // Unfold (remove CRLF), collapse WSP runs to a single SP, strip trailing WSP,
  // remove WSP around the colon (leading value WSP included).
  const v = value.replace(/\r\n/g, "").replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, "");
  return `${n}:${v}`;
}

export type DkimOptions = {
  domain: string;       // d= — the customer's sending domain
  selector: string;     // s= — the DKIM selector (DNS: <selector>._domainkey.<domain>)
  privateKeyPem: string; // the domain's private key (public half is in DNS)
  headerNames?: string[]; // which headers to sign (order preserved)
};

const DEFAULT_SIGNED = ["from", "to", "subject", "date", "mime-version", "content-type", "message-id"];

// Build the `DKIM-Signature: …` header for a message. `headers` is the exact set
// present in the message (name → value). Returns the full header line (no CRLF).
export function dkimSignature(headers: Record<string, string>, body: string, opts: DkimOptions): string {
  const bodyHash = createHash("sha256").update(canonicalizeBodyRelaxed(body), "utf8").digest("base64");

  // Only sign headers that are actually present, in the requested order.
  const lc: Record<string, { name: string; value: string }> = {};
  for (const [k, v] of Object.entries(headers)) lc[k.toLowerCase()] = { name: k, value: v };
  const want = (opts.headerNames ?? DEFAULT_SIGNED).map((h) => h.toLowerCase());
  const signedNames = want.filter((h) => lc[h] !== undefined);

  // The DKIM-Signature field value with an empty b= (signed last, over itself).
  const dkimHeaderNoB =
    `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${opts.domain}; s=${opts.selector}; ` +
    `h=${signedNames.join(":")}; bh=${bodyHash}; b=`;

  // Canonicalized signed headers, then the DKIM-Signature header itself (relaxed,
  // b= empty, NO trailing CRLF on this final one — RFC 6376 §3.7).
  const canonHeaders = signedNames.map((h) => canonicalizeHeaderRelaxed(lc[h].name, lc[h].value) + "\r\n").join("");
  const toSign = canonHeaders + canonicalizeHeaderRelaxed("dkim-signature", dkimHeaderNoB);

  const signature = createSign("RSA-SHA256").update(toSign, "utf8").sign(opts.privateKeyPem).toString("base64");
  return `DKIM-Signature: ${dkimHeaderNoB}${signature}`;
}

// Self-consistency check used in tests/diagnostics: sign, then verify the produced
// signature against the public key with the identical canonicalization.
export function signRoundTrips(publicKeyPem: string, headers: Record<string, string>, body: string, opts: DkimOptions): boolean {
  const header = dkimSignature(headers, body, opts);
  const b = (header.match(/b=([A-Za-z0-9+/=]+)\s*$/) || [])[1] || "";
  const noB = header.replace(/^DKIM-Signature:\s*/, "").replace(/b=[A-Za-z0-9+/=]+\s*$/, "b=");

  const lc: Record<string, { name: string; value: string }> = {};
  for (const [k, v] of Object.entries(headers)) lc[k.toLowerCase()] = { name: k, value: v };
  const signedNames = (noB.match(/h=([^;]+)/) || [])[1].split(":");
  const canonHeaders = signedNames.map((h) => canonicalizeHeaderRelaxed(lc[h].name, lc[h].value) + "\r\n").join("");
  const toVerify = canonHeaders + canonicalizeHeaderRelaxed("dkim-signature", noB);
  return createVerify("RSA-SHA256").update(toVerify, "utf8").verify(publicKeyPem, Buffer.from(b, "base64"));
}
