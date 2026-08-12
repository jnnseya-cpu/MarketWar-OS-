// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Brand-ownership access control — the multi-tenant isolation gate.
//
// The persistence layer (results ledger, settings, video jobs, publish) is
// partitioned by a client-chosen `brandId`. On its own that is NOT a security
// boundary: any caller could pass another brand's id and read/forge/delete its
// data. This guard turns `brandId` into an authorised scope.
//
// Model — claim-on-first-use:
//   • The FIRST authenticated user to touch a brandId claims it: a
//     brands/{brandId} record is written with { ownerId: uid }.
//   • Thereafter only that owner (production) may act on the brand; anyone else
//     gets 403. The claim is atomic (Firestore transaction) so two racing
//     requests can never both win.
//
// Demo-safe by construction: when the Admin SDK is NOT configured (zero-config
// demo / CI / the owner's keyless local test), there are no accounts to enforce
// and every brandId passes through — preserving the platform's zero-config rule.
// The moment Firebase Admin is configured (production), isolation is enforced.
//
// Fails CLOSED: if the ownership check itself errors in production, access is
// denied — a brand's data is never leaked because the store hiccuped.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { requireAuth } from "@/backend/guard";
import { record as recordSecurityEvent, actorFor } from "@/backend/sentinel";
import type { Role } from "@/shared/roles";

export type BrandAccess =
  | { ok: true; enforced: boolean; uid: string | null; role: Role | null }
  | { ok: false; status: number; error: string };

const COLLECTION = "brands";

export async function resolveBrandAccess(req: Request, brandIdRaw: string): Promise<BrandAccess> {
  const brandId = (brandIdRaw || "").trim();
  if (!brandId) return { ok: false, status: 400, error: "brandId is required" };

  // Authenticate first (verifies the Firebase ID token when Admin is configured).
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  // ISO2 — fail CLOSED in production if Admin isn't configured. Without it there
  // are no verified identities, so "pass through" would serve every brand's data
  // to anyone. A real deployment must configure Firebase Admin; refuse until it
  // does rather than leak. (Mirror of the webhook route's unsigned-in-prod guard.)
  if (process.env.NODE_ENV === "production" && (!adminConfigured || !adminDb)) {
    return { ok: false, status: 503, error: "Isolation unavailable — Firebase Admin is not configured on this deployment. Set the FIREBASE_* admin credentials to enforce per-brand ownership." };
  }

  // Zero-config demo / no Admin (dev/CI): nothing to enforce — pass through.
  if (!auth.enforced || !adminConfigured || !adminDb) {
    return { ok: true, enforced: false, uid: auth.uid, role: auth.role };
  }

  const uid = auth.uid;
  if (!uid) return { ok: false, status: 401, error: "Authentication required" };

  try {
    const ref = adminDb.collection(COLLECTION).doc(brandId);
    // Atomic claim-or-verify so racing requests can never both claim.
    const verdict = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, { brandId, ownerId: uid, createdAt: new Date().toISOString() });
        return "owner" as const;
      }
      const owner = (snap.data() as { ownerId?: string }).ownerId;
      return owner === uid ? ("owner" as const) : ("denied" as const);
    });

    if (verdict === "denied") {
      // One of these is a stale tab. Five in half an hour is somebody trying ids,
      // which is exactly the shape Sentinel's tenant-probing rule looks for.
      recordSecurityEvent({ at: new Date().toISOString(), kind: "tenant_denied", actor: actorFor(req, uid), brandId, detail: "brand belongs to another account" });
      return { ok: false, status: 403, error: "This brand belongs to another account" };
    }
    return { ok: true, enforced: true, uid, role: auth.role };
  } catch {
    // Fail closed: never fall through to serving another brand's data.
    return { ok: false, status: 503, error: "Brand access check temporarily unavailable" };
  }
}

// Who owns a brand, for work that runs with no request behind it.
//
// The scheduler has no session: nobody is signed in at 3am. Unattended spend
// still has to be charged to somebody, and charging it to nobody would make it
// free AI — the exact thing §63 removed. So the runner looks the owner up and
// meters against their wallet.
//
// Returns null when Admin is not configured (demo/CI), which is the same state
// in which metering is not enforced anyway.
export async function brandOwnerId(brandId: string): Promise<string | null> {
  if (!adminConfigured || !adminDb) return null;
  const id = (brandId || "").trim();
  if (!id) return null;
  try {
    const snap = await adminDb.collection(COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const owner = (snap.data() as { ownerId?: string }).ownerId;
    return typeof owner === "string" && owner ? owner : null;
  } catch {
    return null;
  }
}
