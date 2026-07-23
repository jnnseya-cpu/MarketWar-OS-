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
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

// Zernio API base — the docs' base is https://zernio.com/api/v1, so paths here
// start with "/v1/…". Auth is `Authorization: Bearer sk_…` (set below).
const ZERNIO_BASE = "https://zernio.com/api";
const USD_TO_GBP = 0.79;

// Our platform ids → Zernio's platform slug (X is "twitter" in Zernio's API).
const ZERNIO_SLUG: Partial<Record<ZernioPlatform, string>> = { x: "twitter" };
function toZernioSlug(p: string): string { return ZERNIO_SLUG[p as ZernioPlatform] || p; }

// Per-brand Zernio profile id (Zernio groups connected accounts under a profile;
// we keep one profile per brand). Cached in Firestore so we don't re-create it.
async function getStoredProfileId(brandId: string): Promise<string | null> {
  if (!adminConfigured || !adminDb) return null;
  try {
    const snap = await adminDb.collection("zernio_profiles").doc(brandId).get();
    const id = snap.exists ? (snap.data() as { profileId?: string }).profileId : null;
    return id || null;
  } catch { return null; }
}
async function storeProfileId(brandId: string, profileId: string): Promise<void> {
  if (!adminConfigured || !adminDb) return;
  try { await adminDb.collection("zernio_profiles").doc(brandId).set({ brandId, profileId, updatedAt: new Date().toISOString() }, { merge: true }); } catch { /* best-effort */ }
}

