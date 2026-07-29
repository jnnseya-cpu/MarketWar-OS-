// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Live email-authentication check for a sending domain.
//
// The Deliverability Commander used to end every report with
//
//     "Next: send me the sending domain so I can check its live SPF/DKIM/DMARC
//      records."
//
// which is a dead end twice over: the domain was already typed into the form
// above it, and there was nowhere to reply. The advice was right — auth first,
// then warm-up — but the customer was left holding it with no way to act.
//
// So the platform does the check itself. These are PUBLIC DNS records; reading
// them needs no credential, no key and no permission, and it turns "publish SPF,
// DKIM and DMARC" from homework into a screen that says which of the three are
// missing and exactly what to paste into the DNS panel.
//
// DNS-over-HTTPS is used rather than node:dns because a serverless function has
// no reliable resolver, and because DoH returns the same answers a receiving
// mail server would see.

export type RecordCheck = {
  id: "spf" | "dkim" | "dmarc" | "mx" | "bimi";
  label: string;
  status: "pass" | "warn" | "fail" | "unknown";
  value: string | null;
  /** What this being wrong actually costs the sender. */
  impact: string;
  /** The exact fix, ready to paste. */
  fix?: { host: string; type: "TXT" | "CNAME"; value: string };
  detail: string;
};

export type DomainAuthReport = {
  domain: string;
  checked: boolean;
  /** Can this domain send bulk email today without being filtered? */
  readyToSend: boolean;
  score: number;             // 0-100, weighted by what receivers actually enforce
  checks: RecordCheck[];
  blockers: string[];
  summary: string;
  error?: string;
};

/** Reduce anything the customer typed — a URL, an email, a bare host — to a domain. */
export function normaliseDomain(input: string): string {
  let s = (input || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("@")) s = s.split("@").pop() || "";
  s = s.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  s = s.replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}

type DohAnswer = { name: string; type: number; data: string };

// Cloudflare first, Google as a fallback — a single resolver outage must not
// turn into "your DNS is broken", which would send the owner editing records
// that were already correct.
const RESOLVERS = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];

/**
 * A lookup result that distinguishes "no such record" from "could not ask".
 *
 * Returning a bare empty array for both is how this reported "NOT ready to send —
 * 3 authentication records are missing" for a domain whose DNS it never actually
 * reached. Telling a customer their SPF is missing when you could not look is
 * worse than saying nothing: they go and edit records that were already correct,
 * and the one thing a deliverability tool must never do is manufacture an alarm.
 */
export type DnsLookup = { answers: DohAnswer[]; resolved: boolean };

