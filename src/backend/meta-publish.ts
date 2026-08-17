// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Native Meta publishing — Facebook Pages + Instagram Business via the Graph API,
// owned end-to-end (no aggregator, no per-post vendor cost → best margin). This is
// the "own the channels worth owning" half of the publishing plan; Zernio stays as
// failover for the long tail (TikTok/YouTube/X/Pinterest) and the manual
// "post it yourself" path is always the floor.
//
// Two ways a brand connects (both real, no fabrication):
//   1) OAuth "Connect with Facebook" — needs the platform's Meta app
//      (FB_APP_ID + FB_APP_SECRET). One app review by the owner covers FB + IG.
//   2) Direct Page token — the brand pastes a Page access token + Page ID they
//      generated themselves. Works TODAY with no app review on our side.
//
// Tokens are the BRAND'S own tokens, stored server-side (Firestore
// "meta_connections", mem fallback) and never returned to the browser.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { haltFor } from "@/backend/emergency-stop";
import {
  claimPublication, settlePublished, settleFailed, looksDefinite,
  type Publication, type RemoteVerifier,
} from "@/backend/publication-ledger";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Scopes needed to publish to a Page and its linked IG Business account.
export const META_SCOPES = [
  "pages_show_list", "pages_manage_posts", "pages_read_engagement",
  "business_management", "instagram_basic", "instagram_content_publish",
].join(",");

export type MetaConnection = {
  brandId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;   // server-side only — never sent to the client
  igUserId?: string;
  igUsername?: string;
  connectedAt: string;
  tokenSource: "oauth" | "page_token";
};

// Public (safe) view of a connection — no token.
export type MetaConnectionPublic = {
  connected: boolean;
  pageName?: string;
  pageId?: string;
  igUsername?: string;
  igConnected: boolean;
  connectedAt?: string;
  tokenSource?: "oauth" | "page_token";
};

export function metaOAuthConfigured(): boolean {
  return Boolean(process.env.FB_APP_ID && process.env.FB_APP_SECRET);
}

const mem = new Map<string, MetaConnection>(); // brandId → connection

// ---- store ---------------------------------------------------------------
export async function getMetaConnection(brandId: string): Promise<MetaConnection | null> {
  if (adminConfigured && adminDb) {
    try {
      const snap = await adminDb.collection("meta_connections").doc(brandId).get();
      return snap.exists ? (snap.data() as MetaConnection) : null;
    } catch { return null; }
  }
  return mem.get(brandId) ?? null;
}
async function saveMetaConnection(conn: MetaConnection): Promise<void> {
  if (adminConfigured && adminDb) {
    await adminDb.collection("meta_connections").doc(conn.brandId).set(conn, { merge: true });
  } else {
    mem.set(conn.brandId, conn);
  }
}
export async function disconnectMeta(brandId: string): Promise<void> {
  if (adminConfigured && adminDb) {
    try { await adminDb.collection("meta_connections").doc(brandId).delete(); } catch { /* best-effort */ }
  } else {
    mem.delete(brandId);
  }
}
export async function metaConnectionPublic(brandId: string): Promise<MetaConnectionPublic> {
  const c = await getMetaConnection(brandId);
  if (!c) return { connected: false, igConnected: false };
  return {
    connected: true, pageName: c.pageName, pageId: c.pageId,
    igUsername: c.igUsername, igConnected: Boolean(c.igUserId),
    connectedAt: c.connectedAt, tokenSource: c.tokenSource,
  };
}

// ---- Graph helpers -------------------------------------------------------
async function graphGet(path: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}${path}?${qs}`, { method: "GET" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
async function graphPost(path: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const body = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}
function graphErr(data: Record<string, unknown>, status: number): string {
  const e = data.error as { message?: string; code?: number } | undefined;
  return e?.message ? `${e.message}${e.code ? ` (code ${e.code})` : ""}` : `Graph API error (HTTP ${status})`;
}
const nowISO = () => new Date().toISOString();

// ---- OAuth ---------------------------------------------------------------
export function metaAuthUrl(brandId: string, redirectUri: string, state: string): string {
  const qs = new URLSearchParams({
    client_id: process.env.FB_APP_ID as string,
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${qs}`;
}