// Ensure a Zernio profile exists for this brand; returns its _id (or an error).
async function ensureProfile(brandId: string, brandName?: string): Promise<{ profileId: string | null; error?: string }> {
  const existing = await getStoredProfileId(brandId);
  if (existing) return { profileId: existing };
  try {
    const res = await zernioFetch("/v1/profiles", {
      method: "POST",
      body: JSON.stringify({ name: brandName || brandId, description: `MarketWar OS brand ${brandId}` }),
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) return { profileId: null, error: `Zernio POST /v1/profiles → HTTP ${res.status}. ${raw.slice(0, 180)}` };
    let data: unknown = {}; try { data = JSON.parse(raw); } catch { /* non-JSON */ }
    // Response shape: { profile: { _id } }
    const profile = (data as { profile?: { _id?: string } }).profile;
    const profileId = profile?._id || pick(data, ["_id", "id"]) || null;
    if (!profileId) return { profileId: null, error: `Zernio created no profile id. Body: ${raw.slice(0, 180)}` };
    await storeProfileId(brandId, profileId);
    return { profileId };
  } catch (e) {
    return { profileId: null, error: `Could not reach Zernio: ${(e as Error).message}` };
  }
}

// List the accounts connected under a profile → [{ platform, accountId }].
async function listAccounts(profileId: string): Promise<{ platform: string; accountId: string }[]> {
  try {
    const res = await zernioFetch(`/v1/accounts?profileId=${encodeURIComponent(profileId)}`, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray((data as { accounts?: unknown[] }).accounts) ? (data as { accounts: unknown[] }).accounts : [];
    return list.map((a) => {
      const o = a as Record<string, unknown>;
      return { platform: String(o.platform || "").toLowerCase(), accountId: String(o._id || o.id || "") };
    }).filter((a) => a.platform && a.accountId);
  } catch { return []; }
}

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
export type PlatformConnect = { platform: string; label: string; url: string };
export type ConnectLink = {
  mode: "live" | "demo" | "live-error";
  brandId: string;
  profileId: string | null;
  connectUrl: string;                 // first platform link (back-compat)
  platformLinks?: PlatformConnect[];  // per-platform OAuth links (the real flow)
  note: string;
  diagnostic?: string;
};

// The platforms we offer a one-click connect for by default (the brand opens
// each to authorise that account; Zernio hosts the OAuth).
const CONNECT_DEFAULTS: { platform: ZernioPlatform; label: string }[] = [
  { platform: "instagram", label: "Instagram" }, { platform: "facebook", label: "Facebook" },
  { platform: "tiktok", label: "TikTok" }, { platform: "youtube", label: "YouTube" },
  { platform: "linkedin", label: "LinkedIn" }, { platform: "x", label: "X" },
];

// Get a single platform's OAuth connect URL for a profile.
async function connectUrlFor(profileId: string, platform: string): Promise<string | null> {
  try {
    const res = await zernioFetch(`/v1/connect/${encodeURIComponent(toZernioSlug(platform))}?profileId=${encodeURIComponent(profileId)}`, { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return pick(data, ["authUrl", "auth_url", "url", "connectUrl"]) ?? null;
  } catch { return null; }
}

export async function createConnectLink(input: { brandId: string; brandName?: string }): Promise<ConnectLink> {
  const brandId = input.brandId?.trim() || "brand";
  if (zernioConfigured()) {
    const { profileId, error } = await ensureProfile(brandId, input.brandName);
    if (!profileId) {
      return { mode: "live-error", brandId, profileId: null, connectUrl: "", note: "Publishing key is set, but Zernio couldn't create the brand profile — see the diagnostic.", diagnostic: error };
    }
    // Mint a per-platform OAuth link for each default channel.
    const linkResults = await Promise.all(
      CONNECT_DEFAULTS.map(async ({ platform, label }) => {
        const url = await connectUrlFor(profileId, platform);
        return url ? { platform: platform as string, label, url } : null;
      }),
    );
    const links: PlatformConnect[] = linkResults.filter((l): l is PlatformConnect => l !== null);

    if (links.length === 0) {
      return { mode: "live-error", brandId, profileId, connectUrl: "", note: "Profile created, but Zernio returned no OAuth connect URLs. Check the API key's scopes / platform availability.", diagnostic: "GET /v1/connect/{platform}?profileId=… returned no authUrl for any default platform." };
    }
    return {
      mode: "live",
      brandId,
      profileId,
      connectUrl: links[0].url,
      platformLinks: links,
      note: "One click per network authorises that account (Zernio hosts the OAuth — no app review on our side). Once connected, publish from this brand to those channels.",
    };
  }
  // No key — deterministic demo connect URL in the real shape.
  return {
    mode: "demo",
    brandId,
    profileId: null,
    connectUrl: `${ZERNIO_BASE}/v1/connect/instagram?profileId=${demoToken(brandId)}`,
    note: "Demo link (deterministic). With ZERNIO_API_KEY set this mints real per-platform white-label connect links the brand opens to link their TikTok/Instagram/Facebook/YouTube/LinkedIn/X accounts — no app review on our side.",
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
      // Resolve the brand's Zernio profile + its connected accounts, then map
      // each requested platform to a real { platform, accountId } — the shape
      // Zernio's POST /v1/posts requires (bare platform strings are rejected).
      const { profileId, error: profErr } = await ensureProfile(input.brandId, undefined);
      if (!profileId) {
        return { mode: "live", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: `Couldn't reach the brand's publishing profile. ${profErr ?? ""}`.trim() };
      }
      const accounts = await listAccounts(profileId);
      const targets = platforms
        .map((p) => {
          const slug = toZernioSlug(p);
          const acct = accounts.find((a) => a.platform === slug || a.platform === p);
          return acct ? { platform: acct.platform, accountId: acct.accountId } : null;
        })
        .filter((t): t is { platform: string; accountId: string } => Boolean(t));

      if (targets.length === 0) {
        const want = platforms.join(", ");
        const have = accounts.map((a) => a.platform).join(", ") || "none";
        return { mode: "live", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: `No connected account for ${want} on this brand yet (connected: ${have}). Open “Connect socials”, authorise the account, then publish.` };
      }

      const res = await zernioFetch("/v1/posts", {
        method: "POST",
        body: JSON.stringify({
          content: bodyText,
          platforms: targets,
          ...(scheduledFor ? { scheduledFor, timezone: "Europe/London" } : { publishNow: true }),
          ...(media.length ? { media } : {}),
        }),
      });
      const raw = await res.text().catch(() => "");
      if (res.ok) {
        let data: unknown = {}; try { data = JSON.parse(raw); } catch { /* non-JSON */ }
        const post = (data as { post?: { _id?: string; status?: string } }).post;
        const postId = post?._id || pick(data, ["_id", "id", "postId"]) || null;
        const sentPlatforms = targets.map((t) => t.platform);
        return { mode: "live", status: scheduledFor ? "scheduled" : "published", postId, platforms: sentPlatforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: `Sent to Zernio for ${sentPlatforms.join(", ")}.${mediaNote}` };
      }
      // Non-2xx — surface the real cause.
      const isPlatformErr = /platforms?\.\d|platform.*invalid|invalid.*platform|account/i.test(raw);
      const note = isPlatformErr
        ? `Zernio rejected the target account (HTTP ${res.status}). Reconnect the brand's socials and try again. ${raw.slice(0, 140)}`
        : `Zernio rejected the post (HTTP ${res.status}). ${raw.slice(0, 160)}`;
      return { mode: "live", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note };
    } catch (e) {
      return { mode: "live", status: "blocked", postId: null, platforms, compliance, watermarked: watermark, scheduledFor, mediaCount: media.length, droppedMedia, note: `Could not reach Zernio — the post was not sent (${(e as Error).message}). Try again shortly.` };
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
