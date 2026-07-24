// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Email delivery events — the feedback loop that makes sending self-correcting.
//
// Every message carries a signed tracking token. A 1x1 pixel records OPENs; link
// wrappers record CLICKs; the sending node / provider posts BOUNCE and COMPLAINT
// events to the webhook. All land here as append-only events keyed per brand, and
// bounces/complaints/unsubscribes AUTO-POPULATE the suppression ledger so the
// platform never contacts a dead or hostile address again (the zero-bounce
// doctrine, now driven by real telemetry instead of pre-send hygiene alone).
//
// Tokens are HMAC-signed with EMAIL_TRACKING_SECRET so open/click endpoints can't
// be forged to poison a brand's stats or suppress a rival's list.

import { createHmac, timingSafeEqual } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { suppress } from "@/backend/email";

export type EmailEventType = "sent" | "open" | "click" | "bounce" | "complaint" | "unsubscribe";

export type EmailEvent = {
  id: string;
  brandId: string;
  email: string;
  type: EmailEventType;
  at: string;
  campaign?: string;
  url?: string;      // for clicks
  meta?: Record<string, string>;
};

const mem: EmailEvent[] = [];
const MEM_CAP = 5000;

const SECRET = () => process.env.EMAIL_TRACKING_SECRET || process.env.CRON_SECRET || "mw-dev-tracking-secret";

// --- signed tracking token: brandId|email|campaign, HMAC-truncated ---
export function signToken(brandId: string, email: string, campaign = ""): string {
  const payload = `${brandId}|${email.toLowerCase()}|${campaign}`;
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", SECRET()).update(b64).digest("base64url").slice(0, 24);
  return `${b64}.${sig}`;
}

export function verifyToken(token: string): { brandId: string; email: string; campaign: string } | null {
  const [b64, sig] = (token || "").split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", SECRET()).update(b64).digest("base64url").slice(0, 24);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch { return null; }
  try {
    const [brandId, email, campaign] = Buffer.from(b64, "base64url").toString("utf8").split("|");
    if (!brandId || !email) return null;
    return { brandId, email, campaign: campaign || "" };
  } catch { return null; }
}

const evId = (e: Pick<EmailEvent, "brandId" | "email" | "type" | "at">) =>
  `${e.brandId}::${e.type}::${e.email.toLowerCase()}::${e.at}`;

export async function recordEvent(ev: Omit<EmailEvent, "id">): Promise<void> {
  const e: EmailEvent = { ...ev, email: ev.email.toLowerCase(), id: evId(ev) };
  if (adminConfigured && adminDb) {
    await adminDb.collection("email_events").doc(e.id.replace(/\//g, "_")).set(e, { merge: true });
  } else {
    mem.push(e);
    if (mem.length > MEM_CAP) mem.splice(0, mem.length - MEM_CAP);
  }
  // Hard signals suppress immediately — never send to this address again.
  if (ev.type === "bounce" || ev.type === "complaint" || ev.type === "unsubscribe") {
    suppress(e.email);
    await addSuppression(e.brandId, e.email, ev.type);
  }
}

// Persistent suppression (survives process restarts; the in-memory ledger in
// email.ts is the fast path, this is the durable record consulted on send).
export async function addSuppression(brandId: string, email: string, reason: string): Promise<void> {
  const rec = { brandId, email: email.toLowerCase(), reason, at: nowISO() };
  const id = `${brandId}::${rec.email}`.replace(/\//g, "_");
  if (adminConfigured && adminDb) await adminDb.collection("email_suppressions").doc(id).set(rec, { merge: true });
  else memSuppress.add(`${brandId}::${rec.email}`);
}

const memSuppress = new Set<string>();

export async function isSuppressed(brandId: string, email: string): Promise<boolean> {
  const key = `${brandId}::${email.toLowerCase()}`;
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("email_suppressions").doc(key.replace(/\//g, "_")).get();
    return snap.exists;
  }
  return memSuppress.has(key);
}

export async function suppressedEmails(brandId: string, limit = 5000): Promise<Set<string>> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("email_suppressions").where("brandId", "==", brandId).limit(limit).get();
    return new Set(snap.docs.map((d) => (d.data() as { email: string }).email));
  }
  return new Set([...memSuppress].filter((k) => k.startsWith(`${brandId}::`)).map((k) => k.split("::")[1]));
}

// Aggregated engagement stats for a brand (for the Email Center dashboard).
export async function eventStats(brandId: string): Promise<{ sent: number; open: number; click: number; bounce: number; complaint: number; unsubscribe: number; openRate: number; clickRate: number }> {
  let events: EmailEvent[];
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("email_events").where("brandId", "==", brandId).limit(10000).get();
    events = snap.docs.map((d) => d.data() as EmailEvent);
  } else {
    events = mem.filter((e) => e.brandId === brandId);
  }
  const c = { sent: 0, open: 0, click: 0, bounce: 0, complaint: 0, unsubscribe: 0 };
  // Unique-per-address for opens/clicks (a contact opening twice is one opener).
  const seen = new Set<string>();
  for (const e of events) {
    if (e.type === "open" || e.type === "click") {
      const k = `${e.type}:${e.email}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    if (e.type in c) c[e.type as keyof typeof c]++;
  }
  const openRate = c.sent ? Math.round((c.open / c.sent) * 1000) / 10 : 0;
  const clickRate = c.sent ? Math.round((c.click / c.sent) * 1000) / 10 : 0;
  return { ...c, openRate, clickRate };
}

function nowISO(): string {
  return new Date().toISOString();
}

// The public base the pixel/link endpoints resolve to. Point MW_TRACK_URL at the
// branded tracking domain (the `email.<domain>` CNAME → the app) or leave it to
// the production URL.
export function trackingBase(): string {
  return (process.env.MW_TRACK_URL || process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://marketwaros.com").replace(/\/$/, "");
}

// The one-click unsubscribe URL for a recipient (used both as an in-body link and
// as the RFC 8058 List-Unsubscribe header).
export function unsubscribeUrl(brandId: string, email: string, campaign = ""): string {
  return `${trackingBase()}/api/track/unsubscribe?t=${signToken(brandId, email, campaign)}`;
}

// Rewrite an outgoing HTML body to enable open + click tracking for ONE recipient:
//  • append a 1x1 open-pixel just before </body> (or at the end),
//  • wrap every http(s) link through the click redirector (preserving the target),
//  • append a one-click unsubscribe link (RFC-friendly, honours the ledger).
// Deterministic and safe: only rewrites href targets, never touches text.
export function injectTracking(html: string, brandId: string, email: string, campaign = ""): string {
  const base = trackingBase();
  const token = signToken(brandId, email, campaign);
  const pixel = `<img src="${base}/api/track/open?t=${token}" width="1" height="1" alt="" style="display:none" />`;
  const unsub = `<div style="margin-top:24px;font-size:12px;color:#94a3b8">If you'd rather not receive these, <a href="${base}/api/track/unsubscribe?t=${token}" style="color:#94a3b8">unsubscribe</a>.</div>`;

  // Wrap links: href="http(s)://…" → the click redirector.
  const wrapped = html.replace(/href\s*=\s*"(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    // Don't double-wrap our own tracking links.
    if (url.includes("/api/track/")) return `href="${url}"`;
    return `href="${base}/api/track/click?t=${token}&u=${encodeURIComponent(url)}"`;
  });

  const tail = pixel + unsub;
  return /<\/body>/i.test(wrapped) ? wrapped.replace(/<\/body>/i, `${tail}</body>`) : wrapped + tail;
}
