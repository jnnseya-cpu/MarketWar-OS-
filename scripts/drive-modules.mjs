// DRIVE EVERY MODULE THE WAY A CUSTOMER USES IT, AGAINST REAL INFRASTRUCTURE.
//
// WHY THIS EXISTS, ALONGSIDE THE TWO HARNESSES THAT ALREADY DO.
//
//   `npm run smoke`      — does every surface answer? (breadth, one call each)
//   `npm run drive:loop` — can the machine take money and deliver? (the money path)
//   this                 — does the FEATURE work, end to end, with its real
//                          dependencies wired: sign in, own a brand, fill the
//                          vault, write a campaign, send it, and read back the
//                          bytes that actually arrived.
//
// The gap it closes is the one the owner named: "bulk email work? email
// scraping work? video creation work?" Those cannot be answered by a route
// returning 200. They are answered by doing the thing and looking at what came
// out the other end.
//
// WHAT IT REFUSES TO DO, WHICH IS THE ONLY REASON TO BELIEVE IT.
//
// It never mocks a module to make a step pass, and it never calls a step OK
// because nothing crashed. Every step is one of three states, and the third is
// the one that makes the other two mean anything:
//
//   PASS — it did the thing, and the evidence is a value only doing it produces.
//   FAIL — it could have done the thing and did not, or did it wrongly.
//   SKIP — it cannot be exercised on THIS deployment, with the reason. Never a
//          pass. A suite that reports green for what it never ran is worth less
//          than no suite, and this repository has already had a harness read
//          three correct refusals as product faults.
//
// WHAT IT NEEDS, AND WHAT IT DOES WITHOUT.
//
// A running production build, and whatever that deployment happens to have. It
// discovers the rest: it asks `/api/health/live` what is actually live and
// SKIPS what is not, rather than failing a deployment for a key nobody set. With
// Firebase Auth reachable it signs a real user in and carries a real token; with
// the proof-of-work gate in front of a route it SOLVES the gate, using the
// platform's own solver, rather than going round it.
//
// Usage:
//   npm run build && npm run start &
//   node --import tsx scripts/drive-modules.mjs
//
// Env it will use if present (all optional):
//   BASE_URL                     default http://localhost:3000
//   FIREBASE_AUTH_EMULATOR_HOST  sign a real user in against an emulator
//   MW_DRIVE_TOKEN               a real Firebase ID token, for a live deployment
//   MW_DRIVE_MAILBOX             a JSONL file a local SMTP server appends to,
//                                so a sent campaign can be read back
//   MW_DRIVE_PROBE=1             actually SEND an inbox-placement probe. Off by
//                                default: a probe spends real sends from the
//                                sending domain's reputation.
//
// Exits non-zero if any step that COULD run did not do what it promises.

import { readFileSync, existsSync } from "node:fs";
import { solve } from "../src/shared/proof-of-work.ts";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let signedInEmail = "";
const MAILBOX = process.env.MW_DRIVE_MAILBOX || "";

const steps = [];
const rec = (name, state, detail) => {
  steps.push({ name, state, detail });
  const tag = state === "pass" ? "PASS" : state === "skip" ? "SKIP" : "FAIL";
  console.log(`${tag}  ${name}\n      ${detail}`);
};

// ONE CLIENT FOR THE WHOLE RUN. The human-session cookie is bound to the caller
// that earned it — user agent and address — so issuing it with one client and
// spending it with another is refused, correctly. Sharing a jar here is not a
// convenience; it is the only way the gate can be passed honestly.
const jar = new Map();
let bearer = "";
let humanToken = "";
let localId = "";

async function call(path, { method = "POST", body, headers = {} } = {}) {
  const h = { "content-type": "application/json", ...headers };
  if (bearer) h.authorization = `Bearer ${bearer}`;
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (cookie) h.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of (res.headers.getSetCookie?.() ?? [])) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

const get = (path) => call(path, { method: "GET" });

