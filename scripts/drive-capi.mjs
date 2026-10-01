// npm run drive:capi
//
// DRIVE THE CONVERSIONS API END TO END: a signed Stripe webhook → the wallet →
// Meta. The real route handler, the real signature check, the real Firestore, the
// real consent gate, the real hashing and a real HTTP POST.
//
// WHAT IS STOOD IN FOR, STATED PLAINLY. graph.facebook.com is unreachable from
// this container (and from most CI), so a local server plays Meta and `fetch` is
// intercepted ONLY to rewrite the host — what arrives at the stand-in is
// byte-for-byte what Meta would receive. Meta's own servers are NOT exercised
// here; `META_CAPI_TEST_CODE` plus Events Manager → Test Events is what proves
// the real endpoint, and nothing in this script may be read as having done that.
//
// WHAT IT NEEDS: the Firebase emulators (Firestore + Auth), because the wallet
// stamp, the consent record and the account email all come out of a real store.
// Without them it says so and exits non-zero rather than passing on memory.
//
//   firebase emulators:start --only firestore,auth --project demo-marketwar
//   FIREBASE_PROJECT_ID=demo-marketwar FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run drive:capi
//
// THE FOUR THINGS IT PROVES, and each one is a way this could be wrong:
//   1. a payment from an account that never chose is CREDITED and NOT reported
//   2. a consented payment reports, with the money, the hashed address, the
//      advert click — and an event_id identical to the one the browser would send
//   3. a Stripe redelivery reports nothing a second time
//   4. an event that moved no money reports no sale

// END TO END: A SIGNED STRIPE WEBHOOK → THE WALLET → META.
//
// The real route handler, the real signature check, the real Firestore, the real
// consent gate, the real hashing and a real HTTP POST — with Meta's own servers
// stood in for, because this container cannot reach them.
import http from "node:http";
import fs from "node:fs";
const say = (m) => fs.writeSync(1, m + "\n");
import crypto from "node:crypto";

const SECRET = "whsec_drive_e2e_not_a_real_secret";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.META_CAPI_ACCESS_TOKEN = "stand-in-token-not-a-real-credential";
process.env.NEXT_PUBLIC_META_PIXEL_ID = "1080646761094543";

let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const received = [];
const server = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    received.push(JSON.parse(raw || "{}"));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ events_received: 1, fbtrace_id: "e2e" }));
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  return url.startsWith("https://graph.facebook.com/")
    ? realFetch(url.replace("https://graph.facebook.com", `http://127.0.0.1:${PORT}`), init)
    : realFetch(input, init);
};

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);
const { NextRequest } = await import("next/server");
const route = await import(R("src/app/api/webhooks/stripe/route.ts"));
const consentMod = await import(R("src/backend/analytics-consent.ts"));
const { getWallet } = await import(R("src/backend/wallet.ts"));
const { conversionEventId } = await import(R("src/shared/capi.ts"));
const { conversionsFor } = await import(R("src/shared/conversion-report.ts"));

const org = `e2e-${Date.now()}`;
const EMAIL = `${org}@example.com`;
const FBP = "fb.1.1790000000000.1234567890";
const FBC = "fb.1.1790000000000.AbCdEf_click-123";

// A REAL Firebase Auth user, because the webhook resolves the identifier from
// Auth and not from the Stripe event. Without one the conversion is correctly
// refused for having nothing to match on, which is a true answer to the wrong
// question.
const fa = await import(R("src/backend/firebase-admin.ts"));
await fa.adminAuth.createUser({ uid: org, email: EMAIL }).catch((e) => say(`  (auth user: ${e.code || e.message})`));

