import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// FINDING EMAILS AND MOBILES FROM A LIST — AND THE ONE CLAIM NOBODY MAY MAKE.
//
// THE RESEARCHED CONSTRAINT THIS WHOLE FILE DEFENDS. There is no longer any API
// that answers "is this phone number on WhatsApp":
//
//   • the On-Premises API's `/contacts` endpoint answered it until client 2.45.1,
//     when it began returning "valid" with a WhatsApp ID for EVERY number
//     regardless of registration — so it stopped being a check before it was
//     switched off. The whole On-Premises API was sunset on 23 October 2025.
//   • the Cloud API, now the only supported WhatsApp Business API, has no
//     equivalent endpoint.
//
// Anything that claims to bulk-check it is driving WhatsApp Web through an
// unofficial wrapper, which breaches WhatsApp's terms and gets the SENDING
// account banned — on this platform, the customer's own business number.
//
// So the product answers a narrower question honestly: is this a dialable mobile
// line, and what is the compliant way to open a conversation. Every test below
// exists to stop that line being crossed by a later edit.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("NOTHING anywhere claims a number is registered on WhatsApp", async () => {
  const files = [
    "src/shared/whatsapp-reach.ts",
    "src/backend/enrichment-adapters.ts",
    "src/backend/enrich-paid.ts",
  ];
  for (const f of files) {
    const code = codeOf(readFileSync(f, "utf8"));
    // The phrasings a well-meaning edit reaches for. Each one asserts a fact that
    // cannot be obtained, and a machine-readable lie is worse than a silence.
    for (const re of [
      /on WhatsApp[^?]*: true/i,
      /isOnWhatsApp/i,
      /whatsappRegistered/i,
      /hasWhatsApp/i,
      /verified on WhatsApp/i,
      /confirmed on WhatsApp/i,
    ]) {
      assert.doesNotMatch(code, re, `${f} claims WhatsApp registration, which no API can tell it: ${re}`);
    }
  }

  // And the module says WHY, so the next person does not go looking for the
  // endpoint. The dates are the load-bearing part.
  const src = readFileSync("src/shared/whatsapp-reach.ts", "utf8");
  assert.match(src, /23 October 2025/, "the On-Premises sunset date is the fact that closes this question");
  assert.match(src, /2\.45\.1/, "and the version where the check stopped being accurate");
  assert.match(src, /Cloud API[\s\S]{0,200}no equivalent/i);
});

test("every verdict carries needsOptIn, and it is always true", async () => {
  const { whatsappReach } = await import("../src/shared/whatsapp-reach.ts");
  const cases = [
    null,
    { e164: "447700900123", display: "+447700900123", lineType: "mobile", provenance: "provider" },
    { e164: "442079460000", display: "+442079460000", lineType: "landline", provenance: "published" },
    { e164: "442079460000", display: "+442079460000", lineType: "voip", provenance: "provider" },
    { e164: "447700900123", display: "+447700900123", lineType: "unknown", provenance: "published" },
  ];
  for (const phone of cases) {
    for (const optedIn of [false, true]) {
      const v = whatsappReach({ phone, optedIn });
      // WhatsApp's Business Messaging Policy requires the person's permission
      // before any business-initiated message. A found number is not an opt-in,
      // and this flag exists so no surface can forget it.
      assert.equal(v.needsOptIn, true,
        `needsOptIn must be true for ${phone?.lineType ?? "no number"} (optedIn=${optedIn})`);
      assert.ok(v.why.length > 40, "every verdict must explain itself");
    }
  }
});

test("a landline and a VoIP number are refused, not optimistically linked", async () => {
  const { whatsappReach } = await import("../src/shared/whatsapp-reach.ts");
  const landline = whatsappReach({
    phone: { e164: "442079460000", display: "+442079460000", lineType: "landline", provenance: "published" },
  });
  assert.equal(landline.mobile, false);
  assert.equal(landline.dialable, false);
  assert.equal(landline.waLink, null, "a WhatsApp message to a landline is delivered to nobody");
  assert.match(landline.why, /landline/i);

  const voip = whatsappReach({
    phone: { e164: "442079460001", display: "+442079460001", lineType: "voip", provenance: "provider" },
  });
  assert.equal(voip.waLink, null);
  assert.match(voip.why, /VoIP/);
});