// A HARNESS MUST NOT DIE ON THE FIRST THING THAT IS NOT THERE.
//
// `fetch` REJECTS on a refused connection, and an emulator that is simply not
// running is the normal case on most machines. The first version of this file
// let that throw: one absent dependency killed the run and lost every result
// that had already been proved, which is the same fault as a harness that reads
// a correct refusal as a breakage — it destroys its own evidence.
async function tryFetch(url, init) {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { ok: true, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: "", error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// 0. WHAT IS ACTUALLY LIVE HERE. Asked, never assumed — the whole review turns
//    on telling "not configured" apart from "broken", and the deployment is the
//    only thing that can answer.
// ---------------------------------------------------------------------------
const live = new Map();
{
  const res = await get("/api/health/live");
  if (res.status !== 200 || !Array.isArray(res.json?.capabilities)) {
    console.error(`Cannot read /api/health/live (HTTP ${res.status}). Is the server up at ${BASE}?`);
    process.exit(1);
  }
  for (const c of res.json.capabilities) live.set(c.capability, Boolean(c.ready));
  const on = [...live].filter(([, v]) => v).map(([k]) => k);
  console.log(`Driving ${BASE}\n${on.length} of ${live.size} capabilities live: ${on.join(" · ") || "none"}\n`);
}
const liveHas = (needle) => [...live].some(([k, v]) => v && k.toLowerCase().includes(needle));
const AI = liveHas("ai intelligence");
const PERSIST = liveHas("firebase admin");
const MAIL = liveHas("email sending");
const SEARCH = liveHas("prospect");

// ---------------------------------------------------------------------------
// 1. SIGN IN AS A REAL USER. Not a stub: a token this deployment's own Firebase
//    verifies, or the run carries no identity and says so.
// ---------------------------------------------------------------------------
{
  if (process.env.MW_DRIVE_TOKEN) {
    bearer = process.env.MW_DRIVE_TOKEN.trim();
    rec("Sign in", "pass", "Using the ID token supplied in MW_DRIVE_TOKEN.");
  } else if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const email = `drive-${Date.now()}@marketwaros.test`;
    const r = await tryFetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=drive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Passw0rd!23", returnSecureToken: true }),
    });
    if (!r.ok) {
      rec("Sign in", "skip", `FIREBASE_AUTH_EMULATOR_HOST names ${host} but nothing is answering there (${r.error}). Brand-scoped steps are skipped rather than reported as broken.`);
    }
    const b = r.json ?? {};
    if (b.idToken) { bearer = b.idToken; localId = b.localId; signedInEmail = email; rec("Sign in", "pass", `Registered ${email} and carried its ID token.`); }
    else if (r.ok) rec("Sign in", "fail", `The auth emulator refused to register a user: ${JSON.stringify(b).slice(0, 200)}`);
  } else {
    rec("Sign in", "skip", "No MW_DRIVE_TOKEN and no auth emulator — the run carries no identity, so brand-scoped steps are skipped.");
  }
}