// Exchange an OAuth code for a stored connection: code → user token → long-lived
// token → the brand's first Page + its linked IG Business account.
export async function completeMetaOAuth(brandId: string, code: string, redirectUri: string): Promise<{ ok: boolean; error?: string; connection?: MetaConnectionPublic }> {
  if (!metaOAuthConfigured()) return { ok: false, error: "Meta OAuth is not configured on this deployment (FB_APP_ID / FB_APP_SECRET). Use the Page-token connect instead." };
  // 1) code → short-lived user token
  const t1 = await graphGet("/oauth/access_token", {
    client_id: process.env.FB_APP_ID as string,
    client_secret: process.env.FB_APP_SECRET as string,
    redirect_uri: redirectUri, code,
  });
  if (!t1.ok || !t1.data.access_token) return { ok: false, error: graphErr(t1.data, t1.status) };
  // 2) exchange for a long-lived user token
  const t2 = await graphGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: process.env.FB_APP_ID as string,
    client_secret: process.env.FB_APP_SECRET as string,
    fb_exchange_token: String(t1.data.access_token),
  });
  const userToken = String((t2.ok && t2.data.access_token) || t1.data.access_token);
  // 3) list the user's Pages (each Page token is itself long-lived) + linked IG
  const pages = await graphGet("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    access_token: userToken,
  });
  const list = (pages.data.data as Array<Record<string, unknown>>) || [];
  if (!pages.ok || !list.length) return { ok: false, error: pages.ok ? "No Facebook Page found on this account. Create/permission a Page, then reconnect." : graphErr(pages.data, pages.status) };
  const p = list[0];
  const ig = p.instagram_business_account as { id?: string; username?: string } | undefined;
  const conn: MetaConnection = {
    brandId, pageId: String(p.id), pageName: String(p.name || "Facebook Page"),
    pageAccessToken: String(p.access_token), igUserId: ig?.id, igUsername: ig?.username,
    connectedAt: nowISO(), tokenSource: "oauth",
  };
  await saveMetaConnection(conn);
  return { ok: true, connection: await metaConnectionPublic(brandId) };
}

// Direct Page-token connect — validate the token can see the Page (and pull the
// linked IG account), then store. Works today with no app review on our side.
export async function connectMetaPageToken(brandId: string, pageId: string, pageAccessToken: string): Promise<{ ok: boolean; error?: string; connection?: MetaConnectionPublic }> {
  const check = await graphGet(`/${encodeURIComponent(pageId)}`, {
    fields: "name,instagram_business_account{id,username}",
    access_token: pageAccessToken,
  });
  if (!check.ok) return { ok: false, error: graphErr(check.data, check.status) };
  const ig = check.data.instagram_business_account as { id?: string; username?: string } | undefined;
  const conn: MetaConnection = {
    brandId, pageId, pageName: String(check.data.name || "Facebook Page"),
    pageAccessToken, igUserId: ig?.id, igUsername: ig?.username,
    connectedAt: nowISO(), tokenSource: "page_token",
  };
  await saveMetaConnection(conn);
  return { ok: true, connection: await metaConnectionPublic(brandId) };
}

// ---- publish -------------------------------------------------------------
export type MetaPostResult = { platform: "facebook" | "instagram"; ok: boolean; postId?: string; error?: string };

