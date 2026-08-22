// THE ONE WAY AN EVENT LEAVES THIS PLATFORM.
//
// `track("sign_up")` goes to Google Tag and Meta Pixel together, or to neither.
// No feature file ever touches `fbq` or `dataLayer` directly, because the moment
// two call sites do that by hand the two dashboards start disagreeing and there
// is no way to tell which is right.
//
// FOUR THINGS MAKE IT A NO-OP, AND ALL OF THEM ARE NORMAL:
//   • no consent          — the visitor said no, or has not been asked
//   • no ID configured    — a deployment with no pixel and no container
//   • the server          — this module is never used during SSR
//   • an unknown event    — a name not in the canonical list
//
// None of them throws. Analytics that can break a page is worse than analytics
// that is missing, and the zero-config demo mode has to keep working untouched.

import { buildPayload, metaCall, type EventParams } from "@/shared/analytics-events";
import { readConsent, CONSENT_EVENT, type ConsentChoice } from "@/components/CookieConsent";

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
type W = Window & { dataLayer?: unknown[]; fbq?: Fbq };

export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();

/**
 * Consent, cached for the page and refreshed when the visitor changes it.
 *
 * Read once rather than per event: `track` is called from click handlers, and
 * hitting localStorage on every press is a synchronous read on the interaction
 * path for no benefit. The broadcast keeps it honest.
 */
let cached: ConsentChoice | null | undefined;

function consentNow(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  if (cached === undefined) cached = readConsent();
  return cached ?? null;
}

if (typeof window !== "undefined") {
  window.addEventListener(CONSENT_EVENT, (e) => {
    const detail = (e as CustomEvent<ConsentChoice>).detail;
    cached = detail === "granted" || detail === "denied" ? detail : null;
  });
}

/** Whether anything would actually be sent. Exported so a surface can say so. */
export function analyticsActive(): boolean {
  return typeof window !== "undefined" && consentNow() === "granted";
}

/**
 * A per-event id shared by both destinations.
 *
 * Meta uses it to deduplicate a browser event against the same event sent from
 * a server later (Conversions API). Emitting it now costs nothing and means
 * adding server-side tracking later does not double-count every purchase.
 */
function eventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `e${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

/**
 * Record something that happened.
 *
 * @param name   a name from `MW_EVENTS` — anything else is ignored
 * @param params allowlisted parameters only; everything else is dropped
 */
export function track(name: string, params?: EventParams): void {
  if (typeof window === "undefined") return;
  if (consentNow() !== "granted") return;

  // Unknown names and money events with no real amount are refused HERE, so a
  // bad call site fails the same way in both destinations rather than half
  // landing in one of them.
  const payload = buildPayload(name, params);
  if (!payload) return;

  const w = window as W;
  const id = eventId();

  // Google Tag. Pushed to dataLayer rather than calling gtag directly: the
  // container is what is loaded on consent, and a trigger inside it is how a
  // conversion gets configured without another deploy.
  try {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: payload.event.name, ...payload.params, mw_event_id: id });
  } catch { /* one destination failing must not take the other down */ }

  // Meta Pixel. Absent unless the ID is set and the script has loaded; the queue
  // stub the loader installs means a call before load is not lost.
  try {
    if (META_PIXEL_ID && typeof w.fbq === "function") {
      const call = metaCall(payload.event);
      w.fbq(call.method, call.event, payload.params, { eventID: id });
    }
  } catch { /* as above */ }
}

/**
 * A page view.
 *
 * Separate from `track("page_view")` only because the router calls it on every
 * client-side navigation, where the pixel's own automatic PageView does not
 * fire — a single-page app otherwise reports one view per session.
 */
export function trackPageView(path: string): void {
  track("page_view", { surface: path.slice(0, 40) });
}
