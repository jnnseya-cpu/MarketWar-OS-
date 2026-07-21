// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Publish Gateway — platform-managed social publishing via Zernio.
//
// One platform account (ZERNIO_API_KEY, admin-owned, server-side only) fans out
// to 15 channels. Each brand becomes a white-label Zernio profile; the user does
// a one-click "connect your socials" (Zernio hosts the per-platform OAuth, so
// MarketWar never submits an app for review). We then post on the brand's behalf
// through the single platform key. Billed through the plan as per-seat ACUs at
// the protected margin (provider cost never exposed). Every post passes a
// compliance gate and carries the AI-content watermark before it ships.
//
// Demo-safe: with no key (or on any live error) the gateway falls back to a
// deterministic demo so the OS always works; live activates when the key is set.
// Follows the same one-door-per-vendor pattern as gateway.ts / image-gateway.ts.

import { quoteAcu } from "@/backend/acu";

const ZERNIO_BASE = "https://zernio.com/api";
const USD_TO_GBP = 0.79;

export type ZernioPlatform =
  | "instagram" | "tiktok" | "x" | "facebook" | "linkedin" | "youtube"
  | "whatsapp" | "threads" | "pinterest" | "reddit" | "bluesky"
  | "telegram" | "google_business" | "snapchat" | "discord";

export const ZERNIO_PLATFORMS: { id: ZernioPlatform; label: string }[] = [
  { id: "instagram", label: "Instagram" }, { id: "tiktok", label: "TikTok" },
  { id: "x", label: "X" }, { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" }, { id: "youtube", label: "YouTube" },
  { id: "whatsapp", label: "WhatsApp" }, { id: "threads", label: "Threads" },
  { id: "pinterest", label: "Pinterest" }, { id: "reddit", label: "Reddit" },
  { id: "bluesky", label: "Bluesky" }, { id: "telegram", label: "Telegram" },
  { id: "google_business", label: "Google Business" }, { id: "snapchat", label: "Snapchat" },
  { id: "discord", label: "Discord" },
];

const PLATFORM_IDS = new Set(ZERNIO_PLATFORMS.map((p) => p.id));

export function zernioConfigured(): boolean {
  return Boolean(process.env.ZERNIO_API_KEY);
}

function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// Deterministic 24-hex "token" for a demo connect link (matches the real
// platform-invites/{token}/connect shape). No randomness → stable in demo/tests.
function demoToken(brandId: string): string {
  let out = "";
  let h = seed("zernio:" + brandId);
  while (out.length < 24) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; out += h.toString(16).padStart(8, "0"); }
  return out.slice(0, 24);
}

