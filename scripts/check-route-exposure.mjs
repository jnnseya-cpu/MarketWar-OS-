// npm run check:exposure
//
// WHAT CAN A STRANGER WITH NO ACCOUNT MAKE THIS PLATFORM DO?
//
// WHY THIS IS A GATE. `requireAuth` returning `ok` does not mean a scope was
// checked, and §137 found `/api/email` answering an anonymous POST with a send
// result under its own comment saying it must never be unauthenticated. The
// lesson recorded then was "inspect the thing that RUNS, from where it is
// called" — but nothing afterwards could answer the question for all 192 routes
// at once, so every audit re-derived it by hand and no audit did it twice.
//
// THE INVARIANT, and it is the whole point of the file: a route reachable with
// no credential, no rate limit, no cron secret and no webhook signature must
// not WRITE to the database, SEND anything, or SPEND money. Those three are the
// irreversible actions. A deterministic engine that computes an answer and
// returns it is a different thing entirely, and this does not pretend otherwise.
//
// TWO CLASSES OF RESULT, DELIBERATELY:
//
//   FAIL — an open route that writes, sends or spends. There is no defensible
//          reading of that, so the gate refuses.
//   FLOOR — open routes that only compute. Reported against a recorded ceiling
//          that can only come DOWN, exactly as `check:casts` holds the cast
//          count. The residual risk is unmetered compute, not data or money, and
//          a gate that failed the build over it would be switched off by Friday.
//
// WHAT IT CANNOT SEE, stated so a pass is not read as more than it is: this
// reads the route file and ONE HOP of its `@/backend` imports. A write buried
// two modules deep, or reached through a runtime-built module path, is invisible
// here. It is a floor under the audit, never a substitute for one.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

// THE CEILING. Lower it when routes gain a rate limit; never raise it to make a
// run pass. Raising it is the one change this file exists to make awkward.
const OPEN_COMPUTE_CEILING = 57;

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

const files = execFileSync("find", ["src/app/api", "-name", "route.ts"], { cwd: ROOT, encoding: "utf8" })
  .trim().split("\n").filter(Boolean);

// A credential, a throttle, a scheduler secret or a signed webhook body. Any one
// of them means the caller is not an anonymous stranger with unlimited attempts.
const GUARDED = /requireAuth|requireAuthEnforced|resolveBrandAccess|cronAuthorised|requireUser|verifyIdToken|openToken|assertAdmin|rateLimit\(|CRON_SECRET|stripe-signature|verifySignature|constructEvent|x-hub-signature|svix/i;

// The three irreversible actions, in the route itself…
const WRITES = /adminDb|saveContacts|patchContact|upsertContact|setDoc|addDoc|writeBatch|\.commit\(\)/;
const SENDS = /sendEmail|sendCampaign|sendMail|smtpSend|sendWhatsApp|deliverCampaign/;
const SPENDS = /meterAction|debitAcus|spendAcus|gatewayComplete|gatewayJson/;

const violations = [];
const openCompute = [];

for (const f of files) {
  const src = read(`${ROOT}/${f}`);
  const name = "/api/" + f.replace("src/app/api/", "").replace("/route.ts", "");
  if (GUARDED.test(src)) continue;

  const found = [];
  if (WRITES.test(src)) found.push("writes to the database");
  if (SENDS.test(src)) found.push("sends");
  if (SPENDS.test(src)) found.push("spends");

  // ONE HOP, PER SYMBOL — because the first version of this hop cried wolf.
  //
  // It flagged a module that CONTAINS a gateway call plus a loose name match in
  // the route, and reported `/api/gateway` and `/api/health/ai` as able to spend
  // money. Both import exactly one thing from that module — `gatewayStatus`, a
  // pure reader of which providers are configured — and neither can reach a
  // provider. A gate that fails for a reason unrelated to what it tests is the
  // second defect class in this repository, and the recorded consequence is
  // specific: `ads:verify` cried wolf and a real guard nearly got deleted.
  //
  // So the hop resolves the SYMBOLS the route actually imports, finds each one's
  // exported body in the module, and asks whether THAT function spends. A module
  // full of gateway calls is irrelevant if the route only imported the status
  // reader.
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"@\/backend\/([a-z0-9-]+)"/g)) {
    const symbols = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const modSrc = read(`${ROOT}/src/backend/${m[2]}.ts`);
    if (!modSrc || !/gatewayComplete\(|gatewayJson\(/.test(modSrc)) continue;
    for (const sym of symbols) {
      // The exported declaration, up to the next top-level `export` or the end.
      const decl = new RegExp(`^export\\s+(?:async\\s+)?(?:function|const)\\s+${sym}\\b`, "m");
      const at = modSrc.search(decl);
      if (at < 0) continue;
      const rest = modSrc.slice(at + 1);
      const next = rest.search(/^export\s/m);
      const body = next < 0 ? rest : rest.slice(0, next);
      if (/gatewayComplete\(|gatewayJson\(/.test(body)) {
        found.push(`spends via @/backend/${m[2]}.${sym}()`);
      }
    }
  }

  if (found.length) violations.push({ name, found });
  else openCompute.push(name);
}

const say = (m) => process.stdout.write(m + "\n");

if (violations.length) {
  say(`check:exposure FAILED — ${violations.length} route(s) reachable with NO credential and NO throttle that take an irreversible action.\n`);
  for (const v of violations) say(`  ${v.name}\n      ${v.found.join("; ")}`);
  say("");
  say("A stranger can do this with no account. Add a credential check, a rate limit,");
  say("a scheduler secret or a signature check — never by widening this gate.");
  process.exit(1);
}

say(`check:exposure passed — of ${files.length} API routes, ${files.length - openCompute.length} are guarded by a credential, throttle, scheduler secret or signature.`);
say(`  NONE of the ${openCompute.length} open routes writes, sends or spends: they compute an answer and return it.`);

if (openCompute.length > OPEN_COMPUTE_CEILING) {
  say("");
  say(`check:exposure FAILED — ${openCompute.length} open compute routes against a ceiling of ${OPEN_COMPUTE_CEILING}.`);
  say("This number only comes down. A new public endpoint needs a rate limit, or the");
  say("ceiling needs lowering somewhere else to pay for it.");
  for (const n of openCompute.slice(0, 10)) say(`    ${n}`);
  process.exit(1);
}

if (openCompute.length < OPEN_COMPUTE_CEILING) {
  say(`  ${openCompute.length} is below the recorded ceiling of ${OPEN_COMPUTE_CEILING} — lower OPEN_COMPUTE_CEILING to ${openCompute.length} to hold the gain.`);
}
say("  Residual risk is unmetered COMPUTE on those routes, not data, money or mail.");
process.exit(0);
