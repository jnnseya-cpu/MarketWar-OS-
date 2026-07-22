// MarketWar OS — grant a role (default: executive / super-admin) to an EXISTING
// signed-up account, by setting the Firebase custom claim the platform reads.
//
// Use this to give your own account admin access after you've signed up on the
// live site. It sets { role, scopes } exactly as scripts/seed-accounts.mjs does,
// so the Admin Centre + admin APIs (platform_admin / admin_billing / tenant_manage)
// unlock. Idempotent — re-running just re-sets the claim.
//
// Requirements (Admin SDK server creds — never commit their values):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//
// Usage:
//   FIREBASE_PROJECT_ID=… FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY="…" \
//   node scripts/grant-admin.mjs you@example.com [role]
//
// role defaults to "executive". After running, SIGN OUT and back IN (or refresh
// the token) so the new claim lands in your ID token.

const SCOPES = {
  executive: ["platform_admin", "admin_billing", "tenant_manage", "support_view"],
  commercial_director: ["admin_billing", "tenant_manage", "support_view"],
  sales_manager: ["admin_billing", "tenant_manage", "support_view"],
  sales_rep: ["tenant_manage", "support_view"],
  support: ["support_view"],
  business_owner: ["workspace_owner", "workspace_use"],
  team_member: ["workspace_use"],
};

const email = process.argv[2];
const role = process.argv[3] || "executive";
if (!email) {
  console.error("Usage: node scripts/grant-admin.mjs <email> [role]");
  process.exit(1);
}
if (!SCOPES[role]) {
  console.error(`Unknown role "${role}". One of: ${Object.keys(SCOPES).join(", ")}`);
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("Set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY first.");
  process.exit(1);
}

const { cert, getApps, initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth(app);
const db = getFirestore(app);

try {
  const user = await auth.getUserByEmail(email);
  const scopes = SCOPES[role];
  await auth.setCustomUserClaims(user.uid, { role, scopes });
  // Mirror onto the Firestore profile (kept in sync with the claim).
  await db.collection("users").doc(user.uid).set({ email, role, scopes, updatedAt: new Date().toISOString() }, { merge: true });
  console.log(`✓ Granted "${role}" to ${email} (uid ${user.uid}).`);
  console.log("  Sign OUT and back IN (or refresh the token) for it to take effect.");
  process.exit(0);
} catch (e) {
  console.error(`Failed: ${e.message}`);
  console.error("Make sure the email has already signed up on the live site.");
  process.exit(1);
}
