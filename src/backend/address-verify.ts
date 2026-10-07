// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// REMOVE THE ADDRESSES THAT WILL BOUNCE — BEFORE THE SEND, NOT AFTER IT.
//
// THE DEFECT, MEASURED. `validateAddress` checked three things: the syntax, a
// list of twelve disposable domains, and the in-process suppression set. It
// never asked whether the DOMAIN COULD RECEIVE MAIL AT ALL. Driven:
//
//   dave@gmial.com                              hygiene=SENDABLE   real MX=NONE
//   dave@acme-plumbing-does-not-exist-xyz.co.uk hygiene=SENDABLE   real MX=NONE
//
// Both went out. Both are guaranteed hard bounces, and a hard bounce is the most
// expensive thing a sender can do: it is charged against the sending domain's
// reputation at every large receiver, and the reputation is SHARED with every
// other tenant on this platform's pool. One customer's list of mistyped
// addresses degrades everybody's inbox placement.
//
// WHAT THIS CHECKS, AND WHAT IT DELIBERATELY DOES NOT CLAIM.
//
//   • IT ANSWERS: does anything, anywhere, accept mail for this domain? That is
//     a DNS question with a definite answer — an MX record, or (RFC 5321 §5.1)
//     an A/AAAA record acting as an implicit MX. No route means every message to
//     every address at that domain hard-bounces, with no exceptions and no
//     waiting to find out.
//   • IT DOES NOT ANSWER: does this particular mailbox exist? That needs an SMTP
//     conversation with the receiving host, and this platform will not do it:
//     most hosts accept-all and answer `250` for every address, Gmail and
//     Microsoft refuse callouts from addresses they do not know, and the probe
//     is made FROM our sending IP — so a verification run would spend the
//     reputation it is supposed to protect. A domain that accepts mail is
//     reported as exactly that, and never as a verified mailbox.
//
// AND AN UNKNOWN ANSWER NEVER REMOVES AN ADDRESS. A resolver timeout, a SERVFAIL
// or a rate-limited lookup means we do not know; silently dropping a real
// customer because a DNS server was slow is a worse failure than a bounce,
// because nobody ever finds out it happened. Only a definite negative removes.

import { typoCorrection, domainOf } from "@/shared/mailbox-class";

/** Why a domain cannot take mail, or why we could not tell. */
export type MailRouteKind =
  /** An MX record exists. */
  | "mx"
  /** No MX, but an A/AAAA record — RFC 5321's implicit MX. Mail is deliverable. */
  | "implicit-a"
  /** The domain does not exist. Every address at it is dead, permanently. */
  | "nxdomain"
  /** The domain exists and publishes no way to receive mail. */
  | "no-mail-route"
  /** We could not find out. NEVER a reason to remove an address. */
  | "lookup-failed";

export type MailRoute = {
  domain: string;
  /** TRUE when something accepts mail for this domain. */
  accepts: boolean;
  /**
   * `certain` — the DNS answered definitively and the verdict is safe to act on.
   * `unknown` — the lookup failed. The address is KEPT.
   */
  certainty: "certain" | "unknown";
  kind: MailRouteKind;
  hosts: string[];
  note: string;
};

/** How long a resolved domain is trusted. A fixed DNS record does not change often. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** A failure is re-asked much sooner — it is usually transient. */
const FAILURE_TTL_MS = 5 * 60 * 1000;
/** Per-query, and `tries` is 1: a slow resolver must not hold up a campaign. */
const DNS_TIMEOUT_MS = Number(process.env.MW_DNS_TIMEOUT_MS || 4000);
/** Lookups in flight at once. Enough to clear a 250-address batch quickly. */
const CONCURRENCY = 12;

const cache = new Map<string, { at: number; route: MailRoute }>();

/** Exposed for the driver and the tests: a cold cache is the measured case. */
export function clearMailRouteCache(): void {
  cache.clear();
}

/**
 * Put a known answer in the cache, so a caller that already has one does not
 * pay for a lookup.
 *
 * WHY THIS EXISTS, STATED PLAINLY: the test suite must not depend on DNS. Once
 * the preview and the send resolve every domain, a test whose fixture uses
 * `example.com` gets a different answer with the network than without it — and
 * `example.com` publishes a NULL MX (RFC 7505, "this domain accepts no mail"),
 * so the real answer is "undeliverable" and the fixture's intent is something
 * else entirely. A suite whose result depends on whether a resolver replied is
 * not a suite.
 *
 * THIS IS NOT A TEST-ONLY CODE PATH. It writes the same cache production reads,
 * so it cannot make the platform behave differently — it can only skip a query.
 * Nothing in `src/` calls it; the drivers and the tests do, and the real DNS
 * behaviour is driven for real in `npm run drive:deliver`.
 */