test("an unknown line type is reported as unknown, never assumed to be a mobile", async () => {
  const { whatsappReach } = await import("../src/shared/whatsapp-reach.ts");
  const v = whatsappReach({
    phone: { e164: "447700900123", display: "+447700900123", lineType: "unknown", provenance: "published" },
  });
  // A number off a customer's CSV has no line type. Calling it a mobile because
  // it starts 07 is how a campaign gets sent to a switchboard.
  assert.equal(v.mobile, false, "unknown is not mobile");
  assert.equal(v.dialable, true, "but it is still a number somebody can try");
  assert.match(v.why, /unknown/i);
});

test("a mobile says what it is AND what still cannot be known", async () => {
  const { whatsappReach } = await import("../src/shared/whatsapp-reach.ts");
  const cold = whatsappReach({
    phone: { e164: "447700900123", display: "+447700900123", lineType: "mobile", provenance: "provider" },
    prefill: "Hi, I saw your bathroom page",
  });
  assert.equal(cold.mobile, true);
  assert.equal(cold.dialable, true);
  assert.match(cold.waLink, /^https:\/\/wa\.me\/447700900123\?text=/);
  // THE TWO THINGS THE SENTENCE MUST BOTH CONTAIN: a mobile is what WhatsApp
  // needs, and whether they are on it cannot be checked.
  assert.match(cold.why, /mobile line/i);
  assert.match(cold.why, /cannot be checked|cannot be determined/i);
  assert.match(cold.why, /permission/i, "and the opt-in requirement must be in the words, not only the flag");

  const warm = whatsappReach({
    phone: { e164: "447700900123", display: "+447700900123", lineType: "mobile", provenance: "provider" },
    optedIn: true,
  });
  assert.match(warm.why, /permission/i);
  assert.match(warm.why, /not something any API can confirm/i,
    "even with an opt-in, registration is still unknown — a send that fails is the only evidence");
});

test("E.164 refuses to guess a country rather than dialling a stranger", async () => {
  const { toE164 } = await import("../src/shared/whatsapp-reach.ts");
  // Already international: the country is in the number.
  assert.equal(toE164("+44 7700 900123"), "447700900123");
  assert.equal(toE164("0044 7700 900123"), "447700900123");
  assert.equal(toE164("+1 (415) 555-2671"), "14155552671");

  // National, WITH a country supplied: the trunk zero is replaced.
  assert.equal(toE164("07700 900123", "GB"), "447700900123");
  assert.equal(toE164("07700900123", "UK"), "447700900123");
  assert.equal(toE164("0821234567", "CD"), "243821234567");
  // North America has no trunk prefix, so nothing is stripped.
  assert.equal(toE164("4155552671", "US"), "14155552671");

  // NATIONAL WITH NO COUNTRY IS NOT A NUMBER. "07700 900123" is a UK mobile and
  // a Dutch landline; writing 44 on the front because most customers are British
  // produces a number that dials a real person who is not the prospect.
  assert.equal(toE164("07700 900123"), null);
  assert.equal(toE164("07700 900123", "ZZ"), null, "an unknown country is not a licence to guess");
  assert.equal(toE164("", "GB"), null);
  assert.equal(toE164(null, "GB"), null);
  assert.equal(toE164("12", "GB"), null, "too short to be a phone number");
  assert.equal(toE164("1".repeat(20), "GB"), null, "too long to be a phone number");
});

test("the wa.me link addresses one number, and is not the share link", async () => {
  const { waLink } = await import("../src/shared/whatsapp-reach.ts");
  assert.equal(waLink("447700900123"), "https://wa.me/447700900123");
  assert.match(waLink("447700900123", "Hello"), /wa\.me\/447700900123\?text=Hello/);
  assert.equal(waLink("12"), null);
  assert.equal(waLink(""), null);

  // `shared/social.ts` has `wa.me/?text=` — a chooser for the SENDER to pick a
  // recipient. Right for "share this post", wrong for contacting a prospect, and
  // the two being one function is how a campaign would open an empty chat.
  const social = readFileSync("src/shared/social.ts", "utf8");
  assert.match(social, /wa\.me\/\?text=/, "the share link is still the share link");
  const reach = codeOf(readFileSync("src/shared/whatsapp-reach.ts", "utf8"));
  assert.doesNotMatch(reach, /wa\.me\/\?text=/, "the contact link must name a number");
});

