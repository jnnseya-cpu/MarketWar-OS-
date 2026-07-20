// MarketWar OS — seed the platform accounts (admin + every role) for testing.
//
// Creates one Firebase Auth user per role in src/shared/roles.ts SEED_ACCOUNTS,
// sets a custom claim { role, scopes } so access + commercial authority work,
// and writes a Firestore /users/{uid} profile. Idempotent: re-running updates
// claims/profile without duplicating users.
//
// Requirements (server-side secrets — never committed):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY   (Admin SDK)
//   SEED_PASSWORD   — the password set on every seeded account (choose a strong one)
//
// Usage:
//   FIREBASE_PROJECT_ID=… FIREBASE_CLIENT_EMAIL=… FIREBASE_PRIVATE_KEY="…" \
//   SEED_PASSWORD='Str0ng-Test-Pass!' node scripts/seed-accounts.mjs
//
// With no Admin SDK env set it prints the plan and exits 0 (safe dry-run).

import { readFileSync } from "node:fs";

// Read SEED_ACCOUNTS out of the shared TS module without a build step.
function loadSeedAccounts() {
  const src = readFileSync(new URL("../src/shared/roles.ts", import.meta.url), "utf8");
  const start = src.indexOf("SEED_ACCOUNTS");
  const arrStart = src.indexOf("[", start);
  const arrEnd = src.indexOf("];", arrStart);
  const body = src.slice(arrStart + 1, arrEnd);
  const accounts = [];
  for (const m of body.matchAll(/email:\s*"([^"]+)",\s*role:\s*"([^"]+)",\s*displayName:\s*"([^"]+)"/g)) {
    accounts.push({ email: m[1], role: m[2], displayName: m[3] });
  }
  return accounts;
}

// Scopes per role — kept in sync with src/shared/roles.ts.
const SCOPES = {
  executive: ["platform_admin", "admin_billing", "tenant_manage", "support_view"],
  commercial_director: ["admin_billing", "tenant_manage", "support_view"],
  sales_manager: ["admin_billing", "tenant_manage", "support_view"],
  sales_rep: ["tenant_manage", "support_view"],
  support: ["support_view"],
  business_owner: ["workspace_owner", "workspace_use"],
  team_member: ["workspace_use"],
};

const accounts = loadSeedAccounts();
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const password = process.env.SEED_PASSWORD;

console.log(`MarketWar OS — account seeding (${accounts.length} accounts)\n`);
for (const a of accounts) console.log(`  • ${a.email.padEnd(30)} ${a.role}`);

if (!projectId || !clientEmail || !privateKey) {
  console.log("\nDry run — Admin SDK env not set (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY).");
  console.log("Set them + SEED_PASSWORD and re-run to create the accounts. No changes made.");
  process.exit(0);
}
if (!password) {
  console.error("\nSEED_PASSWORD is required (the password for every seeded account). Aborting.");
  process.exit(1);
}

const { cert, getApps, initializeApp } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
const { getFirestore } = await import("firebase-admin/firestore");

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth(app);
const db = getFirestore(app);

let created = 0, updated = 0;
for (const a of accounts) {
  const scopes = SCOPES[a.role] || [];
  let user;
  try {
    user = await auth.getUserByEmail(a.email);
    await auth.updateUser(user.uid, { password, displayName: a.displayName, emailVerified: true });
    updated += 1;
  } catch {
    user = await auth.createUser({ email: a.email, password, displayName: a.displayName, emailVerified: true });
    created += 1;
  }
  await auth.setCustomUserClaims(user.uid, { role: a.role, scopes });
  await db.collection("users").doc(user.uid).set(
    { email: a.email, role: a.role, scopes, displayName: a.displayName, seeded: true },
    { merge: true }
  );
  console.log(`  ✓ ${a.email} (${a.role})`);
}

console.log(`\nDone — ${created} created, ${updated} updated. All accounts share SEED_PASSWORD.`);
console.log("Rotate or disable these before production. Sign in at /login.");
