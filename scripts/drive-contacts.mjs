// npm run drive:contacts
//
// A SIMPLE LIST IN, EMAILS AND MOBILES OUT — the path the owner asked for, driven
// end to end over a real socket.
//
// WHAT IS STOOD IN FOR, STATED PLAINLY. api.leadmagic.io is unreachable from this
// container (the environment's network policy blocks it), so a local server plays
// the supplier and `fetch` is intercepted ONLY to rewrite the host — what arrives
// at the stand-in is byte-for-byte what LeadMagic would receive. The supplier's
// own servers, its hit rate and its data quality are NOT exercised here and
// nothing in the output may be read as having tested them. What IS real: the
// provider registry, the cost-ordered waterfall, the per-capability budget gate,
// the charge-only-on-a-result rule, the E.164 normalisation and the WhatsApp
// verdict.
//
// THE CLAIM THIS SCRIPT EXISTS TO KEEP HONEST. No API can tell anybody whether a
// phone number is registered on WhatsApp — the On-Premises `/contacts` endpoint
// stopped being accurate at client 2.45.1 and the whole API was sunset on 23
// October 2025; the Cloud API has no equivalent. So step 2 asserts the verdict
// never claims it, and step 5 asserts the summary says the mobiles are people you
// may INVITE to message you rather than people you may message.
//
// Needs no keys and no emulator: it sets its own stand-in key.

// A SIMPLE LIST IN, EMAILS AND MOBILES OUT — driven over a real socket.
//
// api.leadmagic.io is unreachable from this container (the network policy blocks
// it), so a local server stands in for the supplier. Everything on our side is
// real: the registry, the cost-ordered waterfall, the budget gate, the E.164
// normalisation, the WhatsApp verdict and a real HTTP round trip. `fetch` is
// intercepted only to rewrite the HOST, so the request that arrives is the one
// LeadMagic would receive.
import http from "node:http";
import fs from "node:fs";
const say = (m) => fs.writeSync(1, m + "\n");

let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const seen = [];
const server = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    seen.push({ path: req.url, key: req.headers["x-api-key"], body });
    const reply = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.includes("email-finder")) {
      if (body.last_name === "Nobody") return reply({ status: "not_found" });
      return reply({ status: "valid", email: `${body.first_name}.${body.last_name}@${body.domain}`.toLowerCase() });
    }
    if (req.url.includes("mobile-finder")) {
      if (body.last_name === "Nomobile") return reply({ status: "not_found" });
      return reply({ status: "valid", mobile_number: "+44 7700 900123" });
    }
    res.writeHead(404); res.end("{}");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (url.startsWith("https://api.leadmagic.io/")) {
    return realFetch(url.replace("https://api.leadmagic.io", `http://127.0.0.1:${PORT}`), init);
  }
  // Every other host is unreachable here, which is the honest state: the free
  // crawl and Companies House simply return nothing, and the chain carries on.
  return realFetch(input, init);
};

process.env.LEADMAGIC_API_KEY = "stand-in-key-not-a-real-credential";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);
const { registerBuiltInProviders, __resetRegistration, leadmagic, LEADMAGIC_COST_ACU, LEADMAGIC_PHONE_COST_ACU } = await import(R("src/backend/enrichment-adapters.ts"));
const { findPerson, providers, __clearProviders } = await import(R("src/backend/enrichment-provider.ts"));
const { whatsappReach, reachSummary, toE164 } = await import(R("src/shared/whatsapp-reach.ts"));

__clearProviders(); __resetRegistration(); registerBuiltInProviders();
say(`\nchain: ${providers().map((p) => `${p.id}(${p.order})`).join(" → ")}`);
say(`email ${LEADMAGIC_COST_ACU} ACU, mobile ${LEADMAGIC_PHONE_COST_ACU} ACU, stand-in supplier on 127.0.0.1:${PORT}\n`);
check("configured once the key is present", leadmagic.health().configured === true);

// A SIMPLE LIST. Names and the company they work at — which is what a prospecting
// import actually looks like.
const LIST = [
  { fullName: "Ann Lee", company: "Acme Bathrooms", domain: "acme-bathrooms.co.uk", country: "GB" },
  { fullName: "Bob Nomobile", company: "Acme Bathrooms", domain: "acme-bathrooms.co.uk", country: "GB" },
  { fullName: "Cy Nobody", company: "Acme Bathrooms", domain: "acme-bathrooms.co.uk", country: "GB" },
];

say("1. emails only — the default, no phone bought");
{
  const before = seen.length;
  const r = await findPerson({ person: LIST[0], maxCostAcu: 10, deadlineMs: 8_000 });
  const mobileCalls = seen.slice(before).filter((s) => s.path.includes("mobile")).length;
  check("the email was found", r.emails.some((e) => e.value === "ann.lee@acme-bathrooms.co.uk"),
    r.emails.map((e) => `${e.value} (${e.provenance})`).join(", ") || "none");
  check("it is marked bought, not confirmed", r.emails[0]?.provenance === "provider", r.emails[0]?.provenance);
  check("NO mobile was bought without being asked for", mobileCalls === 0 && r.phones.length === 0,
    `${mobileCalls} mobile call(s)`);
  const emailStep = r.steps.find((s) => s.provider === "leadmagic" && s.capability === "emails");
  check("charged the email rate", emailStep?.costAcu === LEADMAGIC_COST_ACU, `${emailStep?.costAcu} ACU`);
}

