// THE FREE AUDIT IS FOR A PERSON CHECKING THEIR OWN SITE.
//
// Owner directive: stop companies and people running the free audit as a
// business — auditing other people's sites in volume, reselling the report, or
// grinding it for data. Personal usage only, unless there is an active paid
// subscription, in which case it is unlimited.
//
// ---------------------------------------------------------------------------
// THE NUMBERS, AND HOW TWO INSTRUCTIONS THAT CONFLICT WERE RESOLVED
// ---------------------------------------------------------------------------
//
// As given: "1 ip address can only check 1 address many times (10) Max" and
// "1 ip address can audit 3 websites 5 times each max". Those cannot both be
// the same budget — the first allows ten of one site, the second allows fifteen
// across three. Read as three INDEPENDENT caps, both sentences are satisfied
// exactly and the strictest one binds:
//
//   PER SITE      10   one address, ten times — the first sentence, literally
//   SITES          3   three websites — the second sentence, literally
//   TOTAL         15   3 × 5, so "five times each" is the shape of a full spread
//
// A person checking their own site gets ten looks. Somebody spreading across
// three sites gets five each. Somebody trying ten on each of three sites is
// stopped at fifteen. Every one of these is a named constant below; changing
// the policy is changing a number, not rewriting a rule.
//
// ---------------------------------------------------------------------------
// WHAT MAKES THIS ACTUALLY HOLD, RATHER THAN LOOK LIKE IT DOES
// ---------------------------------------------------------------------------
//
// THE SITE KEY IS THE REGISTRABLE DOMAIN, NOT THE URL. This is the whole ball
// game. If `example.com`, `www.example.com`, `example.com/about` and
// `example.com/?1` count as four different websites, then the three-site cap is
// bypassed by typing a question mark, and the limit is decoration. Everything
// is reduced to one host, lower-cased, `www.` stripped, port and path and query
// discarded.
//
// ONLY A REAL AUDIT COUNTS. A crawl that was refused by the site — a 403 behind
// Cloudflare, a domain that does not resolve — must not spend somebody's
// allowance. They received nothing; charging them for it would mean a person
// whose host blocks us loses their free audits without ever seeing one.
//
// A SHARED ADDRESS IS A REAL PROBLEM AND IS HANDLED. An office, a school or a
// mobile carrier puts hundreds of people behind one address, and three sites per
// ninety days would lock all of them out. So the counter is keyed on the ACCOUNT
// when somebody is signed in, and only falls back to the address when they are
// not. Signing in is also the escape hatch we can point a blocked person at.

export const AUDIT_QUOTA = {
  /** One address, this many times. */
  perSite: 10,
  /** Distinct websites in the window. */
  sites: 3,
  /** Ceiling across everything, so `sites × perSite` cannot be reached. */
  total: 15,
  /** The window, in days. */
  windowDays: 90,
} as const;

/** One completed audit, as stored. Never the raw address — see `backend/audit-quota.ts`. */
export type AuditUse = {
  /** Registrable domain, already normalised by `siteKey`. */
  site: string;
  /** ISO timestamp. */
  at: string;
};

/**
 * Reduce any address a person types to ONE key per website.
 *
 * Returns "" when there is no host to speak of, which the caller treats as
 * un-countable rather than as a site named "".
 */
export function siteKey(rawUrl: string): string {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  let host = "";
  try {
    host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return "";
  }
  host = host.toLowerCase().replace(/\.$/, "");
  // `www.` is not a different website. Nothing else is stripped: `shop.x.com`
  // and `x.com` genuinely are different sites, and a public-suffix list is the
  // only correct way to go further — which is a dependency this does not need,
  // because the cap it protects is three.
  host = host.replace(/^www\./, "");
  return host;
}

export type QuotaVerdict =
  | { allowed: true; unlimited: boolean; reason: string; usedForSite: number; sitesUsed: number; totalUsed: number; remainingForSite: number }
  | { allowed: false; unlimited: false; reason: string; hit: "per_site" | "sites" | "total"; usedForSite: number; sitesUsed: number; totalUsed: number; resetsAt: string };