async function publishFacebook(conn: MetaConnection, text: string, imageUrl?: string, link?: string): Promise<MetaPostResult> {
  try {
    if (imageUrl) {
      const r = await graphPost(`/${conn.pageId}/photos`, { url: imageUrl, caption: text, access_token: conn.pageAccessToken });
      if (r.ok) return { platform: "facebook", ok: true, postId: String(r.data.post_id || r.data.id || "") };
      return { platform: "facebook", ok: false, error: graphErr(r.data, r.status) };
    }
    const params: Record<string, string> = { message: text, access_token: conn.pageAccessToken };
    if (link) params.link = link;
    const r = await graphPost(`/${conn.pageId}/feed`, params);
    if (r.ok) return { platform: "facebook", ok: true, postId: String(r.data.id || "") };
    return { platform: "facebook", ok: false, error: graphErr(r.data, r.status) };
  } catch (e) { return { platform: "facebook", ok: false, error: (e as Error).message }; }
}

async function publishInstagram(conn: MetaConnection, text: string, imageUrl?: string): Promise<MetaPostResult> {
  if (!conn.igUserId) return { platform: "instagram", ok: false, error: "No Instagram Business account is linked to this Page. Link one in Meta Business settings, then reconnect." };
  if (!imageUrl) return { platform: "instagram", ok: false, error: "Instagram needs an image or video — attach a creative (text-only isn't allowed by Instagram)." };
  try {
    const c = await graphPost(`/${conn.igUserId}/media`, { image_url: imageUrl, caption: text, access_token: conn.pageAccessToken });
    if (!c.ok || !c.data.id) return { platform: "instagram", ok: false, error: graphErr(c.data, c.status) };
    const pub = await graphPost(`/${conn.igUserId}/media_publish`, { creation_id: String(c.data.id), access_token: conn.pageAccessToken });
    if (pub.ok) return { platform: "instagram", ok: true, postId: String(pub.data.id || "") };
    return { platform: "instagram", ok: false, error: graphErr(pub.data, pub.status) };
  } catch (e) { return { platform: "instagram", ok: false, error: (e as Error).message }; }
}

// ASKING META WHETHER A POST WENT UP.
//
// The half of "never post twice" that a claim alone cannot do. When an attempt
// times out, the post may be live; this reads the account's own recent items and
// looks for the text we sent. Only the last few are checked and only within a
// short window, because this runs on a retry moments later — a match from last
// Tuesday would be a different post that happened to say the same thing.
const VERIFY_WINDOW_MS = 30 * 60 * 1000;
const VERIFY_LIMIT = 25;

function metaVerifier(conn: MetaConnection, text: string): RemoteVerifier {
  const wanted = (text || "").trim().slice(0, 200);
  return async (p: Publication) => {
    if (!wanted) return { exists: false };
    const since = Date.now() - VERIFY_WINDOW_MS;

    if (p.channel === "facebook") {
      const r = await graphGet(`/${conn.pageId}/feed`, {
        fields: "id,message,created_time", limit: String(VERIFY_LIMIT), access_token: conn.pageAccessToken,
      });
      if (!r.ok) throw new Error(graphErr(r.data, r.status));
      for (const row of (r.data.data as Array<Record<string, unknown>>) || []) {
        const when = Date.parse(String(row.created_time || ""));
        if (Number.isFinite(when) && when < since) continue;
        if (String(row.message || "").trim().startsWith(wanted.slice(0, 80))) {
          return { exists: true, externalPublicationId: String(row.id || "") };
        }
      }
      return { exists: false };
    }

    if (p.channel === "instagram" && conn.igUserId) {
      const r = await graphGet(`/${conn.igUserId}/media`, {
        fields: "id,caption,timestamp", limit: String(VERIFY_LIMIT), access_token: conn.pageAccessToken,
      });
      if (!r.ok) throw new Error(graphErr(r.data, r.status));
      for (const row of (r.data.data as Array<Record<string, unknown>>) || []) {
        const when = Date.parse(String(row.timestamp || ""));
        if (Number.isFinite(when) && when < since) continue;
        if (String(row.caption || "").trim().startsWith(wanted.slice(0, 80))) {
          return { exists: true, externalPublicationId: String(row.id || "") };
        }
      }
      return { exists: false };
    }

    // An unknown channel is not "definitely not there" — it is unknown, and
    // saying otherwise here would authorise the duplicate.
    throw new Error(`no way to verify a ${p.channel} post`);
  };
}