test("the summary counts, and says out loud that none of them is an opt-in", async () => {
  const { reachSummary, whatsappReach } = await import("../src/shared/whatsapp-reach.ts");
  const verdicts = [
    whatsappReach({ phone: { e164: "447700900123", display: "", lineType: "mobile", provenance: "provider" } }),
    whatsappReach({ phone: { e164: "447700900124", display: "", lineType: "mobile", provenance: "provider" } }),
    whatsappReach({ phone: { e164: "442079460000", display: "", lineType: "landline", provenance: "published" } }),
    whatsappReach({ phone: { e164: "447700900125", display: "", lineType: "unknown", provenance: "published" } }),
    whatsappReach({ phone: null }),
  ];
  const s = reachSummary(verdicts);
  assert.equal(s.total, 5);
  assert.equal(s.mobiles, 2);
  assert.equal(s.unusable, 2, "the landline and the unusable number");
  assert.equal(s.unknownLineType, 1);
  assert.equal(s.needOptIn, 5, "every one of them needs permission, not just the mobiles");
  assert.match(s.line, /None of them is an opt-in/i);
  // A REAL ASSERTION. The first version of this line chose its own pattern from
  // the string it was about to test, so it passed whatever the string said —
  // a check that cannot fail, which is worse than no check.
  assert.match(s.line, /people you may invite to message you, not people you may message/,
    "the summary must say the mobiles are an invitation list, not a send list");
  assert.equal(reachSummary([]).line, "No numbers to assess.");
});

// ---------------------------------------------------------------------------
// THE SUPPLIER, AND WHAT IT COSTS.
// ---------------------------------------------------------------------------

test("a phone is priced as a phone, not at the email rate", async () => {
  const { ENRICHMENT_PROVIDER_USD } = await import("../src/shared/creative.ts");
  const { LEADMAGIC_COST_ACU, LEADMAGIC_PHONE_COST_ACU, leadmagic } =
    await import("../src/backend/enrichment-adapters.ts");

  // A supplier that sells an email for one credit charges five for a mobile.
  // Charging the email rate for a phone breaches the margin floor on every call
  // and is invisible, because the number still looks like a price.
  assert.ok(ENRICHMENT_PROVIDER_USD.leadmagic_phone > ENRICHMENT_PROVIDER_USD.leadmagic,
    "a mobile costs more than an email at this supplier");
  assert.ok(LEADMAGIC_PHONE_COST_ACU > LEADMAGIC_COST_ACU, "and the ACU cost must reflect it");
  assert.equal(leadmagic.phoneCostAcu, LEADMAGIC_PHONE_COST_ACU);
  assert.equal(leadmagic.costAcu, LEADMAGIC_COST_ACU);

  // DERIVED, NOT TYPED, and rounded UP so rounding cannot undercut the floor.
  const { USD_TO_GBP, ACU_PER_GBP } = await import("../src/shared/creative.ts");
  assert.equal(LEADMAGIC_COST_ACU, Math.ceil(ENRICHMENT_PROVIDER_USD.leadmagic * USD_TO_GBP * ACU_PER_GBP));
  assert.equal(LEADMAGIC_PHONE_COST_ACU, Math.ceil(ENRICHMENT_PROVIDER_USD.leadmagic_phone * USD_TO_GBP * ACU_PER_GBP));

  // And the waterfall must price the CAPABILITY, or the budget gate lets a phone
  // through on an email's allowance.
  const chain = codeOf(readFileSync("src/backend/enrichment-provider.ts", "utf8"));
  assert.match(chain, /capability === "phones" \? \(p\.phoneCostAcu \?\? p\.costAcu\) : p\.costAcu/);
  assert.match(chain, /costAcu: items\.length > 0 \? costWhenFound : 0/,
    "step() must charge what the capability costs, not the provider's default");
});