export function primeMailRoute(domain: string, route: Partial<MailRoute> & { accepts: boolean }): void {
  const d = domain.trim().toLowerCase();
  cache.set(d, {
    at: Date.now(),
    route: {
      domain: d, accepts: route.accepts,
      certainty: route.certainty ?? "certain",
      kind: route.kind ?? (route.accepts ? "mx" : "no-mail-route"),
      hosts: route.hosts ?? [],
      note: route.note ?? (route.accepts
        ? `Mail for ${d} is accepted (a known answer, supplied rather than looked up).`
        : `${d} accepts no mail (a known answer, supplied rather than looked up).`),
    },
  });
}

async function lookup(domain: string): Promise<MailRoute> {
  const d = domain.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!d || !d.includes(".")) {
    return { domain: d, accepts: false, certainty: "certain", kind: "no-mail-route", hosts: [],
      note: `"${d}" is not a domain, so nothing can accept mail for it.` };
  }

  const { Resolver } = await import("dns/promises");
  // A resolver of our own, so the timeout is OURS. The default resolver retries
  // for several seconds per query, which on a 250-address batch is minutes of a
  // 45-second send budget spent waiting for names that do not exist.
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });

  try {
    const mx = await resolver.resolveMx(d);
    const hosts = mx
      .filter((m) => m.exchange && m.exchange !== ".")   // RFC 7505 "null MX" is a refusal
      .sort((a, b) => a.priority - b.priority)
      .map((m) => m.exchange.replace(/\.$/, ""));
    if (hosts.length) {
      return { domain: d, accepts: true, certainty: "certain", kind: "mx", hosts,
        note: `Mail for ${d} is delivered to ${hosts[0]}.` };
    }
    // RFC 7505: a single "." MX means the domain explicitly accepts no mail.
    return { domain: d, accepts: false, certainty: "certain", kind: "no-mail-route", hosts: [],
      note: `${d} publishes a null MX record, which means it accepts no mail by design.` };
  } catch (err) {
    const code = (err as { code?: string }).code || "";
    if (code === "ENOTFOUND" || code === "NXDOMAIN") {
      return { domain: d, accepts: false, certainty: "certain", kind: "nxdomain", hosts: [],
        note: `${d} does not exist. Every address at it hard-bounces.` };
    }
    if (code !== "ENODATA" && code !== "ENOTIMP") {
      // TIMEOUT, SERVFAIL, REFUSED, a rate limit — we do not know.
      return { domain: d, accepts: true, certainty: "unknown", kind: "lookup-failed", hosts: [],
        note: `The DNS lookup for ${d} failed (${code || "no code"}), so whether it accepts mail is unknown. The address is kept — a slow resolver is not evidence against a customer.` };
    }
  }

  // NO MX. Not the end of the question: RFC 5321 §5.1 says a host with an
  // address record and no MX is its own mail exchanger, and small business
  // domains do still rely on it. Checking only MX would delete deliverable
  // addresses, which is the same class of mistake as sending to dead ones.
  try {
    const a = await resolver.resolve4(d).catch(() => resolver.resolve6(d));
    if (a && a.length) {
      return { domain: d, accepts: true, certainty: "certain", kind: "implicit-a", hosts: a.slice(0, 2),
        note: `${d} publishes no MX but does publish an address record, which RFC 5321 treats as an implicit mail exchanger. Deliverable, though a domain in this state is often misconfigured.` };
    }
  } catch { /* falls through to the definite negative below */ }

  return { domain: d, accepts: false, certainty: "certain", kind: "no-mail-route", hosts: [],
    note: `${d} exists but publishes no MX and no address record, so nothing anywhere accepts mail addressed to it.` };
}

/** One domain's mail route, cached. */
export async function mailRoute(domain: string): Promise<MailRoute> {
  const key = domain.trim().toLowerCase();
  const hit = cache.get(key);
  const ttl = hit && hit.route.certainty === "unknown" ? FAILURE_TTL_MS : CACHE_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.route;
  const route = await lookup(key);
  cache.set(key, { at: Date.now(), route });
  return route;
}

/**
 * Why an address was removed. `typo` is not a mail-route verdict at all, and
 * finding that out is the most useful thing this module measured.
 *
 * MEASURED, NOT ASSUMED: `gmial.com` resolves to a live web server, and
 * `gnail.com` publishes REAL MX RECORDS at mx1.oweb.cn. Typo-squatters run
 * catch-all mail servers precisely to collect misdirected mail. So a mistyped
 * consumer domain usually does NOT bounce — it DELIVERS, to a stranger, and
 * what it delivers is the customer's campaign plus the fact that they are
 * sending one. Spam traps live at exactly these domains.
 *
 * That is worse than a bounce, so the typo check is applied BEFORE and
 * INDEPENDENTLY of the mail route: a domain one letter away from `gmail.com` is
 * not mailed however well it resolves.
 */
export type RemovalKind = MailRouteKind | "typo";

