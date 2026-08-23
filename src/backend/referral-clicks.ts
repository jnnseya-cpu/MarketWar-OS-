// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE EVIDENCE BEHIND AN ATTRIBUTION CLAIM.
//
// `/r/{CODE}` resolved the code and redirected and wrote NOTHING. So there was
// no click count, no timestamp, nothing to check a sale against, and no way to
// notice a creator sending a thousand clicks from one machine. A commission is a
// payment; a payment needs a record behind it.
//
// WHAT IS NOT STORED, AND WHY.
//
// No IP address and no user agent, ever — only a salted hash of them, and only
// to collapse a refresh into one click. The visitor is a member of the public who
// clicked a link; they are not a customer of ours, they have consented to
// nothing, and a raw IP is personal data under UK GDPR. The salt is per-code and
// per-day, so the hashes cannot be joined into a trail across codes or across
// days even by us.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type ClickRow = {
  id: string;
  code: string;
  brandId: string;
  programmeId?: string;
  atISO: string;
  /** Salted hash. Never the address itself. */
  visitorHash: string;
  /** Where the click came from, host only — never the full referring URL. */
  refererHost?: string;
};

const COLLECTION = "referral_clicks";
const useDb = () => Boolean(adminConfigured && adminDb);
const mem = new Map<string, ClickRow[]>();

/**
 * Two clicks from the same person within this many minutes are one click.
 *
 * A person opening a link, going back and opening it again has not visited
 * twice, and paying a per-click reward for that is paying for a page refresh.
 */
export const DEDUPE_MINUTES = 30;

/**
 * The visitor fingerprint, hashed with a salt that changes every day and every
 * code — so it can group a refresh and nothing else.
 */
export function visitorHash(input: { code: string; ip?: string | null; ua?: string | null; dayISO: string }): string {
  const salt = `${input.code.toUpperCase()}|${input.dayISO.slice(0, 10)}`;
  return createHash("sha256").update(`${salt}|${input.ip || ""}|${input.ua || ""}`).digest("hex").slice(0, 32);
}

/** Host only. A full referring URL can carry a search query or a session token. */
export function refererHostOf(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try { return new URL(raw).hostname.replace(/^www\./, "").slice(0, 80); } catch { return undefined; }
}

export type RecordResult = { recorded: boolean; reason: string; row?: ClickRow };

/**
 * Record one click, unless it is the same person refreshing.
 *
 * Never throws: a redirect must not fail because a counter did. The visitor is
 * mid-journey to the brand's site, and losing the click is far cheaper than
 * losing the customer.
 */
export async function recordClick(input: {
  code: string;
  brandId: string;
  programmeId?: string;
  ip?: string | null;
  ua?: string | null;
  referer?: string | null;
  nowISO: string;
}): Promise<RecordResult> {
  try {
    const code = (input.code || "").trim().toUpperCase();
    if (!code || !input.brandId) return { recorded: false, reason: "No code or brand on the click." };

    const hash = visitorHash({ code, ip: input.ip, ua: input.ua, dayISO: input.nowISO });
    const recent = await listClicks(code);
    const cutoff = Date.parse(input.nowISO) - DEDUPE_MINUTES * 60_000;
    const dup = recent.find((r) => r.visitorHash === hash && Date.parse(r.atISO) >= cutoff);
    if (dup) return { recorded: false, reason: `Same visitor within ${DEDUPE_MINUTES} minutes — a refresh is not a second click.` };

    const row: ClickRow = {
      id: `c_${createHash("sha256").update(`${code}|${hash}|${input.nowISO}`).digest("hex").slice(0, 20)}`,
      code, brandId: input.brandId, programmeId: input.programmeId,
      atISO: input.nowISO, visitorHash: hash,
      refererHost: refererHostOf(input.referer),
    };

    const local = mem.get(code) || [];
    mem.set(code, [...local, row]);
    if (useDb()) {
      try { await adminDb!.collection(COLLECTION).doc(row.id).set(row); } catch { /* memory holds it */ }
    }
    return { recorded: true, reason: "Click recorded.", row };
  } catch {
    return { recorded: false, reason: "The click could not be recorded, and the redirect went ahead anyway." };
  }
}

export async function listClicks(code: string): Promise<ClickRow[]> {
  const key = (code || "").trim().toUpperCase();
  const local = mem.get(key) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("code", "==", key).get();
    const byId = new Map<string, ClickRow>();
    for (const r of local) byId.set(r.id, r);
    snap.forEach((d) => { const r = d.data() as ClickRow; byId.set(r.id, r); });
    return [...byId.values()];
  } catch {
    return [...local];
  }
}

/** Clicks in a window, for the creator's dashboard and for fraud review. */
export async function clickStats(code: string, sinceISO: string): Promise<{ total: number; uniqueVisitors: number; topReferers: { host: string; n: number }[] }> {
  const since = Date.parse(sinceISO);
  const rows = (await listClicks(code)).filter((r) => Date.parse(r.atISO) >= since);
  const hosts = new Map<string, number>();
  for (const r of rows) if (r.refererHost) hosts.set(r.refererHost, (hosts.get(r.refererHost) || 0) + 1);
  return {
    total: rows.length,
    uniqueVisitors: new Set(rows.map((r) => r.visitorHash)).size,
    topReferers: [...hosts.entries()].map(([host, n]) => ({ host, n })).sort((a, b) => b.n - a.n).slice(0, 5),
  };
}

/** Test seam. Never called by product code. */
export function __resetClicks(): void { mem.clear(); }