/**
 * Publish once, and never twice.
 *
 * The claim is written before the Graph call. If the call does not come back,
 * the outcome is recorded as UNCERTAIN rather than failed, so the next attempt
 * asks Meta whether the post exists instead of creating a second one.
 */
async function publishOnce(
  conn: MetaConnection,
  platform: "facebook" | "instagram",
  input: { brandId: string; text: string; mediaUrls?: string[] },
  image: string | undefined,
  nowISO: string,
  send: () => Promise<MetaPostResult>,
): Promise<MetaPostResult> {
  const claim = await claimPublication({
    brandId: input.brandId, channel: platform, text: input.text, mediaUrls: input.mediaUrls,
    nowISO, verifyRemote: metaVerifier(conn, input.text),
  });
  if (!claim.proceed) {
    // Already up counts as ok — the customer asked for it to be posted and it
    // is posted. Reporting a failure would send them to check a feed that
    // already has exactly what they wanted.
    const alreadyUp = claim.publication.state === "published";
    return alreadyUp
      ? { platform, ok: true, postId: claim.publication.externalPublicationId, error: undefined }
      : { platform, ok: false, error: claim.reason };
  }

  const res = await send();
  if (res.ok) {
    await settlePublished(claim.publication.id, res.postId || "", nowISO);
    return res;
  }
  // `looksDefinite` is conservative: only an explicit rejection releases the
  // claim. Everything else stays uncertain, which is what makes the next
  // attempt ask rather than assume.
  await settleFailed(claim.publication.id, res.error || "publish failed", looksDefinite(res.error || ""), nowISO);
  return res;
}

// Publish natively to whichever of {facebook, instagram} are requested AND
// connected. Returns per-platform results; the caller merges with Zernio for the
// remaining platforms. Only http(s) media posts (data:/blob: previews dropped).
export async function publishNativeMeta(input: { brandId: string; text: string; platforms: string[]; mediaUrls?: string[] }): Promise<{ handled: string[]; results: MetaPostResult[] } | null> {
  const conn = await getMetaConnection(input.brandId);
  if (!conn) return null;
  const want = input.platforms.filter((p) => p === "facebook" || p === "instagram");
  if (!want.length) return null;
  // The emergency stop, before the Graph call. Returned as a per-platform
  // failure rather than null, because null means "not connected" here and an
  // operator reading "not connected" during a halt would go looking for an
  // integration fault that does not exist.
  const halt = await haltFor("publish", input.brandId);
  if (halt.halted) {
    return { handled: want, results: want.map((p) => ({ platform: p as "facebook" | "instagram", ok: false, error: halt.message })) };
  }
  const image = (input.mediaUrls || []).find((u) => /^https?:\/\//i.test(u));
  const results: MetaPostResult[] = [];
  const nowISO = new Date().toISOString();
  if (want.includes("facebook")) {
    results.push(await publishOnce(conn, "facebook", input, image, nowISO, () => publishFacebook(conn, input.text, image)));
  }
  if (want.includes("instagram")) {
    results.push(await publishOnce(conn, "instagram", input, image, nowISO, () => publishInstagram(conn, input.text, image)));
  }
  return { handled: want, results };
}

export function metaStatus() {
  return {
    service: "meta-native",
    oauthConfigured: metaOAuthConfigured(),
    graphVersion: GRAPH_VERSION,
    channels: ["facebook", "instagram"],
    note: metaOAuthConfigured()
      ? "Native Meta publishing is available via Connect with Facebook (OAuth) or a Page token."
      : "Native Meta publishing works today via a Page access token. Add FB_APP_ID + FB_APP_SECRET to enable one-click Connect with Facebook (OAuth).",
  };
}
