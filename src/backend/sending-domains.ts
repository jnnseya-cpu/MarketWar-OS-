// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Sending-domain authentication — the ESP control plane.
//
// To send mail AS a customer's own domain (from + reply-to on their address,
// replies landing in their own inbox), the domain must be authenticated. This
// module: (1) generates a per-domain DKIM keypair, (2) produces the EXACT DNS
// records the customer publishes (DKIM public key, SPF include, DMARC, an aligned
// bounce/Return-Path CNAME, and a tracking CNAME), (3) persists the domain +
// private key per brand, and (4) VERIFIES the records with live DNS lookups so a
// domain only goes "verified" when the world can actually see the records.
//
// The private key never leaves the server and is never returned to the client.
// What physically delivers the signed mail — the MTA node with a warmed dedicated
// IP + reverse DNS — is infrastructure, configured via env (see MW_SENDING_HOST /
// MW_SPF_INCLUDE / MW_DMARC_RUA / MW_BOUNCE_HOST / MW_TRACK_HOST). The software
// here is provider-agnostic: point it at our own relay and there is no third party.

import { generateKeyPairSync } from "crypto";
import { resolveTxt, resolveCname } from "dns/promises";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { replySubdomain } from "@/backend/reply-routing";

// Infra hostnames the published records reference. Defaults point at the
// marketwaros.com sending infrastructure; override per environment.
const SENDING_HOST = (process.env.MW_SENDING_HOST || "smtp.marketwaros.com").trim();
const SPF_INCLUDE = (process.env.MW_SPF_INCLUDE || "_spf.marketwaros.com").trim();
const DMARC_RUA = (process.env.MW_DMARC_RUA || "dmarc@marketwaros.com").trim();
const BOUNCE_HOST = (process.env.MW_BOUNCE_HOST || "bounces.marketwaros.com").trim();
const TRACK_HOST = (process.env.MW_TRACK_HOST || "track.marketwaros.com").trim();
const SELECTOR = "mwos";
// The receiving node. Only ever used on a subdomain the customer creates.
const MX_HOST = (process.env.MW_MX_HOST || "mx.marketwaros.com").trim();

export type DnsRecord = {
  purpose: "DKIM" | "SPF" | "DMARC" | "Return-Path (bounce)" | "Tracking" | "Replies (MX)";
  type: "TXT" | "CNAME" | "MX";
  host: string;   // the name to create (fully qualified)
  value: string;  // the value to publish
  required: boolean;
  verified?: boolean;
  detail?: string;
};

export type SendingDomain = {
  brandId: string;
  ownerId?: string;       // the account that authenticated it — lets a domain
                          // survive a brand-id change (recovery, no "all gone")
  domain: string;         // e.g. "veryx.com"
  selector: string;       // DKIM selector
  publicKey: string;      // base64 SPKI DER (goes in the DKIM TXT record)
  privateKeyPem: string;  // SERVER-ONLY — never returned to the client
  status: "pending" | "verified";
  createdAt: string;
  verifiedAt?: string;
};

// Public view — the private key is stripped.
export type SendingDomainView = Omit<SendingDomain, "privateKeyPem"> & { records: DnsRecord[] };

const mem = new Map<string, SendingDomain>(); // key: brandId::domain

const norm = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
const key = (brandId: string, domain: string) => `${brandId}::${norm(domain)}`;
const docId = (k: string) => k.replace(/[/.]/g, "_");

