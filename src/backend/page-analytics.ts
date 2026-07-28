// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Real landing-page analytics — measured, not predicted.
//
// The page list previously showed "Conv 67" beside a live URL. That number was a
// PREDICTED quality score for the copy, but next to a link it reads as "67
// conversions" or "67%". A customer making budget decisions on that is being
// misled by their own dashboard, which is worse than showing nothing.
//
// This counts what actually happened: views, CTA clicks, form submissions. From
// those, a real conversion rate — with the same honesty the A/B engine uses,
// because a page with 3 views and 1 lead has NOT got a 33% conversion rate.
//
// Privacy: no cookies, no cross-site identifiers, no visitor profiles. A view is
// a counter increment and a coarse day bucket. Nothing that could identify a
// visitor is stored, so the tracking needs no consent banner and cannot become a
// GDPR liability for the customer.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { wilsonInterval } from "@/backend/experiments";

export type PageEvent = "view" | "cta_click" | "lead";

export type PageStats = {
  brandId: string;
  slug: string;
  views: number;
  ctaClicks: number;
  leads: number;
  // Days are ISO dates → counts, so a trend can be drawn without storing
  // anything per-visitor.
  daily: Record<string, { views: number; ctaClicks: number; leads: number }>;
  firstSeen?: string;
  lastSeen?: string;
};

export type PageReport = PageStats & {
  clickRatePct: number;
  conversionRatePct: number;
  conversionLowPct: number;
  conversionHighPct: number;
  enoughData: boolean;
  headline: string;
  caveat?: string;
};

const COLLECTION = "page_stats";
// Below this many views, a conversion rate is not a measurement — it is a
// rounding artefact. 3 views and 1 lead is not "33%".
const MIN_VIEWS_FOR_RATE = 100;

const mem = new Map<string, PageStats>();
const key = (brandId: string, slug: string) => `${brandId}::${slug}`;
const today = () => new Date().toISOString().slice(0, 10);
const useDb = () => adminConfigured && adminDb;

function blank(brandId: string, slug: string): PageStats {
  return { brandId, slug, views: 0, ctaClicks: 0, leads: 0, daily: {} };
}

const FIELD: Record<PageEvent, "views" | "ctaClicks" | "leads"> = {
  view: "views", cta_click: "ctaClicks", lead: "leads",
};

// Record one event. Deliberately cheap and failure-tolerant: analytics must
// never break the page a customer is paying to have live.
export async function recordPageEvent(brandId: string, slug: string, event: PageEvent): Promise<void> {
  if (!brandId || !slug) return;
  const field = FIELD[event];
  if (!field) return;
  const day = today();
  const now = new Date().toISOString();

  try {
    if (useDb()) {
      const ref = adminDb!.collection(COLLECTION).doc(key(brandId, slug));
      await adminDb!.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const cur = (snap.exists ? snap.data() : null) as PageStats | null;
        const stats = cur ?? blank(brandId, slug);
        const bucket = stats.daily?.[day] ?? { views: 0, ctaClicks: 0, leads: 0 };
        tx.set(ref, {
          ...stats,
          [field]: (stats[field] || 0) + 1,
          daily: { ...(stats.daily || {}), [day]: { ...bucket, [field]: (bucket[field] || 0) + 1 } },
          firstSeen: stats.firstSeen || now,
          lastSeen: now,
        }, { merge: true });
      });
      return;
    }
    const k = key(brandId, slug);
    const stats = mem.get(k) ?? blank(brandId, slug);
    const bucket = stats.daily[day] ?? { views: 0, ctaClicks: 0, leads: 0 };
    bucket[field] += 1;
    stats.daily[day] = bucket;
    stats[field] += 1;
    stats.firstSeen = stats.firstSeen || now;
    stats.lastSeen = now;
    mem.set(k, stats);
  } catch {
    // Swallow: a failed counter must never take a live page down.
  }
}

export async function getPageStats(brandId: string, slug: string): Promise<PageStats> {
  try {
    if (useDb()) {
      const snap = await adminDb!.collection(COLLECTION).doc(key(brandId, slug)).get();
      return snap.exists ? ({ ...blank(brandId, slug), ...(snap.data() as PageStats) }) : blank(brandId, slug);
    }
  } catch { /* fall through to memory */ }
  return mem.get(key(brandId, slug)) ?? blank(brandId, slug);
}

export async function listPageStats(brandId: string): Promise<PageStats[]> {
  try {
    if (useDb()) {
      const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(200).get();
      return snap.docs.map((d) => ({ ...blank(brandId, ""), ...(d.data() as PageStats) }));
    }
  } catch { /* fall through */ }
  return [...mem.values()].filter((s) => s.brandId === brandId);
}

const pct = (v: number) => Math.round(v * 1000) / 10;

// Turn counts into a report that will not mislead. The same discipline as the
// A/B engine: a rate on tiny numbers is shown WITH its range, and is explicitly
// marked as not yet meaningful.
export function reportFor(stats: PageStats): PageReport {
  const views = stats.views || 0;
  const leads = stats.leads || 0;
  const clicks = stats.ctaClicks || 0;
  const rate = views > 0 ? leads / views : 0;
  const { low, high } = wilsonInterval(leads, views);
  const enoughData = views >= MIN_VIEWS_FOR_RATE;

  return {
    ...stats,
    clickRatePct: views > 0 ? pct(clicks / views) : 0,
    conversionRatePct: pct(rate),
    conversionLowPct: pct(low),
    conversionHighPct: pct(high),
    enoughData,
    headline:
      views === 0
        ? "No visitors yet — share the link to start measuring."
        : enoughData
          ? `${views.toLocaleString()} visitors, ${leads} lead${leads === 1 ? "" : "s"} — ${pct(rate)}% conversion.`
          : `${views} visitor${views === 1 ? "" : "s"}, ${leads} lead${leads === 1 ? "" : "s"} so far.`,
    caveat: !enoughData && views > 0
      ? `Too little traffic to call a conversion rate yet. On ${views} visit${views === 1 ? "" : "s"} the true rate is somewhere between ${pct(low)}% and ${pct(high)}% — come back past ${MIN_VIEWS_FOR_RATE} visitors.`
      : undefined,
  };
}

export const MIN_VIEWS = MIN_VIEWS_FOR_RATE;
