// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHO ELSE MAY WORK ON THIS BRAND.
//
// `resolveBrandAccess` has always answered one question — is this uid the uid
// that claimed the brand — and denied everybody else. That is correct isolation
// and it is also why `team_member`, a role this platform has declared since the
// beginning, has never been usable: a teammate cannot open their own company's
// brand.
//
// An agency is the same gap seen from further out. Its people work on brands
// they do not personally own.
//
// THE RULE THAT KEEPS THIS FROM BEING A HOLE.
//
// Access is now: OWNER, or an EXPLICIT GRANT MADE BY SOMEBODY ENTITLED TO MAKE
// IT. Nothing else changes. In particular:
//
//   • The owner path is untouched. A brand's owner is its owner for ever and no
//     grant, revocation or workspace arrangement can lock them out.
//   • Nothing that was denied becomes allowed except through a recorded grant.
//     There is no inference, no "same email domain", no implicit sharing.
//   • Only `invite_users` can grant, and nobody can grant a role wider than
//     their own — otherwise a reviewer promotes themselves to admin in one call.
//   • Every grant and revocation goes in the audit log with who did it.
//
// A WORKSPACE IS A GROUPING, NOT A NEW TENANCY MODEL.
//
// Organisation → Workspace → Client → Brand is the shape the spec asks for.
// Rebuilding tenancy around it would put per-brand isolation — a
// non-negotiable — through a rewrite for something nobody has used yet. So a
// workspace holds brands, a grant may be made at either level, and a workspace
// grant is inherited by the brands in it. Isolation still resolves per brand.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { record as auditRecord } from "@/backend/audit-log";
import {
  can, widerRole, isWorkspaceRole,
  type WorkspaceRole, type Permission,
} from "@/shared/workspace";

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export type Membership = {
  id: string;
  /** The brand, or the workspace when `scope` is "workspace". */
  targetId: string;
  scope: "brand" | "workspace";
  uid: string;
  role: WorkspaceRole;
  grantedBy: string;
  grantedAt: string;
  revokedBy?: string;
  revokedAt?: string;
  note?: string;
};

export type Workspace = {
  id: string;
  name: string;
  /** The organisation above it, when an agency has more than one. */
  organisationId?: string;
  /** Brands this workspace covers. A brand may sit in exactly one workspace. */
  brandIds: string[];
  createdBy: string;
  createdAt: string;
};

const MEMBERSHIPS = "memberships";
const WORKSPACES = "workspaces";
const useDb = () => adminConfigured && Boolean(adminDb);

const memMembers = new Map<string, Membership>();
const memWorkspaces = new Map<string, Workspace>();

const membershipId = (scope: string, targetId: string, uid: string) =>
  `mb_${hid(`${scope}|${targetId}|${uid}`)}`;

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export async function createWorkspace(input: {
  name: string; createdBy: string; organisationId?: string; nowISO?: string;
}): Promise<{ ok: false; error: string } | { ok: true; workspace: Workspace }> {
  const name = (input.name || "").trim();
  if (!name) return { ok: false, error: "A workspace needs a name." };
  if (!(input.createdBy || "").trim()) return { ok: false, error: "createdBy required." };

  const workspace: Workspace = {
    id: `ws_${hid(`${name}|${input.createdBy}`)}`,
    name,
    brandIds: [],
    createdBy: input.createdBy,
    createdAt: input.nowISO || new Date().toISOString(),
  };
  if (input.organisationId) workspace.organisationId = input.organisationId;

  memWorkspaces.set(workspace.id, workspace);
  if (useDb()) {
    try { await adminDb!.collection(WORKSPACES).doc(workspace.id).set(workspace); } catch { /* memory holds it */ }
  }
  // Whoever creates a workspace owns it, or nobody could add anything to it.
  await grant({
    scope: "workspace", targetId: workspace.id, uid: input.createdBy,
    role: "owner", grantedBy: input.createdBy, nowISO: workspace.createdAt,
    bypassPermissionCheck: true,
  });
  return { ok: true, workspace };
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  if (useDb()) {
    try {
      const doc = await adminDb!.collection(WORKSPACES).doc(id).get();
      if (doc.exists) return doc.data() as Workspace;
    } catch { /* fall through */ }
  }
  return memWorkspaces.get(id) || null;
}

/** Put a brand under a workspace so grants made there reach it. */
export async function addBrandToWorkspace(input: {
  workspaceId: string; brandId: string; actorUid: string;
}): Promise<{ ok: false; error: string } | { ok: true; workspace: Workspace }> {
  const ws = await getWorkspace(input.workspaceId);
  if (!ws) return { ok: false, error: "No such workspace." };
  const allowed = await hasPermission(input.actorUid, input.workspaceId, "invite_users", { scope: "workspace" });
  if (!allowed.allowed) return { ok: false, error: allowed.reason };

  if (!ws.brandIds.includes(input.brandId)) ws.brandIds.push(input.brandId);
  memWorkspaces.set(ws.id, ws);
  if (useDb()) {
    try { await adminDb!.collection(WORKSPACES).doc(ws.id).set(ws); } catch { /* memory holds it */ }
  }
  auditRecord({
    actorType: "user", actor: input.actorUid, action: "workspace.brand_added",
    resource: "workspace", resourceId: ws.id, brandId: input.brandId,
    after: { brandIds: ws.brandIds.join(",") },
  });
  return { ok: true, workspace: ws };
}

