#!/usr/bin/env node
// TEST THE FIREBASE CREDENTIAL WITHOUT DEPLOYING, AND WITHOUT SHOWING IT TO ANYBODY.
//
// The loop this exists to end: paste the key into the host, redeploy, wait,
// open a health endpoint, read "not configured", guess at what was wrong, paste
// it again. Four minutes a turn and no information at the end of it — the owner
// asked, reasonably, how many times they were expected to add the same variable.
//
// This answers it on their own machine, offline, in a second. It runs the EXACT
// loader the server runs, so a pass here means a pass in production; there is no
// second implementation to disagree with the first.
//
//   node scripts/check-firebase-key.mjs path/to/service-account.json
//   node scripts/check-firebase-key.mjs                 # reads the current env
//
// IT PRINTS NO SECRET. Lengths, a one-way fingerprint, and what is wrong. The
// fingerprint is the same one /api/health/live reports, so the two can be
// compared to prove the deployed value is the file you just tested — which is
// the question "did my paste actually land?" that nothing could answer before.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const arg = process.argv[2];
const fp = (s) => createHash("sha256").update(s).digest("hex").slice(0, 12);

if (arg) {
  // Load the file into the env under the name the loader reads, then let the
  // real loader do the work.
  let raw;
  try { raw = readFileSync(arg, "utf8"); }
  catch (e) { console.error(`Could not read ${arg}: ${e.message}`); process.exit(2); }
  process.env.FIREBASE_PRIVATE_KEY = raw;
  // A downloaded service account carries these; clear them so the test measures
  // the FILE, not whatever is already in the shell.
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  try {
    const j = JSON.parse(raw);
    if (j.client_email) process.env.FIREBASE_CLIENT_EMAIL = j.client_email;
    if (j.project_id) process.env.FIREBASE_PROJECT_ID = j.project_id;
  } catch { /* the loader recovers corrupted JSON on its own */ }
}

const { adminDiagnostics, adminConfigured } = await import("../src/backend/firebase-admin.ts");
const d = adminDiagnostics;

console.log("\nFirebase Admin credential check");
console.log("───────────────────────────────");
console.log(`  source                : ${d.source}`);
console.log(`  project id            : ${d.hasProjectId ? "found" : "MISSING"}`);
console.log(`  client email          : ${d.hasClientEmail ? `found (@${d.clientEmailDomain})` : "MISSING"}`);
console.log(`  private key           : ${d.hasPrivateKey ? `found, ${d.privateKeyLength} chars` : "MISSING"}`);
console.log(`  key is a valid PEM    : ${d.privateKeyLooksValidPem ? "yes" : "NO"}`);
console.log(`  key fingerprint       : ${d.keyFingerprint ?? "—"}`);
console.log(`  SDK initialised       : ${adminConfigured ? "YES" : "NO"}`);

if (adminConfigured) {
  console.log("\n✓ These credentials WORK. The server will initialise with them.");
  console.log("  Set them on your host exactly as tested, redeploy, then open");
  console.log("  /api/health/live and check `firebaseAdmin.keyFingerprint` reads");
  console.log(`  ${d.keyFingerprint} — if it does not, the value you pasted is not the one`);
  console.log("  the build is using, and the fault is the host's scope or spelling,");
  console.log("  not the key.\n");
  process.exit(0);
}

console.log(`\n✗ These credentials do NOT work.\n  Reason: ${d.initError || "unknown"}\n`);

// Name the cause in the terms of what to do about it.
if (!d.hasPrivateKey) {
  console.log("  No private key was recovered at all. If you pasted the service-account");
  console.log("  JSON, one of its fields is unreadable — most often because the key's");
  console.log("  newlines were mangled by the box you pasted into. Pass the downloaded");
  console.log("  file to this script instead:  node scripts/check-firebase-key.mjs sa.json");
} else if (!d.privateKeyLooksValidPem) {
  console.log("  A key was found but it is not a well-formed PEM: it needs the BEGIN and");
  console.log("  END marker lines and real newlines between them. A key pasted as one");
  console.log("  long line with literal \\n is handled automatically — a key with the");
  console.log("  newlines deleted entirely cannot be recovered by anybody.");
} else {
  console.log("  The key parses but Google rejected it. That is a real credential");
  console.log("  problem rather than a formatting one: the service account may have");
  console.log("  been deleted or its key revoked in the Google Cloud console. Generate");
  console.log("  a new private key for it and test the downloaded file with this script.");
}
console.log(`\n  Raw lengths this process sees: ${JSON.stringify(d.rawLengths)}`);
console.log("  A zero there means the variable is not set in THIS shell — which is a");
console.log("  different fault from a bad value, and needs a different fix.\n");
process.exit(1);