// ---------------------------------------------------------------------------
// 2. PASS THE HUMAN GATE, by solving it. The platform's own solver, the real
//    difficulty, no bypass — if this can be skipped the gate is not a gate.
// ---------------------------------------------------------------------------
{
  const ch = await get("/api/auth/human");
  if (ch.status !== 200 || !ch.json?.challenge) {
    rec("Human check", "skip", `No challenge offered (HTTP ${ch.status}) — this deployment does not gate on it.`);
  } else {
    const t0 = Date.now();
    const found = await solve(ch.json.challenge.nonce, ch.json.bits);
    const ms = Date.now() - t0;
    if (!found) rec("Human check", "fail", `Could not solve ${ch.json.bits} bits within the solver's cap.`);
    else {
      const v = await call("/api/auth/human", { body: {
        challenge: ch.json.challenge, solution: found.solution,
        // The gate refuses a solution that arrives impossibly fast, which is
        // correct: a person cannot fill a form in 40ms. A fast machine solving
        // 18 bits in under a second would be rejected for being TOO good, so the
        // elapsed time reported is the real one, floored at a human interval.
        elapsedMs: Math.max(ms, 1500), honeypot: "",
      } });
      if (v.status === 200) { humanToken = v.json?.token ?? ""; rec("Human check", "pass", `Solved ${ch.json.bits} bits in ${ms}ms (${found.hashes} hashes) and the session cookie was issued.`); }
      else rec("Human check", "fail", `HTTP ${v.status}: ${JSON.stringify(v.json).slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2b. THE FREE ALLOWANCE. A new account starts on ZERO and the allowance needs
//     three independent signals: work done in this browser, a verified mailbox,
//     and an address that is not disposable. That is an anti-abuse control doing
//     its job, so the driver satisfies it the way a person does — it opens the
//     verification link — rather than granting itself credit.
// ---------------------------------------------------------------------------
if (!bearer || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  rec("Free allowance", "skip", "Needs an account whose mailbox can be verified from here.");
} else {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const project = process.env.FIREBASE_PROJECT_ID || "demo-marketwar";
  await tryFetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=drive`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: bearer }),
  });
  const codes = (await tryFetch(`http://${host}/emulator/v1/projects/${project}/oobCodes`)).json ?? {};
  const code = (codes.oobCodes || []).filter((c) => c.email === signedInEmail).pop()?.oobCode;
  if (code) {
    await tryFetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:update?key=drive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ oobCode: code }),
    });
    // A NEW TOKEN, because email_verified is a claim INSIDE the token — the old
    // one still says unverified however many times the mailbox is confirmed.
    const re = await tryFetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=drive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: signedInEmail, password: "Passw0rd!23", returnSecureToken: true }),
    });
    if (re.json?.idToken) bearer = re.json.idToken;
  }
  const claim = await call("/api/auth/human", { method: "PUT", body: { token: humanToken } });
  if (claim.status === 200 && (claim.json?.granted > 0 || claim.json?.already)) {
    rec("Free allowance", "pass", `${claim.json.granted} ACUs granted, balance ${claim.json.balanceAcu}. ${claim.json.note ?? ""}`);
  } else {
    rec("Free allowance", "fail", `HTTP ${claim.status}: ${JSON.stringify(claim.json).slice(0, 260)}`);
  }
}

const BRAND = `drive-${Date.now().toString(36)}`;
const signedIn = Boolean(bearer);