async function deliver(event) {
  const raw = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${crypto.createHmac("sha256", SECRET).update(`${t}.${raw}`, "utf8").digest("hex")}`;
  const req = new NextRequest("https://marketwaros.com/api/webhooks/stripe", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": sig },
    body: raw,
  });
  const res = await Promise.race([
    route.POST(req),
    new Promise((_, rej) => setTimeout(() => rej(new Error("route.POST did not return within 30s")), 30_000)),
  ]);
  return { status: res.status, body: await res.json() };
}

const invoice = (id) => ({
  id, type: "invoice.paid",
  data: { object: {
    id: `in_${id}`,
    metadata: { planId: "growth", orgId: org, marketwar_fbp: FBP, marketwar_fbc: FBC },
    amount_paid: 4900, currency: "gbp", client_reference_id: org,
  } },
});

if (!fa.adminConfigured) {
  say("\nREFUSED: Firebase Admin is not configured, so the wallet stamp and the consent record would both live in process memory.");
  say("That would pass without proving anything durable. Start the emulators and set FIREBASE_* — see the header.");
  process.exit(1);
}
say(`\norg ${org}, stand-in Meta on 127.0.0.1:${PORT}\n`);

// 1. NO CONSENT ON FILE. The payment must still be credited.
say("1. a real payment from an account that never chose");
{
  const before = received.length;
  const r = await deliver(invoice(`evt_nc_${org}`));
  const wallet = await getWallet(org);
  check("the webhook answered 200 and the wallet was credited",
    r.status === 200 && r.body.walletApplied?.applied === true, `${r.status} — ${r.body.walletApplied?.reason}`);
  check("and NOTHING was sent to Meta", received.length === before, r.body.conversion?.why);
  check("the reason names consent, not a fault", /consent|cookie choice/i.test(r.body.conversion?.why || ""), r.body.conversion?.why);
}

// 2. CONSENT GRANTED. The next payment reports.
say("\n2. the customer accepts cookies, then renews");
await consentMod.recordAnalyticsConsent({ uid: org, choice: "granted" });
{
  const eventId = `evt_ok_${org}`;
  const r = await deliver(invoice(eventId));
  const sent = received[received.length - 1];
  const ev = sent?.data?.[0];
  check("the webhook still answers 200", r.status === 200, String(r.status));
  check("the conversion was sent", r.body.conversion?.sent === true, r.body.conversion?.why || r.body.conversion?.eventId);
  check("Meta received a Subscribe with the real £49",
    ev?.event_name === "Subscribe" && ev?.custom_data?.value === 49, JSON.stringify(ev?.custom_data));

  // THE WHOLE POINT: the id the SERVER sent is the id the BROWSER would send.
  const wallet = await getWallet(org);
  const browser = conversionsFor(wallet.lastCredit, new Set());
  check("the server's event_id is identical to the browser's, so the pair counts ONCE",
    ev?.event_id === browser?.events?.[0]?.eventId && ev?.event_id === conversionEventId(eventId, "subscribe"),
    `server=${ev?.event_id} browser=${browser?.events?.[0]?.eventId}`);
  check("no plaintext address anywhere in what Meta received",
    !JSON.stringify(sent).includes(EMAIL), "searched the serialised request");
  const digest = crypto.createHash("sha256").update(EMAIL, "utf8").digest("hex");
  check("the account email arrived HASHED", ev?.user_data?.em?.[0] === digest, ev?.user_data?.em?.[0]?.slice(0, 16) + "…");
  check("THE ADVERT CLICK survived the gap between the browser and the webhook",
    ev?.user_data?.fbc === FBC && ev?.user_data?.fbp === FBP, `fbc=${ev?.user_data?.fbc}`);
}

// 3. A REDELIVERY of the same event must not report again.
say("\n3. Stripe redelivers the same event");
{
  const eventId = `evt_dup_${org}`;
  await deliver(invoice(eventId));
  const afterFirst = received.length;
  const again = await deliver(invoice(eventId));
  check("the credit was an idempotent skip", again.body.walletApplied?.applied === false, again.body.walletApplied?.reason);
  check("and no second conversion was sent", received.length === afterFirst, again.body.conversion?.why);
}

// 4. AN EVENT THAT MOVES NO MONEY must not report a sale.
say("\n4. a failed payment (grace period)");
{
  const before = received.length;
  const r = await deliver({
    id: `evt_fail_${org}`, type: "invoice.payment_failed",
    data: { object: { id: "in_f", metadata: { planId: "growth", orgId: org }, amount_paid: 0, currency: "gbp", client_reference_id: org } },
  });
  check("no conversion for an event that credited nothing",
    received.length === before && r.body.conversion?.sent !== true, r.body.conversion?.why || "no conversion block");
}

server.close();
say(`\n${proven} proven / ${broken} broken`);
process.exit(broken ? 1 : 0);