test("the cheapest paid supplier runs first, and adding it did not raise the floor", async () => {
  const { ENRICHMENT_PROVIDER_USD, DEAREST_ENRICHMENT_COST_ACU } = await import("../src/shared/creative.ts");
  const { leadmagic, hunter, apollo } = await import("../src/backend/enrichment-adapters.ts");

  assert.ok(ENRICHMENT_PROVIDER_USD.leadmagic < ENRICHMENT_PROVIDER_USD.hunter);
  assert.ok(ENRICHMENT_PROVIDER_USD.leadmagic < ENRICHMENT_PROVIDER_USD.apollo);
  assert.ok(leadmagic.order < hunter.order, "the cheaper supplier must be asked first");
  assert.ok(leadmagic.order < apollo.order);

  // The margin floor is computed from the DEAREST supplier, so a cheaper one
  // must not move it — if it did, adding a cheap provider would raise prices.
  const dearest = Math.max(...Object.values(ENRICHMENT_PROVIDER_USD));
  assert.equal(dearest, ENRICHMENT_PROVIDER_USD.hunter, "Hunter is still the dearest call");
  assert.equal(DEAREST_ENRICHMENT_COST_ACU, 4, "and the floor is unchanged");
});

test("no key means no calls and an honest health note, never a throw", async () => {
  const { leadmagic } = await import("../src/backend/enrichment-adapters.ts");
  const saved = process.env.LEADMAGIC_API_KEY;
  delete process.env.LEADMAGIC_API_KEY;
  try {
    const h = leadmagic.health();
    assert.equal(h.configured, false);
    assert.match(h.note, /LEADMAGIC_API_KEY/);
    assert.match(h.note, /only source of a mobile/i, "the note must say what is lost without it");

    // A provider that cannot do something returns [] rather than throwing — a
    // waterfall that treats "not configured" as an error stops on its first
    // free source.
    const ac = new AbortController();
    assert.deepEqual(await leadmagic.findEmails({ domain: "example.com", firstName: "Ann", lastName: "Lee" }, ac.signal), []);
    assert.deepEqual(await leadmagic.findPhones({ fullName: "Ann Lee", domain: "example.com" }, ac.signal), []);
  } finally {
    if (saved === undefined) delete process.env.LEADMAGIC_API_KEY;
    else process.env.LEADMAGIC_API_KEY = saved;
  }
});

test("a bought address is `provider`, never `confirmed`", () => {
  const code = codeOf(readFileSync("src/backend/enrichment-adapters.ts", "utf8"));
  const start = code.indexOf("export const leadmagic");
  const block = code.slice(start, code.indexOf("export const apollo"));
  assert.ok(start > 0 && block.length > 200);
  // `confirmed` means WE read it on a page. A supplier's answer is `provider`
  // however confident the supplier sounds, and collapsing the two turns a bought
  // guess into a fact downstream.
  assert.doesNotMatch(block, /provenance: "confirmed"/);
  assert.match(block, /provenance: "provider"/);
  // And a phone the supplier sold is `provider`, not `published`.
  assert.doesNotMatch(block, /provenance: "published"/);
});

test("the mobile is opt-in on the batch path, because it costs five times an email", () => {
  const paid = codeOf(readFileSync("src/backend/enrich-paid.ts", "utf8"));
  assert.match(paid, /wantMobile\?: boolean/);
  assert.match(paid, /if \(opts\.wantMobile\) \{/, "no flag, no phone call, no charge");
  assert.match(paid, /wantPhone: true/);
  // A row that is only a company name has nobody to ask about — and that is
  // SAID, because "we did not look" and "we looked and found nothing" want
  // different next actions.
  assert.match(paid, /a mobile finder needs a named person/);
  // A supplier refusal on the phone must not lose the email the row already found.
  assert.match(paid, /the address above is unaffected/);

  const chain = codeOf(readFileSync("src/backend/enrichment-provider.ts", "utf8"));
  assert.match(chain, /if \(input\.wantPhone && !stoppedEarly\) \{/);
  assert.match(chain, /wantPhone\?: boolean/);
});