/** Which workspace, if any, covers this brand. */
export async function workspaceForBrand(brandId: string): Promise<Workspace | null> {
  if (useDb()) {
    try {
      const snap = await adminDb!.collection(WORKSPACES).where("brandIds", "array-contains", brandId).limit(1).get();
      if (!snap.empty) return snap.docs[0].data() as Workspace;
    } catch { /* fall through */ }
  }
  for (const ws of memWorkspaces.values()) if (ws.brandIds.includes(brandId)) return ws;
  return null;
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export type GrantInput = {
  scope: "brand" | "workspace";
  targetId: string;
  uid: string;
  role: WorkspaceRole;
  grantedBy: string;
  note?: string;
  nowISO?: string;
  /** Only for bootstrapping a workspace's own creator. Never exposed to a route. */
  bypassPermissionCheck?: boolean;
};

export type GrantResult = { ok: false; error: string } | { ok: true; membership: Membership };

/**
 * Give somebody a role.
 *
 * NOBODY CAN GRANT A ROLE WIDER THAN THEIR OWN. Without that rule a reviewer
 * grants themselves admin in a single call, and every other permission in the
 * file becomes decorative.
 */
export async function grant(input: GrantInput): Promise<GrantResult> {
  const targetId = (input.targetId || "").trim();
  const uid = (input.uid || "").trim();
  const grantedBy = (input.grantedBy || "").trim();
  if (!targetId || !uid || !grantedBy) return { ok: false, error: "scope, targetId, uid and grantedBy are all required." };
  if (!isWorkspaceRole(input.role)) return { ok: false, error: `"${input.role}" is not a workspace role.` };

  if (!input.bypassPermissionCheck) {
    const actor = await hasPermission(grantedBy, targetId, "invite_users", { scope: input.scope });
    if (!actor.allowed) return { ok: false, error: actor.reason };
    // The escalation guard. `owner` is only ever grantable by an owner.
    const actorRole = actor.role;
    if (actorRole && actorRole !== "owner") {
      const wider = widerRole(actorRole, input.role);
      if (wider !== actorRole) {
        return { ok: false, error: `A ${actorRole} cannot grant ${input.role} — nobody may hand out more than they hold.` };
      }
    }
  }

  const nowISO = input.nowISO || new Date().toISOString();
  const membership: Membership = {
    id: membershipId(input.scope, targetId, uid),
    scope: input.scope, targetId, uid, role: input.role,
    grantedBy, grantedAt: nowISO,
  };
  if (input.note) membership.note = input.note.slice(0, 500);

  const previous = memMembers.get(membership.id);
  memMembers.set(membership.id, membership);
  if (useDb()) {
    try { await adminDb!.collection(MEMBERSHIPS).doc(membership.id).set(membership); } catch { /* memory holds it */ }
  }

  auditRecord({
    actorType: "user", actor: grantedBy, action: "membership.granted",
    resource: "membership", resourceId: membership.id,
    brandId: input.scope === "brand" ? targetId : undefined,
    before: previous && !previous.revokedAt ? { uid: previous.uid, role: previous.role } : undefined,
    after: { uid, role: input.role, scope: input.scope, target: targetId },
    reason: input.note, nowISO,
  });
  return { ok: true, membership };
}

export async function revoke(input: {
  scope: "brand" | "workspace"; targetId: string; uid: string; revokedBy: string; nowISO?: string;
}): Promise<{ ok: false; error: string } | { ok: true; membership: Membership }> {
  const id = membershipId(input.scope, input.targetId, input.uid);
  const existing = await getMembership(id);
  if (!existing || existing.revokedAt) return { ok: false, error: "That person has no active grant here." };

  const actor = await hasPermission(input.revokedBy, input.targetId, "invite_users", { scope: input.scope });
  if (!actor.allowed) return { ok: false, error: actor.reason };

  const nowISO = input.nowISO || new Date().toISOString();
  const revoked: Membership = { ...existing, revokedBy: input.revokedBy, revokedAt: nowISO };
  memMembers.set(id, revoked);
  if (useDb()) {
    try { await adminDb!.collection(MEMBERSHIPS).doc(id).set(revoked); } catch { /* memory holds it */ }
  }
  auditRecord({
    actorType: "user", actor: input.revokedBy, action: "membership.revoked",
    resource: "membership", resourceId: id,
    brandId: input.scope === "brand" ? input.targetId : undefined,
    before: { uid: existing.uid, role: existing.role },
    after: { uid: existing.uid, role: "none" },
    nowISO,
  });
  return { ok: true, membership: revoked };
}

async function getMembership(id: string): Promise<Membership | null> {
  if (useDb()) {
    try {
      const doc = await adminDb!.collection(MEMBERSHIPS).doc(id).get();
      if (doc.exists) return doc.data() as Membership;
    } catch { /* fall through */ }
  }
  return memMembers.get(id) || null;
}

/**
 * The role this uid holds on this brand, from every route that could give them
 * one. Returns null when they hold none — which is a denial, not an oversight.
 */
export async function roleFor(uid: string, brandId: string): Promise<WorkspaceRole | null> {
  if (!uid || !brandId) return null;

  const direct = await getMembership(membershipId("brand", brandId, uid));
  const roles: WorkspaceRole[] = [];
  if (direct && !direct.revokedAt) roles.push(direct.role);

  const ws = await workspaceForBrand(brandId);
  if (ws) {
    const viaWorkspace = await getMembership(membershipId("workspace", ws.id, uid));
    if (viaWorkspace && !viaWorkspace.revokedAt) roles.push(viaWorkspace.role);
  }

  if (!roles.length) return null;
  return roles.reduce((a, b) => widerRole(a, b));
}

export type PermissionVerdict =
  | { allowed: true; role: WorkspaceRole; reason: string }
  | { allowed: false; role: WorkspaceRole | null; reason: string };

/**
 * May this person do this here?
 *
 * `scope: "workspace"` checks a grant on the workspace itself — used when the
 * target IS a workspace, such as adding a brand to it.
 */
export async function hasPermission(
  uid: string,
  targetId: string,
  permission: Permission,
  opts: { scope?: "brand" | "workspace" } = {},
): Promise<PermissionVerdict> {
  if (!uid) return { allowed: false, role: null, reason: "Not signed in." };

  const role = opts.scope === "workspace"
    ? (await getMembership(membershipId("workspace", targetId, uid)).then((m) => (m && !m.revokedAt ? m.role : null)))
    : await roleFor(uid, targetId);

  if (!role) return { allowed: false, role: null, reason: "You have no role on this." };
  if (!can(role, permission)) {
    return { allowed: false, role, reason: `A ${role.replace(/_/g, " ")} cannot ${permission.replace(/_/g, " ")} here.` };
  }
  return { allowed: true, role, reason: `Allowed as ${role.replace(/_/g, " ")}.` };
}

/** Everyone with an active grant on a brand or workspace. */
export async function membersOf(scope: "brand" | "workspace", targetId: string): Promise<Membership[]> {
  const local = Array.from(memMembers.values()).filter((m) => m.scope === scope && m.targetId === targetId && !m.revokedAt);
  if (!useDb()) return local;
  try {
    const snap = await adminDb!.collection(MEMBERSHIPS).where("scope", "==", scope).where("targetId", "==", targetId).get();
    const rows = (snap.docs.map((d) => d.data() as Membership)).filter((m) => !m.revokedAt);
    const byId = new Map<string, Membership>();
    for (const m of [...rows, ...local]) byId.set(m.id, m);
    return Array.from(byId.values());
  } catch {
    return local;
  }
}

/** Every brand this person can reach — the agency's "all clients" list. */
export async function brandsFor(uid: string): Promise<{ brandId: string; role: WorkspaceRole; via: "brand" | "workspace" }[]> {
  const out: { brandId: string; role: WorkspaceRole; via: "brand" | "workspace" }[] = [];
  const seen = new Set<string>();

  const all = useDb()
    ? await adminDb!.collection(MEMBERSHIPS).where("uid", "==", uid).get()
        .then((s) => s.docs.map((d) => d.data() as Membership)).catch(() => [] as Membership[])
    : Array.from(memMembers.values()).filter((m) => m.uid === uid);

  for (const m of all.filter((x) => !x.revokedAt)) {
    if (m.scope === "brand") {
      if (seen.has(m.targetId)) continue;
      seen.add(m.targetId);
      out.push({ brandId: m.targetId, role: m.role, via: "brand" });
    } else {
      const ws = await getWorkspace(m.targetId);
      for (const brandId of ws?.brandIds || []) {
        if (seen.has(brandId)) continue;
        seen.add(brandId);
        out.push({ brandId, role: m.role, via: "workspace" });
      }
    }
  }
  return out;
}

export const MEMBERSHIP_DOCTRINE = [
  "The brand owner is its owner for ever. No grant, revocation or workspace arrangement can lock them out of their own brand.",
  "Nothing that was denied becomes allowed except through a recorded grant. No inference, no shared email domain, no implicit sharing.",
  "Nobody can grant a role wider than their own. Without that a reviewer promotes themselves to admin in one call and every permission becomes decorative.",
  "A workspace is a grouping, not a new tenancy model. Isolation still resolves per brand; a workspace grant is simply inherited by the brands in it.",
  "Every grant and revocation is in the audit log, with the role before and after and who did it.",
];

/** Test seam. Never called by product code. */
export function __resetMembership(): void {
  memMembers.clear();
  memWorkspaces.clear();
}