export type RemovedAddress = {
  email: string;
  domain: string;
  kind: RemovalKind;
  /** Why it was removed, in the customer's terms. */
  reason: string;
  /**
   * What the domain was probably meant to be — `gmial.com` → `gmail.com`.
   *
   * OFFERED, NEVER APPLIED. Rewriting an address somebody typed is a guess about
   * their intent, and a wrong guess mails a stranger who never asked for
   * anything. The customer corrects it; the platform only points at it.
   */
  suggestion?: string;
  /**
   * TRUE when the domain does not exist, so the address can never work and is
   * worth remembering. A domain that merely has no mail route today may be
   * mid-setup, so it is skipped for this send and asked again next time.
   */
  permanent: boolean;
};

export type VerifyResult = {
  /** Addresses whose domain accepts mail, or whose lookup we could not complete. */
  deliverable: string[];
  removed: RemovedAddress[];
  /** Domains looked up in this run, for the report. */
  domainsChecked: number;
  /** Lookups that could not be completed. Their addresses were KEPT. */
  unknown: number;
  note: string;
};

/**
 * Drop the addresses that cannot possibly be delivered.
 *
 * Grouped by DOMAIN before any lookup, so a list of 250 addresses at 40
 * companies is 40 DNS queries and not 250 — and the cache makes the second
 * campaign to the same list nearly free.
 */
export async function verifyRecipients(emails: readonly string[]): Promise<VerifyResult> {
  const addresses = emails.map((e) => String(e ?? "").trim().toLowerCase()).filter(Boolean);
  const byDomain = new Map<string, string[]>();
  for (const a of addresses) {
    const d = domainOf(a);
    if (!d) continue;
    // A known typo domain is removed below whatever the DNS says, so looking it
    // up is a query spent on an answer nothing reads.
    if (typoCorrection(d)) continue;
    const list = byDomain.get(d);
    if (list) list.push(a); else byDomain.set(d, [a]);
  }

  const domains = [...byDomain.keys()];
  const routes = new Map<string, MailRoute>();
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const slice = domains.slice(i, i + CONCURRENCY);
    const got = await Promise.all(slice.map((d) => mailRoute(d)));
    slice.forEach((d, n) => routes.set(d, got[n]));
  }

  const deliverable: string[] = [];
  const removed: RemovedAddress[] = [];
  let unknown = 0;

  for (const a of addresses) {
    const d = domainOf(a);

    // THE TYPO CHECK COMES FIRST, and it ignores the mail route entirely. See
    // `RemovalKind`: a mistyped consumer domain usually accepts mail — that is
    // the business model of a typo-squatter — so waiting for a bounce verdict
    // means delivering the campaign to one.
    const corrected = typoCorrection(d);
    if (corrected) {
      removed.push({
        email: a, domain: d, kind: "typo",
        reason: `${d} is one letter from ${corrected}, and domains like it are registered to collect mail sent to them by mistake — `
          + `so this would most likely be DELIVERED to a stranger rather than bounce. Not sent.`,
        suggestion: a.replace(`@${d}`, `@${corrected}`),
        permanent: true,
      });
      continue;
    }

    const route = routes.get(d);
    if (!route) { deliverable.push(a); continue; }
    if (route.certainty === "unknown") { unknown++; deliverable.push(a); continue; }
    if (route.accepts) { deliverable.push(a); continue; }
    removed.push({
      email: a, domain: d, kind: route.kind,
      reason: route.note,
      permanent: route.kind === "nxdomain",
    });
  }

  return {
    deliverable, removed, domainsChecked: domains.length, unknown,
    // THE ALL-CLEAR MUST NOT COVER A CHECK THAT DID NOT RUN. Driven: with one
    // SERVFAIL and one good address this read "All 2 address(es) are at domains
    // that accept mail", because the unknown-lookup sentence was only appended
    // when something had been removed. A note that reports a pass for a lookup
    // that never completed is the defect class this codebase keeps producing,
    // and it was in the module written to end it.
    note: removed.length === 0
      ? unknown
        ? `${addresses.length - unknown} of ${addresses.length} address(es) are at domains confirmed to accept mail. `
          + `${unknown} lookup(s) could not be completed and those addresses were KEPT — an unanswered DNS query is not evidence against an address.`
        : `All ${addresses.length} address(es) are at domains that accept mail (${domains.length} domain(s) checked).`
      : `${removed.length} of ${addresses.length} address(es) were removed before sending`
        + (removed.some((r) => r.kind === "typo")
          ? `: ${removed.filter((r) => r.kind === "typo").length} at a mistyped domain (delivered to a stranger, not bounced)`
          : "")
        + (removed.some((r) => r.kind !== "typo")
          ? `${removed.some((r) => r.kind === "typo") ? " and" : ":"} ${removed.filter((r) => r.kind !== "typo").length} at a domain nothing accepts mail for`
          : "")
        + `. ${deliverable.length} remain.`
      + (unknown ? ` ${unknown} lookup(s) could not be completed and those addresses were KEPT — an unanswered DNS query is not evidence against an address.` : ""),
  };
}