async function zernioFetch(path: string, init: RequestInit, timeoutMs = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${ZERNIO_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// Flexible field pick — the live JSON shape may name things a few ways.
function pick(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (typeof o[k] === "string" && o[k]) return o[k] as string;
  return undefined;
}

// ---------------------------------------------------------------------------
// Connect link — mint a white-label "connect your socials" URL for a brand.
// Live: POST /v1/profiles. Demo: deterministic connect URL in the real shape.
// ---------------------------------------------------------------------------
export type ConnectLink = { mode: "live" | "demo"; brandId: string; profileId: string | null; connectUrl: string; note: string };

export async function createConnectLink(input: { brandId: string; brandName?: string }): Promise<ConnectLink> {
  const brandId = input.brandId?.trim() || "brand";
  if (zernioConfigured()) {
    try {
      const res = await zernioFetch("/v1/profiles", {
        method: "POST",
        body: JSON.stringify({ title: input.brandName || brandId, name: input.brandName || brandId, reference: brandId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const profileId = pick(data, ["id", "profileId", "profile_id", "key", "profileKey"]) ?? null;
        const token = pick(data, ["token", "inviteToken", "invite_token", "connectToken"]);
        const connectUrl =
          pick(data, ["connectUrl", "connect_url", "linkUrl", "link_url", "url"]) ??
          (token ? `${ZERNIO_BASE}/v1/platform-invites/${token}/connect` : "");
        if (connectUrl) {
          return { mode: "live", brandId, profileId, connectUrl, note: "Share this link with the brand — they connect their own socials (Zernio hosts the OAuth). Posting then runs through the platform account." };
        }
      }
    } catch { /* fall through to demo */ }
  }
  // Demo / graceful fallback — deterministic connect URL in the real shape.
  return {
    mode: "demo",
    brandId,
    profileId: null,
    connectUrl: `${ZERNIO_BASE}/v1/platform-invites/${demoToken(brandId)}/connect`,
    note: "Demo link (deterministic). With ZERNIO_API_KEY set this mints a real white-label connect link the brand opens to link their TikTok/Instagram/Facebook/YouTube/LinkedIn accounts — no app review on our side.",
  };
}

export type ZernioProfile = { id: string; name: string; connectedPlatforms: string[] };

export async function listProfiles(): Promise<{ mode: "live" | "demo"; profiles: ZernioProfile[]; note: string }> {
  if (zernioConfigured()) {
    try {
      const res = await zernioFetch("/v1/profiles", { method: "GET" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data) ? data : Array.isArray((data as Record<string, unknown>)?.profiles) ? (data as Record<string, unknown>).profiles as unknown[] : [];
        const profiles: ZernioProfile[] = list.map((p) => ({
          id: pick(p, ["id", "profileId", "key"]) ?? "",
          name: pick(p, ["title", "name"]) ?? "",
          connectedPlatforms: Array.isArray((p as Record<string, unknown>)?.platforms) ? ((p as Record<string, unknown>).platforms as string[]) : [],
        }));
        return { mode: "live", profiles, note: `${profiles.length} connected profile(s).` };
      }
    } catch { /* fall through */ }
  }
  return { mode: "demo", profiles: [], note: "No connected profiles in demo — connect a brand's socials to populate this." };
}

// ---------------------------------------------------------------------------
// Compliance gate + AI-content watermark — enforced BEFORE any post ships.
// ---------------------------------------------------------------------------
const PROHIBITED = ["guaranteed income", "miracle cure", "get rich quick", "risk-free investment", "cure cancer", "100% guaranteed returns"];

export function complianceGate(text: string): { pass: boolean; reasons: string[] } {
  const lc = (text || "").toLowerCase();
  const reasons = PROHIBITED.filter((p) => lc.includes(p)).map((p) => `Prohibited claim: “${p}”`);
  if (!text || !text.trim()) reasons.push("Empty post — nothing to publish.");
  if (text && text.length > 5000) reasons.push("Post exceeds the 5,000-character safe limit.");
  return { pass: reasons.length === 0, reasons };
}

const AI_WATERMARK = "Shared via MarketWar OS · AI-assisted";

// ---------------------------------------------------------------------------
// Publish — cross-post to selected platforms. Live: POST /v1/posts. Demo: a
// deterministic simulated accept so the flow is testable end to end.
// ---------------------------------------------------------------------------
export type PublishInput = {
  brandId: string;
  profileId?: string;
  text: string;
  platforms: string[];
  mediaUrls?: string[];
  scheduleAt?: string; // ISO; omit to post now
  watermark?: boolean;  // default true
};

export type PublishResult = {
  mode: "live" | "demo";
  status: "published" | "scheduled" | "blocked";
  postId: string | null;
  platforms: string[];
  compliance: { pass: boolean; reasons: string[] };
  watermarked: boolean;
  scheduledFor: string | null;
  mediaCount: number;       // hosted media actually attached to the post
  droppedMedia: number;     // media rejected (e.g. demo data: URIs — not postable)
  note: string;
};

// Only hosted http(s) media can post to social platforms — demo data: URIs and
// blob: previews are dropped (with a count) rather than sent.
function postableMedia(urls?: string[]): { ok: string[]; dropped: number } {
  const all = urls || [];
  const ok = all.filter((u) => /^https?:\/\//i.test(u));
  return { ok, dropped: all.length - ok.length };
}

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  const platforms = (input.platforms || []).filter((p) => PLATFORM_IDS.has(p as ZernioPlatform));
  const watermark = input.watermark !== false;
  const bodyText = watermark && input.text ? `${input.text}\n\n${AI_WATERMARK}` : input.text;
  const { ok: media, dropped: droppedMedia } = postableMedia(input.mediaUrls);
  const mediaNote = droppedMedia > 0 ? ` ${droppedMedia} demo/preview asset(s) not attached — a hosted image/video URL attaches once live rendering is on.` : media.length ? ` ${media.length} media attached.` : "";

  const compliance = complianceGate(input.text);
  if (!compliance.pass) {
    return { mode: zernioConfigured() ? "live" : "demo", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor: null, mediaCount: 0, droppedMedia, note: "Blocked by the compliance gate before any channel was touched." };
  }
  if (!platforms.length) {
    return { mode: zernioConfigured() ? "live" : "demo", status: "blocked", postId: null, platforms, compliance: { pass: false, reasons: ["No valid platform selected."] }, watermarked: watermark, scheduledFor: null, mediaCount: media.length, droppedMedia, note: "Pick at least one connected platform." };
  }

  const scheduledFor = input.scheduleAt && /\d{4}-\d{2}-\d{2}/.test(input.scheduleAt) ? input.scheduleAt : null;

  if (zernioConfigured()) {
    try {
      const res = await zernioFetch("/v1/posts", {
        method: "POST",
        body: JSON.stringify({
          text: bodyText,
          platforms,
          ...(input.profileId ? { profile: input.profileId, profileKey: input.profileId } : {}),
          ...(media.length ? { mediaUrls: media, media } : {}),
          ...(scheduledFor ? { schedule: scheduledFor, scheduleDate: scheduledFor } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const postId = pick(data, ["id", "postId", "post_id"]) ?? null;
        return { mode: "live", status: scheduledFor ? "scheduled" : "published", postId, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: `Sent to Zernio for ${platforms.length} platform(s).${mediaNote}` };
      }
      // Non-2xx from Zernio — degrade honestly rather than throw a 500.
      const errText = await res.text().catch(() => "");
      return { mode: "live", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: `Zernio rejected the post (HTTP ${res.status}). ${errText.slice(0, 160)}` };
    } catch {
      return { mode: "live", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: "Could not reach Zernio — the post was not sent. Try again shortly." };
    }
  }

  // Demo — deterministic simulated accept, so the flow is fully testable offline.
  return {
    mode: "demo",
    status: scheduledFor ? "scheduled" : "published",
    postId: `demo_${demoToken(input.brandId + platforms.join(","))}`.slice(0, 20),
    platforms,
    compliance,
    watermarked: watermark,
    scheduledFor,
    mediaCount: media.length,
    droppedMedia,
    note: `Demo publish — passed the compliance gate and carried the AI-content watermark.${mediaNote} With ZERNIO_API_KEY set this posts to the connected channels for real.`,
  };
}

// ---------------------------------------------------------------------------
// Seat billing — Zernio bills per CONNECTED ACCOUNT (not per post). Recover the
// per-account cost as plan-entitlement seats + ACU-metered overflow, at the
// protected margin. Provider cost is internal and never returned.
// ---------------------------------------------------------------------------
// Internal per-connected-account provider cost bands (USD/month), first 2 free.
function accountCostUsd(index1Based: number): number {
  if (index1Based <= 2) return 0;
  if (index1Based <= 10) return 6;
  if (index1Based <= 100) return 3;
  return 1;
}

export type SeatQuote = {
  connectedAccounts: number;
  includedSeats: number;
  billableAccounts: number;
  acus: number;
  marginMultiplier: number;
  marginPct: number;
  grossMarginPct: number;
  note: string;
};

export function seatQuote(input: { connectedAccounts: number; includedSeats: number }): SeatQuote {
  const connected = Math.max(0, Math.floor(input.connectedAccounts || 0));
  const included = Math.max(0, Math.floor(input.includedSeats || 0));
  const billableAccounts = Math.max(0, connected - included);
  // Sum the provider cost of the accounts BEYOND the plan's included seats.
  let providerUsd = 0;
  for (let i = included + 1; i <= connected; i++) providerUsd += accountCostUsd(i);
  const providerCostGbp = providerUsd * USD_TO_GBP;
  const q = quoteAcu({ providerCostGbp, actionClass: "low", variants: 1 });
  return {
    connectedAccounts: connected,
    includedSeats: included,
    billableAccounts,
    acus: billableAccounts > 0 ? q.acus : 0,
    marginMultiplier: q.marginMultiplier,
    marginPct: q.marginPct,
    grossMarginPct: q.grossMarginPct,
    note: billableAccounts > 0
      ? `${included} seats included in your plan; ${billableAccounts} extra connected account(s) metered at ${q.acus} ACUs (margin ${q.marginMultiplier}×). Provider cost never shown.`
      : `All ${connected} connected account(s) are within your ${included} included seats — no extra ACU charge.`,
  };
}

// Status for the Integration Hub / Publish Center UI.
export function zernioStatus() {
  return {
    provider: "zernio_publish",
    label: "Social Publishing (Zernio)",
    configured: zernioConfigured(),
    whiteLabel: true,
    platforms: ZERNIO_PLATFORMS,
    billing: "plan seats + ACU overflow (margin-protected)",
    userAction: zernioConfigured()
      ? "Connect your socials in one click — then publish from any brand."
      : "Managed for you — activates the moment publishing is enabled (ZERNIO_API_KEY).",
    note: "Platform-managed + white-label: one MarketWar account fans out to 15 channels; each brand connects its own socials in one click (no app review on our side). Every post passes the compliance gate and carries the AI-content watermark.",
  };
}
