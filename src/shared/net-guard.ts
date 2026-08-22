// WHERE A USER-SUPPLIED URL IS NOT ALLOWED TO POINT.
//
// `/api/audit` is public, unauthenticated, and fetches whatever address it is
// given — that is the entire point of a free website audit. It rate-limited the
// CALLER and never checked the DESTINATION, so it would fetch
// http://169.254.169.254/ (the cloud metadata service, which hands out
// credentials), anything on 127.0.0.1, and any hostname resolving inside the
// deployment's own network. The report then returns the page title, meta
// description and content back to whoever asked, so it is not even blind: the
// response comes out.
//
// Pure and in `shared` so every rule here is testable without a socket. The DNS
// resolution and the redirect chain live in the crawler, which is the only place
// that can do them — but nothing decides what is BLOCKED except this file, so
// there is one rulebook rather than one per caller.

/** Parsed IPv4 as four octets, or null when it is not a dotted quad. */
function ipv4Octets(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/**
 * True for any address that must never be reached on a stranger's behalf:
 * loopback, private ranges, link-local (which is where cloud metadata lives),
 * carrier-grade NAT, broadcast and the reserved blocks.
 */
export function isPrivateAddress(raw: string): boolean {
  const host = (raw || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true; // nothing is not a safe destination

  // IPv6 forms, including the IPv4-mapped ones that smuggle 127.0.0.1 past a
  // check that only understands dotted quads.
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    // AND THE HEX FORM, WHICH IS THE ONE THAT ACTUALLY ARRIVES. `new URL()`
    // rewrites http://[::ffff:127.0.0.1]/ to ::ffff:7f00:1, so a check that only
    // understands the dotted-quad spelling never sees loopback at all.
    const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16), lo = parseInt(hex[2], 16);
      return isPrivateAddress(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
    }
    // fc00::/7 unique-local, fe80::/10 link-local.
    if (/^f[cd]/.test(host)) return true;
    if (/^fe[89ab]/.test(host)) return true;
    return false;
  }

  const o = ipv4Octets(host);
  if (!o) return false; // a name, not a literal — the caller resolves it first
  const [a, b] = o;
  if (a === 0) return true;                              // 0.0.0.0/8
  if (a === 10) return true;                             // private
  if (a === 127) return true;                            // loopback
  if (a === 169 && b === 254) return true;               // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;      // private
  if (a === 192 && b === 168) return true;               // private
  if (a === 100 && b >= 64 && b <= 127) return true;     // carrier-grade NAT
  if (a === 192 && b === 0) return true;                 // 192.0.0.0/24 special
  if (a >= 224) return true;                             // multicast + reserved + broadcast
  return false;
}

/**
 * THE ONLY RELAXATION, AND IT IS DELIBERATELY NARROW.
 *
 * `allowLoopback` permits 127.0.0.0/8, ::1 and `localhost` — nothing else. The
 * test suite serves a real page on 127.0.0.1 to drive the audit end to end, and
 * an audit that cannot be exercised against a real page is an audit whose wiring
 * is proved by greps, which is how the send got lost in the first place.
 *
 * It does NOT relax the link-local range, so the cloud metadata service at
 * 169.254.169.254 — the address that actually hands out credentials — stays
 * blocked in every environment including this one. The crawler passes it only
 * when NODE_ENV is "test".
 */
export type GuardOptions = { allowLoopback?: boolean };

function isLoopback(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  const o = ipv4Octets(host);
  return Boolean(o && o[0] === 127);
}

/** Hostnames that never belong to a customer's public website. */
const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];
const BLOCKED_NAMES = new Set(["localhost", "metadata", "metadata.google.internal"]);

/**
 * The reason this URL may not be fetched, or null when it is allowed.
 *
 * Returns a SENTENCE, because this is shown to a member of the public who most
 * likely mistyped something, and "blocked" on its own reads like the audit is
 * broken.
 */
export function blockedUrlReason(rawUrl: string, opts: GuardOptions = {}): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return "That does not look like a website address.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return "Only http and https addresses can be audited.";
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (opts.allowLoopback && isLoopback(host)) return null;
  if (BLOCKED_NAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return "That address is on a private network, so there is nothing there to audit from the public internet.";
  }
  if (isPrivateAddress(host)) {
    return "That address is on a private network, so there is nothing there to audit from the public internet.";
  }
  return null;
}

/** The same verdict for an address DNS returned. Kept separate so the crawler's
 *  post-resolution check reads as the deliberate second gate that it is. */
export function blockedAddressReason(ip: string, opts: GuardOptions = {}): string | null {
  if (opts.allowLoopback && isLoopback(ip)) return null;
  return isPrivateAddress(ip)
    ? "That website's address resolves to a private network, so it cannot be audited from here."
    : null;
}

/** How many redirects to follow before giving up. Each hop is re-checked. */
export const MAX_REDIRECTS = 5;