say("\n2. wantPhone — the WhatsApp half");
{
  const r = await findPerson({ person: LIST[0], maxCostAcu: 20, deadlineMs: 8_000, wantPhone: true });
  const phoneStep = r.steps.find((s) => s.capability === "phones");
  check("a mobile came back, normalised to E.164", r.phones[0]?.e164 === "447700900123", r.phones[0]?.e164);
  check("charged the PHONE rate, not the email rate",
    phoneStep?.costAcu === LEADMAGIC_PHONE_COST_ACU && LEADMAGIC_PHONE_COST_ACU !== LEADMAGIC_COST_ACU,
    `${phoneStep?.costAcu} ACU (email is ${LEADMAGIC_COST_ACU})`);
  check("the supplier's claim is recorded as a claim", r.phones[0]?.provenance === "provider", r.phones[0]?.provenance);
  const v = whatsappReach({ phone: { e164: r.phones[0].e164, display: "", lineType: r.phones[0].lineType, provenance: r.phones[0].provenance } });
  check("the verdict gives a one-click link to ONE number", v.waLink === "https://wa.me/447700900123", v.waLink);
  check("and it insists on opt-in", v.needsOptIn === true && /permission/i.test(v.why));
  // READ THE NEGATION, NOT THE SUBSTRING. The honest sentence is "Whether this
  // person is ON WhatsApp cannot be checked", which contains the words of the
  // claim inside a denial of it. The first version of this check matched the
  // substring and called the correct text a violation.
  const claimsRegistration = Object.keys(v).some((k) => /whatsapp|registered/i.test(k) && v[k] === true)
    || /\bis on WhatsApp\b(?!\s+cannot)/i.test(v.why);
  check("and it never claims they are on WhatsApp",
    !claimsRegistration && /cannot be checked/i.test(v.why), v.why.slice(0, 90) + "…");
  check("the progress line warns before anybody clicks send",
    r.progress.some((l) => /needs their permission/i.test(l)),
    r.progress.filter((l) => /mobile/i.test(l)).join(" | "));
}

say("\n3. a miss is free");
{
  // THE EMAIL AND THE MOBILE ARE INDEPENDENT LOOKUPS, which is correct — a
  // person whose address is not on file may still have a mobile. So the row that
  // tests "a miss is free" has to miss the thing being measured. My first run
  // asserted both were free for a row that only missed the email, and the 3 ACUs
  // it saw were a mobile the supplier really did return.
  const noEmail = await findPerson({ person: LIST[2], maxCostAcu: 20, deadlineMs: 8_000 });
  check("an email miss is not charged",
    noEmail.emails.length === 0 && noEmail.steps.filter((s) => s.provider === "leadmagic").every((s) => s.costAcu === 0),
    noEmail.steps.filter((s) => s.provider === "leadmagic").map((s) => `${s.capability}:${s.costAcu}`).join(" "));

  const noMobile = await findPerson({ person: LIST[1], maxCostAcu: 20, deadlineMs: 8_000, wantPhone: true });
  const phoneStep = noMobile.steps.find((s) => s.capability === "phones");
  check("a mobile miss is not charged either",
    noMobile.phones.length === 0 && phoneStep?.ran === true && phoneStep?.costAcu === 0,
    `ran=${phoneStep?.ran} cost=${phoneStep?.costAcu} — ${phoneStep?.outcome}`);
}

say("\n4. the budget gate prices the capability");
{
  // Enough for an email, NOT enough for a mobile. The phone must be refused by
  // name rather than silently charged at the email rate.
  const r = await findPerson({ person: LIST[0], maxCostAcu: LEADMAGIC_COST_ACU, deadlineMs: 8_000, wantPhone: true });
  const refusal = r.steps.find((s) => s.capability === "phones" && !s.ran);
  check("the phone was refused for budget, and said so", Boolean(refusal), refusal?.outcome?.slice(0, 110));
  check("and no mobile was bought", r.phones.length === 0);
}

say("\n5. the whole list, summarised");
{
  const verdicts = [];
  for (const person of LIST) {
    const r = await findPerson({ person, maxCostAcu: 20, deadlineMs: 8_000, wantPhone: true });
    const p = r.phones[0];
    verdicts.push(whatsappReach({ phone: p ? { e164: p.e164, display: "", lineType: p.lineType, provenance: p.provenance } : null }));
  }
  const s = reachSummary(verdicts);
  check("counted, not estimated", s.total === 3 && s.mobiles === 2, `${s.mobiles} mobiles of ${s.total}`);
  check("and it says none of them is an opt-in", /not people you may message/.test(s.line), s.line.slice(-95));
}

say("\n6. the request that reached the supplier");
{
  // THE CALL FOR ANN, not whichever was last — step 5 ran the whole list after
  // step 2, so `.pop()` returned a different person and the check failed on its
  // own ordering rather than on anything the adapter did.
  const annCall = seen.find((x) => x.path.includes("mobile") && x.body?.first_name === "Ann");
  const anyCall = seen.find((x) => x.path.includes("mobile"));
  check("the key travels as a header, never in the URL",
    anyCall?.key === "stand-in-key-not-a-real-credential" && !anyCall.path.includes("key"), "X-API-Key <set>");
  check("asked about a named person at a domain",
    annCall?.body?.last_name === "Lee" && annCall?.body?.domain === "acme-bathrooms.co.uk",
    JSON.stringify(annCall?.body));
}

say("\n7. a national number with no country is refused, not guessed");
check("toE164 returns null rather than dialling a stranger", toE164("07700 900123") === null);
check("and resolves it when the country is supplied", toE164("07700 900123", "GB") === "447700900123");

server.close();
say(`\n${proven} proven / ${broken} broken`);
process.exit(broken ? 1 : 0);
