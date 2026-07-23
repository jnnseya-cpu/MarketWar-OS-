// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Partner / creator / affiliate application store — the REAL capture behind the
// Growth & Influencers page. An applicant's submission persists to Firestore
// ("partner_applications") with an in-memory fallback for zero-config, so
// "Register your interest" actually DOES something (a stored, reviewable
// application) instead of linking to a dead contact page. Onboarding still
// happens as tiers open — but the application is captured for real, now.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type PartnerTier = "promoter" | "creator" | "affiliate" | "agency";

export type PartnerApplication = {
  id: string;
  tier: PartnerTier;
  programmes: number;     // how many programmes (1–100) they subscribe to
  followers: number;      // total followers across all socials + YouTube
  payoutEligible: boolean; // followers >= 10k gate
  name: string;
  email: string;
  audience: string;   // where they have reach (channels + size)
  website?: string;
  notes?: string;
  status: "received"; // future: "reviewing" | "accepted" | "waitlisted"
  createdAt: string;
};

const mem = new Map<string, PartnerApplication>();

// Deterministic id from email+tier so a re-submit updates the same record
// rather than piling duplicates (no Date.now in the id).
function appId(email: string, tier: string): string {
  let h = 2166136261;
  const s = `${email.toLowerCase()}::${tier}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `pa_${(h >>> 0).toString(16)}`;
}

export async function savePartnerApplication(
  input: { tier: PartnerTier; programmes: number; followers: number; name: string; email: string; audience: string; website?: string; notes?: string; nowISO: string },
): Promise<PartnerApplication> {
  const record: PartnerApplication = {
    id: appId(input.email, input.tier),
    tier: input.tier,
    programmes: input.programmes,
    followers: input.followers,
    payoutEligible: input.followers >= 10_000,
    name: input.name,
    email: input.email,
    audience: input.audience,
    status: "received",
    createdAt: input.nowISO,
  };
  // Only attach optional fields when present — Firestore rejects `undefined`.
  if (input.website) record.website = input.website;
  if (input.notes) record.notes = input.notes;
  if (adminConfigured && adminDb) {
    await adminDb.collection("partner_applications").doc(record.id).set(record, { merge: true });
  } else {
    mem.set(record.id, record);
  }
  return record;
}

export async function listPartnerApplications(): Promise<PartnerApplication[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("partner_applications").limit(500).get();
    return snap.docs.map((d) => d.data() as PartnerApplication);
  }
  return [...mem.values()];
}