export async function dnsQuery(name: string, type: "TXT" | "MX" | "CNAME", timeoutMs = 6_000): Promise<DnsLookup> {
  for (const base of RESOLVERS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${base}?name=${encodeURIComponent(name)}&type=${type}`, {
        signal: ctrl.signal,
        headers: { Accept: "application/dns-json" },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = (await res.json().catch(() => ({}))) as { Answer?: DohAnswer[] };
      // A resolver that answered has told us the truth, including "nothing here".
      return { answers: Array.isArray(data.Answer) ? data.Answer : [], resolved: true };
    } catch { /* try the next resolver */ }
  }
  // Every resolver refused or timed out. We know nothing about this name.
  return { answers: [], resolved: false };
}

/** TXT records come back quoted and split into 255-char chunks; join them back up. */
function txtValues(answers: DohAnswer[]): string[] {
  return answers
    .filter((a) => a.type === 16)
    .map((a) => a.data.replace(/^"|"$/g, "").replace(/"\s+"/g, ""));
}

// DKIM lives at <selector>._domainkey, and the selector is chosen by whoever
// sends the mail. There is no way to enumerate them, so the common ones are
// probed — enough to tell "DKIM is set up" from "nothing is signed".
const DKIM_SELECTORS = [
  "default", "google", "selector1", "selector2", "k1", "k2", "mail", "dkim",
  "s1", "s2", "smtp", "mandrill", "mailjet", "sendgrid", "zoho", "protonmail",
  "postmark", "mailerlite", "ses", "amazonses", "sparkpost", "brevo", "sib",
  "marketwar", "mw",
];

/** The lookup function, injectable so both outcomes can be tested without a network. */
export type LookupFn = (name: string, type: "TXT" | "MX" | "CNAME") => Promise<DnsLookup>;

export async function checkDomainAuth(
  rawDomain: string,
  deps: { lookup?: LookupFn } = {},
): Promise<DomainAuthReport> {
  const lookup: LookupFn = deps.lookup ?? ((n, t) => dnsQuery(n, t));
  const domain = normaliseDomain(rawDomain);
  const empty: DomainAuthReport = {
    domain: domain || rawDomain, checked: false, readyToSend: false, score: 0,
    checks: [], blockers: [], summary: "",
  };
  if (!domain) {
    return { ...empty, error: "That is not a domain. Give the domain you send FROM — evandeli.com, not a page on it." };
  }

  const [txtL, mxL, dmarcL] = await Promise.all([
    lookup(domain, "TXT"),
    lookup(domain, "MX"),
    lookup(`_dmarc.${domain}`, "TXT"),
  ]);

  // If not one resolver answered, we have no information — and an absence of
  // information is not a finding. Say so and stop.
  if (!txtL.resolved && !mxL.resolved && !dmarcL.resolved) {
    return {
      ...empty,
      checked: false,
      error: `Could not reach a DNS resolver, so ${domain}'s authentication could not be checked. This says nothing about your records — do not change them on the strength of this. Try again shortly.`,
      summary: `${domain} was not checked — DNS was unreachable from this deployment.`,
    };
  }

  const txt = txtL.answers, mx = mxL.answers, dmarcTxt = dmarcL.answers;
  const checks: RecordCheck[] = [];

  // --- MX: does the domain receive mail at all? -----------------------------
  const mxHosts = mx.filter((a) => a.type === 15).map((a) => a.data);
  checks.push({
    id: "mx",
    label: "MX — can this domain receive mail",
    status: mxHosts.length ? "pass" : "warn",
    value: mxHosts.length ? mxHosts.slice(0, 3).join(", ") : null,
    impact: "A domain that cannot receive mail looks abandoned to a spam filter, and you never see the replies or the bounces.",
    detail: mxHosts.length
      ? `${mxHosts.length} mail server${mxHosts.length === 1 ? "" : "s"} configured.`
      : "No MX record. Replies to your campaign will bounce and receivers treat send-only domains with suspicion.",
  });

  // --- SPF: which servers may send as this domain? --------------------------
  const spf = txtValues(txt).find((v) => /^v=spf1\b/i.test(v)) || null;
  const spfLookups = spf ? (spf.match(/\b(include|a|mx|ptr|exists|redirect):?/gi) || []).length : 0;
  const spfSoft = spf ? /~all\s*$/.test(spf) : false;
  const spfNone = spf ? /\+all\s*$/.test(spf) : false;
  checks.push({
    id: "spf",
    label: "SPF — who is allowed to send as you",
    status: !spf ? "fail" : spfNone ? "fail" : spfLookups > 10 ? "warn" : "pass",
    value: spf,
    impact: "Without SPF, Gmail and Outlook cannot tell your mail from someone forging your domain — bulk sends go to spam or are rejected outright.",
    fix: !spf ? { host: "@", type: "TXT", value: "v=spf1 include:_spf.google.com ~all" } : undefined,
    detail: !spf
      ? "No SPF record published. This is the single most common reason a cold domain gets spam-foldered."
      : spfNone
        ? "SPF ends in +all, which authorises the entire internet to send as you. That is worse than having none."
        : spfLookups > 10
          ? `SPF has ${spfLookups} lookups — the limit is 10, and over it receivers treat SPF as permanently failing.`
          : `Published${spfSoft ? " (soft fail ~all, which is the normal setting)" : ""}.`,
  });

  // --- DKIM: is the mail cryptographically signed? --------------------------
  const dkimHits = (
    await Promise.all(
      DKIM_SELECTORS.map(async (sel) => {
        const a = await lookup(`${sel}._domainkey.${domain}`, "TXT");
        const v = txtValues(a.answers).find((t) => /v=DKIM1|p=/i.test(t));
        return v ? sel : null;
      }),
    )
  ).filter(Boolean) as string[];
  checks.push({
    id: "dkim",
    label: "DKIM — is your mail signed",
    status: dkimHits.length ? "pass" : "fail",
    value: dkimHits.length ? dkimHits.map((s) => `${s}._domainkey`).join(", ") : null,
    impact: "DMARC needs SPF or DKIM to pass. Unsigned mail cannot be forwarded without breaking authentication, and Gmail requires it for bulk senders.",
    detail: dkimHits.length
      ? `Signed — found on selector${dkimHits.length === 1 ? "" : "s"} ${dkimHits.join(", ")}.`
      : `No DKIM key found on ${DKIM_SELECTORS.length} common selectors. If you sign with a custom selector this check can miss it — otherwise your mail is unsigned. Your sending provider issues the record to publish.`,
  });

  // --- DMARC: what should a receiver do when auth fails? --------------------
  const dmarc = txtValues(dmarcTxt).find((v) => /^v=DMARC1\b/i.test(v)) || null;
  const policy = dmarc ? (dmarc.match(/\bp=(none|quarantine|reject)\b/i)?.[1] || "").toLowerCase() : "";
  checks.push({
    id: "dmarc",
    label: "DMARC — your policy when checks fail",
    status: !dmarc ? "fail" : policy === "none" ? "warn" : "pass",
    value: dmarc,
    impact: "Since February 2024 Gmail and Yahoo require DMARC from anyone sending bulk mail. Without it, volume sending is filtered regardless of how good your list is.",
    fix: !dmarc
      ? { host: "_dmarc", type: "TXT", value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` }
      : policy === "none"
        ? { host: "_dmarc", type: "TXT", value: dmarc.replace(/\bp=none\b/i, "p=quarantine") }
        : undefined,
    detail: !dmarc
      ? "No DMARC record. This alone blocks compliant bulk sending to Gmail and Yahoo."
      : policy === "none"
        ? "Policy is p=none — it monitors but enforces nothing. Correct for the first two weeks, then move to p=quarantine."
        : `Enforcing (p=${policy}).`,
  });

  // --- BIMI: optional, shows your logo beside the message -------------------
  const bimi = txtValues((await lookup(`default._bimi.${domain}`, "TXT")).answers).find((v) => /^v=BIMI1\b/i.test(v)) || null;
  checks.push({
    id: "bimi",
    label: "BIMI — your logo in the inbox (optional)",
    status: bimi ? "pass" : "unknown",
    value: bimi,
    impact: "Cosmetic, but it lifts open rates and only works once DMARC is enforcing — so it is a reward for doing the rest properly.",
    detail: bimi ? "Published." : "Not set. Worth doing after DMARC reaches p=quarantine or p=reject, not before.",
  });

  // Weighted by what receivers actually enforce: DMARC and SPF gate delivery,
  // DKIM is required for bulk, MX is hygiene, BIMI is cosmetic and scores nothing.
  const weights: Record<RecordCheck["id"], number> = { spf: 30, dkim: 30, dmarc: 30, mx: 10, bimi: 0 };
  // Half credit is for a record that EXISTS and is weak (DMARC on p=none, SPF
  // over the lookup limit). A record that is absent earns nothing — otherwise a
  // domain with no authentication at all scores above zero, which reads as
  // "partly set up" when it is not set up.
  const score = checks.reduce((n, c) => {
    if (c.status === "pass") return n + weights[c.id];
    if (c.status === "warn" && c.value) return n + weights[c.id] * 0.5;
    return n;
  }, 0);

  const blockers = checks
    .filter((c) => c.status === "fail" && c.id !== "bimi")
    .map((c) => `${c.label.split(" — ")[0]}: ${c.detail}`);

  const readyToSend = blockers.length === 0;
  return {
    domain,
    checked: true,
    readyToSend,
    score: Math.round(score),
    checks,
    blockers,
    summary: readyToSend
      ? `${domain} is authenticated and can carry a warmed-up bulk send${policy === "none" ? " — move DMARC to p=quarantine once you have two weeks of clean reports." : "."}`
      : `${domain} is NOT ready to send: ${blockers.length} authentication record${blockers.length === 1 ? " is" : "s are"} missing. Publish ${blockers.length === 1 ? "it" : "them"} first — sending before this burns the domain's reputation permanently, and reputation is the one thing you cannot buy back.`,
  };
}
