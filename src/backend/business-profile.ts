// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Google Business Profile client — REAL local listing data (locations, ratings,
// reviews) for the business's verified profile. This is what turns Local
// Domination from estimates into measured local truth. Read-mostly. Uses the
// shared Google token provider; returns an honest "not connected" shape when no
// credential is set. NOTE: Business Profile requires an OAuth USER credential
// (service accounts generally can't access it) and Google API allowlisting.

import { getGoogleAccessToken, googleAuthMode, GOOGLE_SCOPES } from "@/backend/google-auth";

const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS = "https://mybusiness.googleapis.com/v4";

export function businessProfileConfigured(): boolean { return googleAuthMode() !== "none"; }

export type GBPLocation = { name: string; title: string; address?: string; website?: string; phone?: string };
export type GBPReviewSummary = { averageRating: number; totalReviewCount: number; recent: { rating: number; comment: string; reviewer: string }[] };

async function gbpGet(url: string, token: string): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export async function listAccounts(): Promise<{ mode: "live" | "not_connected"; accounts: { name: string; accountName?: string }[]; note: string }> {
  if (!businessProfileConfigured()) return { mode: "not_connected", accounts: [], note: "Business Profile not connected — set a Google OAuth credential." };
  if (googleAuthMode() === "service_account") return { mode: "not_connected", accounts: [], note: "Business Profile needs an OAuth USER credential (service accounts can't access it). Set GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN." };
  const token = await getGoogleAccessToken(GOOGLE_SCOPES.businessProfile);
  if (!token) return { mode: "not_connected", accounts: [], note: "Google token exchange failed — check the OAuth credential." };
  try {
    const r = await gbpGet(`${ACCOUNTS}/accounts`, token);
    if (!r.ok) return { mode: "not_connected", accounts: [], note: `Business Profile API error (HTTP ${r.status}) — the API may need allowlisting by Google.` };
    const accounts = ((r.data.accounts as Array<Record<string, unknown>>) || []).map((a) => ({ name: String(a.name), accountName: a.accountName as string | undefined }));
    return { mode: "live", accounts, note: "Live Business Profile accounts." };
  } catch (e) { return { mode: "not_connected", accounts: [], note: `Couldn't reach Business Profile: ${(e as Error).message}` }; }
}

export async function listLocations(accountName: string): Promise<{ mode: "live" | "not_connected"; locations: GBPLocation[]; note: string }> {
  const token = await getGoogleAccessToken(GOOGLE_SCOPES.businessProfile);
  if (!token) return { mode: "not_connected", locations: [], note: "Business Profile not connected." };
  try {
    const readMask = "name,title,storefrontAddress,websiteUri,phoneNumbers";
    const r = await gbpGet(`${INFO}/${accountName}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100`, token);
    if (!r.ok) return { mode: "not_connected", locations: [], note: `Business Profile API error (HTTP ${r.status}).` };
    const locations = ((r.data.locations as Array<Record<string, unknown>>) || []).map((l) => {
      const addr = l.storefrontAddress as { addressLines?: string[]; locality?: string; postalCode?: string } | undefined;
      const phones = l.phoneNumbers as { primaryPhone?: string } | undefined;
      return { name: String(l.name), title: String(l.title || ""), address: addr ? [...(addr.addressLines || []), addr.locality, addr.postalCode].filter(Boolean).join(", ") : undefined, website: l.websiteUri as string | undefined, phone: phones?.primaryPhone };
    });
    return { mode: "live", locations, note: "Live Business Profile locations." };
  } catch (e) { return { mode: "not_connected", locations: [], note: `Couldn't reach Business Profile: ${(e as Error).message}` }; }
}

export async function locationReviews(locationName: string): Promise<{ mode: "live" | "not_connected"; summary?: GBPReviewSummary; note: string }> {
  const token = await getGoogleAccessToken(GOOGLE_SCOPES.businessProfile);
  if (!token) return { mode: "not_connected", note: "Business Profile not connected." };
  try {
    // Reviews live on the legacy v4 endpoint (accounts/*/locations/*/reviews).
    const r = await gbpGet(`${REVIEWS}/${locationName}/reviews`, token);
    if (!r.ok) return { mode: "not_connected", note: `Reviews API error (HTTP ${r.status}).` };
    const starMap: Record<string, number> = { STAR_RATING_UNSPECIFIED: 0, ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const reviews = (r.data.reviews as Array<Record<string, unknown>>) || [];
    const recent = reviews.slice(0, 5).map((rv) => ({ rating: starMap[String(rv.starRating)] ?? 0, comment: String(rv.comment || ""), reviewer: String((rv.reviewer as { displayName?: string })?.displayName || "Anonymous") }));
    return { mode: "live", summary: { averageRating: Number(r.data.averageRating || 0), totalReviewCount: Number(r.data.totalReviewCount || 0), recent }, note: "Live Business Profile reviews." };
  } catch (e) { return { mode: "not_connected", note: `Couldn't reach reviews: ${(e as Error).message}` }; }
}