function pemToTxtPublicKey(publicKeyPem: string): string {
  return publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

// The exact records the customer must publish, with live-verify status filled by verify().
export function recordsFor(d: Pick<SendingDomain, "domain" | "selector" | "publicKey">): DnsRecord[] {
  const domain = norm(d.domain);
  return [
    {
      purpose: "DKIM", type: "TXT", required: true,
      host: `${d.selector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${d.publicKey}`,
    },
    {
      purpose: "SPF", type: "TXT", required: true,
      host: domain,
      value: `v=spf1 include:${SPF_INCLUDE} ~all`,
    },
    {
      purpose: "DMARC", type: "TXT", required: true,
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=none; rua=mailto:${DMARC_RUA}; adkim=s; aspf=s`,
    },
    {
      purpose: "Return-Path (bounce)", type: "CNAME", required: false,
      host: `${SELECTOR}bounce.${domain}`,
      value: BOUNCE_HOST,
    },
    {
      purpose: "Tracking", type: "CNAME", required: false,
      host: `email.${domain}`,
      value: TRACK_HOST,
    },
    // REPLIES. Everything above proves we may SEND as this domain; not one of
    // them tells a mail server where to deliver anything addressed TO it, which
    // is why replies used to vanish. This is the only record that fixes that,
    // and it is deliberately OPTIONAL and deliberately on a SUBDOMAIN: a
    // business domain almost always has MX records already, and repointing the
    // root would not add replies to this platform, it would delete the
    // company's email. `reply.<domain>` does not exist until they create it, so
    // publishing it cannot change where any existing mail goes. Without it,
    // replies still work — they arrive at the brand's address on our own reply
    // host instead of one that reads as theirs.
    {
      purpose: "Replies (MX)", type: "MX", required: false,
      host: replySubdomain(domain),
      value: `10 ${MX_HOST}`,
      detail: "Optional. Lets replies come back to an address on your own domain and appear in your Inbox here. It is a subdomain, so it cannot affect the email your company already receives.",
    },
  ];
}

export async function addDomain(brandId: string, domainRaw: string, ownerId?: string): Promise<SendingDomainView> {
  const domain = norm(domainRaw);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Enter a valid domain, e.g. yourbusiness.com");

  const existing = await getDomain(brandId, domain);
  if (existing) {
    // Backfill ownerId on a pre-owner record so it becomes recoverable.
    if (ownerId && !existing.ownerId) { existing.ownerId = ownerId; await save(existing); }
    return toView(existing);
  }

  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const rec: SendingDomain = {
    brandId, ...(ownerId ? { ownerId } : {}), domain, selector: SELECTOR,
    publicKey: pemToTxtPublicKey(publicKey),
    privateKeyPem: privateKey,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await save(rec);
  return toView(rec);
}

// Owner-scoped list — every domain the account authenticated, regardless of which
// brand it was added under. This is the recovery path so a brand-id change can
// never make a verified domain silently disappear.
export async function listDomainsForOwner(ownerId: string): Promise<SendingDomainView[]> {
  if (!ownerId) return [];
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("sending_domains").where("ownerId", "==", ownerId).limit(100).get();
    return snap.docs.map((s) => toView(s.data() as SendingDomain));
  }
  return [...mem.values()].filter((d) => d.ownerId === ownerId).map(toView);
}

export async function getDomain(brandId: string, domainRaw: string): Promise<SendingDomain | null> {
  const k = key(brandId, domainRaw);
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("sending_domains").doc(docId(k)).get();
    return snap.exists ? (snap.data() as SendingDomain) : null;
  }
  return mem.get(k) ?? null;
}

export async function listDomains(brandId: string): Promise<SendingDomainView[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("sending_domains").where("brandId", "==", brandId).limit(100).get();
    return snap.docs.map((s) => toView(s.data() as SendingDomain));
  }
  return [...mem.values()].filter((d) => d.brandId === brandId).map(toView);
}

// The verified sending identity for a brand's From domain, used by the mailer to
// DKIM-sign. Returns null if the domain isn't authenticated yet.
export async function signingFor(brandId: string, fromDomain: string): Promise<{ domain: string; selector: string; privateKeyPem: string } | null> {
  const d = await getDomain(brandId, fromDomain);
  if (!d || d.status !== "verified") return null;
  return { domain: d.domain, selector: d.selector, privateKeyPem: d.privateKeyPem };
}

// Reverse lookup: which brand authenticated this domain? Used by inbound mail to
// route a reply for hello@<domain> to the owning brand's inbox.
export async function brandForDomain(domainRaw: string): Promise<string | null> {
  const domain = norm(domainRaw);
  if (!domain) return null;
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("sending_domains").where("domain", "==", domain).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as SendingDomain).brandId;
  }
  for (const d of mem.values()) if (d.domain === domain) return d.brandId;
  return null;
}

export async function removeDomain(brandId: string, domainRaw: string): Promise<void> {
  const k = key(brandId, domainRaw);
  if (adminConfigured && adminDb) await adminDb.collection("sending_domains").doc(docId(k)).delete();
  else mem.delete(k);
}

// Live DNS verification — the domain only becomes "verified" when the required
// records actually resolve to the expected values.
/**
 * The verified tracking host for a brand, or null.
 *
 * Only returned once the CNAME actually resolves to our host. Using an
 * unverified hostname would produce links that 404 in a customer's inbox —
 * far worse than sharing the platform host for another day.
 */
export async function trackingHostFor(brandId: string): Promise<string | null> {
  const domains = await listDomains(brandId).catch(() => []);
  for (const d of domains) {
    if (d.status !== "verified") continue;
    const track = d.records.find((r) => r.purpose === "Tracking");
    if (track?.verified) return track.host;
  }
  return null;
}

export async function verifyDomain(brandId: string, domainRaw: string): Promise<SendingDomainView | null> {
  const rec = await getDomain(brandId, domainRaw);
  if (!rec) return null;
  const records = recordsFor(rec);

  for (const r of records) {
    try {
      if (r.type === "TXT") {
        const txts = (await resolveTxt(r.host)).map((chunks) => chunks.join("").trim());
        if (r.purpose === "DKIM") {
          const found = txts.find((t) => t.includes("v=DKIM1") && t.includes(`p=${rec.publicKey.slice(0, 40)}`));
          r.verified = Boolean(found);
          r.detail = found ? "DKIM public key found" : txts.length ? "record present but public key doesn't match" : "no TXT record found yet";
        } else if (r.purpose === "SPF") {
          const found = txts.find((t) => t.toLowerCase().startsWith("v=spf1") && t.includes(SPF_INCLUDE));
          r.verified = Boolean(found);
          r.detail = found ? "SPF include present" : txts.some((t) => t.toLowerCase().startsWith("v=spf1")) ? `SPF exists but missing include:${SPF_INCLUDE}` : "no SPF record yet";
        } else if (r.purpose === "DMARC") {
          const found = txts.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
          r.verified = Boolean(found);
          r.detail = found ? "DMARC policy present" : "no DMARC record yet";
        }
      } else if (r.type === "MX") {
        const { resolveMx } = await import("dns/promises");
        const want = r.value.replace(/^\d+\s+/, "").toLowerCase();
        const mx = (await resolveMx(r.host)).map((m) => m.exchange.replace(/\.$/, "").toLowerCase());
        r.verified = mx.includes(want);
        r.detail = r.verified
          ? "Replies to this subdomain will reach your Inbox here."
          : mx.length ? `points to ${mx[0]} (expected ${want})` : "no MX yet — optional, and replies still work at your MarketWar reply address without it";
      } else {
        // CNAME
        const cn = (await resolveCname(r.host)).map((c) => c.replace(/\.$/, "").toLowerCase());
        r.verified = cn.includes(r.value.toLowerCase());
        r.detail = r.verified ? "CNAME points correctly" : cn.length ? `points to ${cn[0]} (expected ${r.value})` : "no CNAME yet";
      }
    } catch {
      r.verified = false;
      r.detail = "not found yet (DNS can take up to 24–48h to propagate)";
    }
  }

  const requiredOk = records.filter((r) => r.required).every((r) => r.verified);
  rec.status = requiredOk ? "verified" : "pending";
  if (requiredOk && !rec.verifiedAt) rec.verifiedAt = new Date().toISOString();
  await save(rec);

  const view = toView(rec);
  view.records = records; // carry the per-record verify detail back to the UI
  return view;
}

function toView(rec: SendingDomain): SendingDomainView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { privateKeyPem, ownerId, ...rest } = rec;
  return { ...rest, records: recordsFor(rec) };
}

async function save(rec: SendingDomain): Promise<void> {
  const k = key(rec.brandId, rec.domain);
  if (adminConfigured && adminDb) await adminDb.collection("sending_domains").doc(docId(k)).set(rec, { merge: true });
  else mem.set(k, rec);
}