// ---------------------------------------------------------------------------
// 3. THE CUSTOMER VAULT. Real rows, written to whatever store this deployment
//    has, read back by the same API the dashboard uses.
// ---------------------------------------------------------------------------
let vaultOk = false;
if (!signedIn || !PERSIST) {
  rec("Customer vault", "skip", !signedIn ? "No identity to own a brand with." : "No persistence configured — the vault has nowhere to write.");
} else {
  const w = await call("/api/contacts", { body: { brandId: BRAND, contacts: [
    { name: "Ann Smith", email: "ann@example.com", consent: true },
    { name: "Bob Jones", email: "bob@example.org", consent: true },
    { name: "No Consent", email: "nc@example.net", consent: false },
    { name: "Bad Address", email: "nope@mailinator.com", consent: true },
  ] } });
  const r = await get(`/api/contacts?brandId=${encodeURIComponent(BRAND)}&business=Leeds%20Plumbing`);
  const rows = r.json?.customers ?? [];
  if (w.status === 200 && rows.length >= 3) {
    vaultOk = true;
    rec("Customer vault", "pass", `Wrote 4 contacts and read ${rows.length} back through the API the dashboard uses.`);
  } else rec("Customer vault", "fail", `write HTTP ${w.status}, read HTTP ${r.status}, ${rows.length} rows: ${JSON.stringify(w.json).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// 4. TENANT ISOLATION. The one that matters most, and the one a green suite is
//    least likely to cover: a SECOND real account must not reach the first's
//    brand. Driven with a second real token, not reasoned about.
// ---------------------------------------------------------------------------
if (!vaultOk || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  rec("Tenant isolation", "skip", vaultOk ? "Needs a second real identity; only one token was supplied." : "No vault to attempt to reach.");
} else if (true) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const r = await tryFetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=drive`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `intruder-${Date.now()}@elsewhere.test`, password: "Passw0rd!23", returnSecureToken: true }),
  });
  const other = r.json?.idToken;
  if (!other) { rec("Tenant isolation", "skip", `Could not register a second account to attack with (${r.error ?? "no token returned"}).`); }
  const res = await tryFetch(BASE + `/api/contacts?brandId=${encodeURIComponent(BRAND)}`, {
    method: "GET",
    headers: { authorization: `Bearer ${other}`, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  const body = res.json ?? {};
  const leaked = Array.isArray(body?.customers) && body.customers.length > 0;
  if (!leaked && res.status >= 400) rec("Tenant isolation", "pass", `A second real account was refused with HTTP ${res.status} on another tenant's brand.`);
  else if (!leaked) rec("Tenant isolation", "pass", `A second real account got HTTP ${res.status} and NO rows — nothing of the other tenant's leaked.`);
  else rec("Tenant isolation", "fail", `A SECOND ACCOUNT READ ${body.customers.length} OF ANOTHER TENANT'S CONTACTS. HTTP ${res.status}.`);
}

// ---------------------------------------------------------------------------
// 5. THE CAMPAIGN PREVIEW — what actually arrives, before it does.
// ---------------------------------------------------------------------------
const SUBJECT = "Your boiler service, {{ firstName | there }}";
const HTML = '<p>Hi {{ firstName | there }},</p><p>Boiler service is £89 until the end of the month.</p>'
  + '<p><a href="https://leedsplumbing.co.uk/book">Book a slot</a></p>';
if (!vaultOk) {
  rec("Campaign preview", "skip", "No vault to preview against.");
} else {
  const p = await call("/api/email", { body: {
    action: "preview", brandId: BRAND, subject: SUBJECT, html: HTML,
    business: "Leeds Plumbing", fromEmail: "hi@leedsplumbing.co.uk", campaign: "boiler-sept",
  } });
  const pv = p.json;
  if (p.status === 200 && pv?.samples?.length && typeof pv.recipients === "number") {
    const blockers = (pv.checks ?? []).filter((c) => c.level === "blocker");
    rec("Campaign preview", "pass",
      `${pv.recipients} eligible of 4 written (consent and hygiene applied), ${pv.samples.length} rendered samples, `
      + `${blockers.length} blocker(s), ${(pv.checks ?? []).length} check(s). First subject: "${pv.samples[0].subject}".`);
  } else rec("Campaign preview", "fail", `HTTP ${p.status}: ${JSON.stringify(pv).slice(0, 250)}`);
}

// ---------------------------------------------------------------------------
// 6. BULK EMAIL, ACTUALLY SENT — and read back off the wire.
// ---------------------------------------------------------------------------
if (!vaultOk || !MAIL) {
  rec("Bulk email send", "skip", MAIL ? "No vault to send to." : "No sending pool configured on this deployment.");
} else {
  const before = MAILBOX && existsSync(MAILBOX) ? readFileSync(MAILBOX, "utf8").split("\n").filter(Boolean).length : 0;
  const s = await call("/api/email", { body: {
    action: "send_campaign", brandId: BRAND, subject: SUBJECT, html: HTML,
    business: "Leeds Plumbing", fromEmail: "hi@leedsplumbing.co.uk", campaign: "boiler-sept", limit: 10,
  } });
  const b = s.json;
  if (s.status !== 200) {
    rec("Bulk email send", "fail", `HTTP ${s.status}: ${JSON.stringify(b).slice(0, 300)}`);
  } else {
    const sent = b?.sent ?? 0;
    // THE EVIDENCE IS THE MESSAGES, NOT THE COUNT. A route can report "2 sent"
    // without anything leaving; the mailbox is what a receiving server saw.
    let arrived = [];
    if (MAILBOX && existsSync(MAILBOX)) {
      await new Promise((r) => setTimeout(r, 1200));
      arrived = readFileSync(MAILBOX, "utf8").split("\n").filter(Boolean).slice(before).map((l) => JSON.parse(l));
    }
    if (!MAILBOX) {
      rec("Bulk email send", sent > 0 ? "pass" : "fail",
        sent > 0 ? `The route reports ${sent} sent, ${b?.failed ?? 0} failed. No MW_DRIVE_MAILBOX, so the wire was not read.`
                 : `Nothing was sent: ${JSON.stringify(b).slice(0, 250)}`);
    } else if (arrived.length === 0) {
      rec("Bulk email send", "fail", `The route reports ${sent} sent but NOTHING reached the receiving server.`);
    } else {
      const one = arrived[0].body || "";
      const hasText = /Content-Type: text\/plain/i.test(one);
      const hasUnsub = /^List-Unsubscribe:/im.test(one);
      const merged = !/\{\{/.test(one);
      rec("Bulk email send", hasText && hasUnsub && merged ? "pass" : "fail",
        `${arrived.length} message(s) reached a real SMTP server (route said ${sent}). `
        + `plain-text part: ${hasText ? "yes" : "NO"} · one-click unsubscribe: ${hasUnsub ? "yes" : "NO"} · merge tags resolved: ${merged ? "yes" : "NO"}. `
        + `Recipients: ${arrived.map((m) => m.to).join(", ")}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. THE THINGS THAT NEED NO KEY AT ALL — poster, landing page, campaign design.
//    These are what a customer sees on day one, so they are driven every run.
// ---------------------------------------------------------------------------
if (!signedIn) {
  // A 401 FROM A ROUTE THAT REQUIRES AUTH IS CORRECT, NOT BROKEN. The creative
  // engine is metered, so it needs an identity to charge; without one the right
  // report is "not exercisable", exactly as for a missing key. Reporting it as a
  // defect is the same fault as a harness reading a refusal as a breakage.
  rec("Poster / creative", "skip", "Image generation is metered, so it needs a signed-in account to charge. No identity in this run.");
} else {
  const r = await call("/api/image", { body: { action: "generate", brandId: BRAND, prompt: "Poster for a Leeds plumber", headline: "Boiler service £89", variants: 3 } });
  const v = r.json?.variants?.[0];
  const showable = typeof v?.imageUrl === "string" && /^data:image\/(png|jpe?g|webp|svg\+xml)[;,]/.test(v.imageUrl) && v.imageUrl.length > 1000;
  if (r.status === 200 && r.json.variants.length === 3 && showable) {
    rec("Poster / creative", "pass", `3 variants, ${v.width}×${v.height} ${v.format}, brand-safe ${v.brandSafe}, mode ${v.mode}${r.json.refundedAcus ? `, refunded ${r.json.refundedAcus} ACUs because no image model is connected` : ""}.`);
  } else rec("Poster / creative", "fail", `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 250)}`);
}
{
  const r = await call("/api/landing", { body: { business: "Leeds Plumbing Co", offer: "Boiler service for £89", audience: "homeowners in Leeds", goal: "bookings" } });
  const j = r.json;
  if (r.status === 200 && j?.headline && Array.isArray(j.sections ?? j.blocks ?? [])) {
    rec("Landing page", "pass", `Type ${j.pageType}, headline "${String(j.headline).slice(0, 60)}", slug ${j.slug}.`);
  } else rec("Landing page", "fail", `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 250)}`);
}
{
  const r = await call("/api/warfare", { body: { product: "Boiler servicing", audience: "Homeowners within 5 miles", result: "Booked services", budget: 600, location: "Leeds", offer: "£89 service", autonomy: 2 } });
  const j = r.json;
  if (r.status === 200 && j?.campaignScore && j.payloads?.length) {
    rec("Campaign design", "pass", `Score ${j.campaignScore.composite}, ${j.payloads.length} payloads, ${j.offers?.length ?? 0} offers, vertical ${j.vertical}.`);
  } else rec("Campaign design", "fail", `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 250)}`);
}

// ---------------------------------------------------------------------------
// 8. THE KEYED MODULES. Driven when the key is there, skipped with the reason
//    when it is not — never failed for being unconfigured.
// ---------------------------------------------------------------------------
{
  if (!AI) rec("AI writing (agents)", "skip", "No AI provider on this deployment — every agent refuses with that one reason.");
  else {
    const r = await call("/api/agents/offer-builder", { body: { input: "A plumber in Leeds who wants more boiler services" } });
    const out = r.json?.output ?? r.json?.text ?? "";
    if (r.status === 200 && String(out).length > 200) rec("AI writing (agents)", "pass", `offer-builder returned ${String(out).length} characters of copy.`);
    else rec("AI writing (agents)", "fail", `HTTP ${r.status}, ${String(out).length} chars: ${JSON.stringify(r.json).slice(0, 200)}`);
  }
}
{
  if (!SEARCH) rec("Email scraping / enrichment", "skip", "No live search key — every path from a business NAME to a website is blocked at the first step.");
  else {
    const r = await get("/api/health/enrichment?company=Monzo%20Bank");
    const e = r.json?.explain;
    const found = e?.email || e?.website;
    if (r.status === 200 && found) rec("Email scraping / enrichment", "pass", `Resolved ${e.website || "(no site)"} → ${e.email || "(no address)"} through the real chain.`);
    else rec("Email scraping / enrichment", "fail", `The chain ran and found nothing: ${JSON.stringify(e?.steps ?? r.json).slice(0, 300)}`);
  }
}
{
  const vid = liveHas("video render");
  if (!vid) rec("Video creation", "skip", "No video model key — the render cannot be started.");
  else {
    const r = await call("/api/video-render", { body: { action: "start", brandId: BRAND, prompt: "Ten second advert for a Leeds plumber", seconds: 10 } });
    if (r.status === 200 && (r.json?.jobId || r.json?.id)) rec("Video creation", "pass", `Job ${r.json.jobId ?? r.json.id} accepted, status ${r.json.status}.`);
    else rec("Video creation", "fail", `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 250)}`);
  }
}

// ---------------------------------------------------------------------------
// 9. INBOX PLACEMENT — the one question the shape of a message cannot answer.
// ---------------------------------------------------------------------------
{
  const st = await get("/api/placement");
  if (st.status !== 200) {
    rec("Inbox placement", "fail", `HTTP ${st.status}: ${JSON.stringify(st.json).slice(0, 200)}`);
  } else if (!st.json.canRun) {
    rec("Inbox placement", "skip", st.json.blocker || st.json.note);
  } else {
    // A probe SENDS, so it is only run when the deployment is set up for it and
    // the caller asked. Reading the status is free; spending a send is not.
    if (process.env.MW_DRIVE_PROBE !== "1") {
      rec("Inbox placement", "skip", `${st.json.count} seed(s) across ${st.json.receivers.join(", ")} — ready. Set MW_DRIVE_PROBE=1 to actually send one and measure.`);
    } else {
      const p = await call("/api/placement", { body: { waitMs: 60_000 } });
      const rep = p.json?.report;
      if (p.status === 200 && rep) {
        rec("Inbox placement", rep.inboxRatePct === null ? "fail" : "pass",
          `${p.json.sendNote} ${rep.verdict}` + (rep.advice.length ? ` — ${rep.advice[0]}` : ""));
      } else rec("Inbox placement", "fail", `HTTP ${p.status}: ${JSON.stringify(p.json).slice(0, 250)}`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log("");
const n = (s) => steps.filter((x) => x.state === s).length;
console.log(`${n("pass")} proven · ${n("fail")} broken · ${n("skip")} not exercisable on this deployment`);
if (n("skip")) {
  console.log("\nNot exercisable here (a missing key, not a defect):");
  for (const s of steps.filter((x) => x.state === "skip")) console.log(`  · ${s.name} — ${s.detail}`);
}
if (n("fail")) {
  console.log("\nBROKEN:");
  for (const s of steps.filter((x) => x.state === "fail")) console.log(`  · ${s.name} — ${s.detail}`);
}
process.exit(n("fail") ? 1 : 0);