/**
 * May this person audit this site right now?
 *
 * Pure: history in, verdict out. Every branch is drivable without a database,
 * which is the only way the money-shaped edges of this get tested.
 */
export function checkQuota(input: {
  history: AuditUse[];
  site: string;
  nowISO: string;
  /** An active paid subscription. Unlimited, and no history is even consulted. */
  paid?: boolean;
}): QuotaVerdict {
  const site = input.site;
  const now = Date.parse(input.nowISO) || Date.now();

  if (input.paid) {
    return {
      allowed: true, unlimited: true,
      reason: "Unlimited audits are part of your plan.",
      usedForSite: 0, sitesUsed: 0, totalUsed: 0, remainingForSite: Number.POSITIVE_INFINITY,
    };
  }

  // Only what is still inside the window counts. Anything older is not deleted
  // here — this function does not own storage — it simply stops counting.
  const windowMs = AUDIT_QUOTA.windowDays * 24 * 60 * 60_000;
  const live = input.history.filter((u) => {
    const t = Date.parse(u.at);
    return Number.isFinite(t) && now - t < windowMs;
  });

  const forSite = live.filter((u) => u.site === site);
  const sites = new Set(live.map((u) => u.site));
  const usedForSite = forSite.length;
  const sitesUsed = sites.size;
  const totalUsed = live.length;

  // WHEN THE DOOR REOPENS. The oldest use inside the window is what has to age
  // out, so this is a real date rather than "in ninety days" — somebody refused
  // on their ninth day should be told the ninth day, not the ninetieth.
  const oldest = live.map((u) => Date.parse(u.at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const resetsAt = new Date((oldest ?? now) + windowMs).toISOString();

  const refuse = (hit: "per_site" | "sites" | "total", reason: string): QuotaVerdict =>
    ({ allowed: false, unlimited: false, reason, hit, usedForSite, sitesUsed, totalUsed, resetsAt });

  // ORDER MATTERS, because the reason is what the person acts on. The most
  // specific true statement is the most useful one: "you have checked this site
  // ten times" tells them something "you have used your fifteen" does not.
  if (usedForSite >= AUDIT_QUOTA.perSite) {
    return refuse("per_site", `You have already audited ${site} ${usedForSite} times. That is the free limit for one address — the page has not changed ${AUDIT_QUOTA.perSite} times since you started.`);
  }
  if (totalUsed >= AUDIT_QUOTA.total) {
    return refuse("total", `You have used all ${AUDIT_QUOTA.total} free audits. The free audit is for checking your own site, not for auditing sites in volume.`);
  }
  // Only refuse a NEW site once the site allowance is spent. A fourth site is
  // refused; the three already used stay available, which is why this is checked
  // after the per-site count above.
  if (!sites.has(site) && sitesUsed >= AUDIT_QUOTA.sites) {
    return refuse("sites", `You have already audited ${sitesUsed} different websites. The free audit covers ${AUDIT_QUOTA.sites} — it is for checking your own site, not for running audits as a service.`);
  }

  return {
    allowed: true, unlimited: false,
    reason: "",
    usedForSite, sitesUsed, totalUsed,
    remainingForSite: Math.max(0, Math.min(AUDIT_QUOTA.perSite - usedForSite, AUDIT_QUOTA.total - totalUsed)),
  };
}

/**
 * What to say to somebody who has run out.
 *
 * This is the platform's main acquisition surface, so a refusal here is the one
 * moment a genuinely interested person is most likely to pay — and the worst
 * possible thing to show them is a bare "limit reached". It names what they
 * used, when it comes back, and what a plan changes.
 */
export function quotaRefusalCopy(v: Extract<QuotaVerdict, { allowed: false }>): { headline: string; detail: string; cta: string } {
  const back = new Date(v.resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return {
    headline:
      v.hit === "sites" ? "That is a fourth website"
        : v.hit === "per_site" ? "You have checked this one a lot"
          : "You have used your free audits",
    detail: `${v.reason} Your free audits come back on ${back}. If you are checking sites for clients or for work, that is exactly what a plan is for — it lifts the limit entirely, and it comes with the engines that fix what the audit finds.`,
    cta: "See the plans",
  };
}
