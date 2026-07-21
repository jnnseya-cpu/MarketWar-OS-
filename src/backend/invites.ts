// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Company invites — the admin invites a (multi-brand) company to test.
//
// An invite carries the company name, the plan + brand allotment they get, and
// a token. The invited person opens /signup?invite=<token>, signs up, and the
// invite is marked accepted. Persistence: Firestore (invites/{token}) when the
// Admin SDK is configured, else in-memory for the zero-config test. Tokens are
// random and unguessable; only non-sensitive fields are exposed to the public
// validation endpoint.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type InviteStatus = "pending" | "accepted" | "revoked";

export type Invite = {
  token: string;
  email: string;
  companyName: string;
  planId: string;
  brands: number;       // brand allotment for the test
  role: string;         // the tenant role granted (business_owner)
  note?: string;
  status: InviteStatus;
  createdAt: string;
  acceptedAt?: string;
  acceptedUid?: string;
};

const mem = new Map<string, Invite>();

function token(): string {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "").slice(0, 24); } catch { /* noop */ }
  return `inv_${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export async function createInvite(input: { email: string; companyName: string; planId?: string; brands?: number; role?: string; note?: string; nowISO?: string }): Promise<Invite> {
  const invite: Invite = {
    token: token(),
    email: (input.email || "").trim().toLowerCase(),
    companyName: (input.companyName || "").trim() || "Invited company",
    planId: input.planId || "growth",
    brands: Math.max(1, Math.round(input.brands ?? 3)),
    role: input.role || "business_owner",
    note: input.note?.trim() || undefined,
    status: "pending",
    createdAt: input.nowISO || new Date().toISOString(),
  };
  if (adminConfigured && adminDb) await adminDb.collection("invites").doc(invite.token).set(invite);
  else mem.set(invite.token, invite);
  return invite;
}

export async function listInvites(): Promise<Invite[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("invites").get();
    return snap.docs.map((d) => d.data() as Invite).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  return [...mem.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getInvite(t: string): Promise<Invite | null> {
  if (!t) return null;
  if (adminConfigured && adminDb) {
    const doc = await adminDb.collection("invites").doc(t).get();
    return doc.exists ? (doc.data() as Invite) : null;
  }
  return mem.get(t) ?? null;
}

export async function acceptInvite(t: string, ctx?: { uid?: string; nowISO?: string }): Promise<Invite | { error: string }> {
  const invite = await getInvite(t);
  if (!invite) return { error: "Invite not found" };
  if (invite.status === "revoked") return { error: "This invite has been revoked" };
  const accepted: Invite = { ...invite, status: "accepted", acceptedAt: ctx?.nowISO || new Date().toISOString(), acceptedUid: ctx?.uid };
  if (adminConfigured && adminDb) await adminDb.collection("invites").doc(t).set(accepted);
  else mem.set(t, accepted);
  return accepted;
}

export async function revokeInvite(t: string): Promise<{ ok: boolean }> {
  const invite = await getInvite(t);
  if (!invite) return { ok: false };
  const revoked: Invite = { ...invite, status: "revoked" };
  if (adminConfigured && adminDb) await adminDb.collection("invites").doc(t).set(revoked);
  else mem.set(t, revoked);
  return { ok: true };
}

// Public view — only non-sensitive fields for the signup banner.
export function publicInvite(i: Invite) {
  return { token: i.token, companyName: i.companyName, planId: i.planId, brands: i.brands, status: i.status };
}
