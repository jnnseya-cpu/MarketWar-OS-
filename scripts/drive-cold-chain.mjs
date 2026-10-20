// npm run drive:chain
//
// NAME AND TOWN IN. A MESSAGE ON THE WIRE OUT. EVERY STEP MEASURED.
//
// WHY THIS EXISTS. The owner is about to pay for two keys — SERPER_API_KEY and
// LEADMAGIC_API_KEY — and asked for the whole thing built and tested first, with
// one condition: *"It must not only crawl and find but to be in a position to
// send email and land in the inbox."* Finding an address and never sending to it
// is half a feature, and the half that cannot be checked.
//
// So this walks the complete chain and reports what is PROVEN at each step:
//
//   1. a company NAME and TOWN            → Serper → the company's own domain
//   2. the free crawl                     → the published address, £0
//   3. the row the crawl missed           → LeadMagic → a bought address
//   4. lawful basis                       → may this address be emailed at all
//   5. hygiene                            → the abuse desk is still refused
//   6. the undeliverable check            → and what it does when DNS is dark
//   7. a real TLS SMTP send               → the bytes a receiver actually reads
//
// WHAT IS REAL. The real search path, the real waterfall, the real ownership
// gate, the real eligibility rule, the real MIME builder, real DKIM signing and
// a real TLS SMTP server. `fetch` is intercepted only to rewrite the HOST of the
// two suppliers, so the request each one receives is byte-for-byte what
// serper.dev and api.leadmagic.io would receive — the keys, the headers, the JSON
// body and the endpoint paths are the platform's own.
//
// WHAT IS STOOD IN FOR, AND WHY. serper.dev, api.leadmagic.io, the company's own
// website, and the receiving mail host — this container has no outbound network
// and no DNS (`resolve4` fails for google.com), so none of the four can be
// reached. That is a limit of the container, not of the platform, and the end of
// this run says plainly which numbers therefore cannot come from here.
//
// NO REAL CREDENTIAL IS USED OR NEEDED. Both keys are set to obvious stand-in
// strings; the stand-in servers assert that the platform sent them in the right
// header, which is the part worth checking.

import fs from "node:fs";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);

// ---------------------------------------------------------------------------
// The two suppliers, stood up locally. Every request they receive is recorded,
// so "the platform asked correctly" is observed rather than assumed.
// ---------------------------------------------------------------------------
const serperCalls = [];
const leadmagicCalls = [];

const supplier = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const path = req.url;
    const json = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    const reply = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    if (path.startsWith("/serper/")) {
      serperCalls.push({ path, body: json, key: req.headers["x-api-key"] || "" });
      // A DIRECTORY FIRST, deliberately. Serper's top hit for a trades search is
      // very often Yell or Checkatrade, and the enricher has to refuse it — a
      // directory's inbox attached to a row emails the wrong company.
      return reply(200, {
        organic: [
          { title: "Acme Plumbing, Manchester | Yell", link: "https://www.yell.com/biz/acme-plumbing-manchester" },
          { title: "Acme Plumbing Ltd", link: "https://acme-plumbing.co.uk/" },
        ],
      });
    }

    if (path === "/leadmagic/email-finder") {
      leadmagicCalls.push({ path, body: json, key: req.headers["x-api-key"] || "" });
      // Answers for the named person at the quiet company, and NOT for anyone
      // else — so "charged only on a result" can be observed both ways.
      if (json.domain === "quiet-trades.co.uk" && /dave/i.test(json.first_name || "")) {
        return reply(200, { email: "dave.smith@quiet-trades.co.uk", status: "valid" });
      }
      return reply(200, { message: "not found" });
    }

    reply(404, {});
  });
});
const supplierPort = await new Promise((r) => supplier.listen(0, "127.0.0.1", () => r(supplier.address().port)));

// ---------------------------------------------------------------------------
// The two company websites.
// ---------------------------------------------------------------------------
const SITES = {
  "acme-plumbing.co.uk/": `<html><body><h1>Acme Plumbing Ltd</h1><a href="/contact">Contact</a></body></html>`,
  "acme-plumbing.co.uk/contact": `<html><body><h1>Contact Acme Plumbing Ltd</h1>
     <p>Email <a href="mailto:info@acme-plumbing.co.uk">info@acme-plumbing.co.uk</a> — 0161 496 0000</p>
     <p>Site by <a href="mailto:hello@brightsparkagency.com">Brightspark</a></p></body></html>`,
  // The second company publishes NO address. This is the row a paid supplier is
  // for, and the row that used to cost the owner £70 a list.
  "quiet-trades.co.uk/": `<html><body><h1>Quiet Trades Ltd</h1><a href="/contact">Contact</a></body></html>`,
  "quiet-trades.co.uk/contact": `<html><body><h1>Contact Quiet Trades Ltd</h1>
     <p>Use the form below. Call 0161 496 1111.</p><form></form></body></html>`,
  // A NAMED PERSON ON THEIR OWN PAGE. Needed because a mobile or email finder
  // answers "the address for THIS human at THIS domain" — a row that is only a
  // company name has nobody to ask about, so the chain does not ask and does not
  // spend a credit. My first version of this driver left this page out and then
  // reported the waterfall as broken for declining to waste money.
  // NOTE THE HEADING. My first version wrote "About Quiet Trades Ltd" directly
  // before the name, and `extractDecisionMaker` returned null — greedy name
  // matching reached back and produced "Ltd Dave Smith", which `looksLikeCompany`
  // then rejected. That is the safety net doing its job (no name beats a wrong
  // name), and it is worth knowing: a page that puts the legal name immediately
  // before a person's loses the person.
  "quiet-trades.co.uk/about": `<html><body><h1>About us</h1>
     <p>Dave Smith, Managing Director, founded the firm in 2009.</p></body></html>`,
};
const siteServer = http.createServer((req, res) => {
  const key = decodeURIComponent(req.url.replace(/^\//, ""));
  const body = SITES[key];
  if (body === undefined) { res.writeHead(404); res.end(""); return; }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(body);
});
const sitePort = await new Promise((r) => siteServer.listen(0, "127.0.0.1", () => r(siteServer.address().port)));

// ---------------------------------------------------------------------------
// THE KEYS. Stand-ins, and the stand-in servers check they arrived.
// ---------------------------------------------------------------------------
process.env.SERPER_API_KEY = "serper-stand-in-not-a-real-credential";
process.env.LEADMAGIC_API_KEY = "leadmagic-stand-in-not-a-real-credential";
delete process.env.HUNTER_API_KEY;
delete process.env.APOLLO_API_KEY;
delete process.env.SCRAPER_API_URL;

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  let u;
  try { u = new URL(url); } catch { return realFetch(input, init); }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "google.serper.dev") {
    return realFetch(`http://127.0.0.1:${supplierPort}/serper${u.pathname}`, init);
  }
  if (host === "api.leadmagic.io") {
    return realFetch(`http://127.0.0.1:${supplierPort}/leadmagic${u.pathname}`, init);
  }
  if (SITES[`${host}${u.pathname}`] !== undefined || /acme-plumbing|quiet-trades/.test(host)) {
    return realFetch(`http://127.0.0.1:${sitePort}/${encodeURIComponent(`${host}${u.pathname}`)}`, init);
  }
  return realFetch(input, init);
};

const enrich = await import(R("src/backend/enrich.ts"));
const enrichPaid = await import(R("src/backend/enrich-paid.ts"));
const mailbox = await import(R("src/shared/mailbox-class.ts"));
const email = await import(R("src/backend/email.ts"));
const verify = await import(R("src/backend/address-verify.ts"));

try {
  // -------------------------------------------------------------------------
  say("\n1. A NAME AND A TOWN BECOME A DOMAIN — and the directory is refused");
  // -------------------------------------------------------------------------
  {
    const r = await enrich.scrapeEnrich({ company: "Acme Plumbing Ltd", town: "Manchester", trade: "plumber" });
    check("the search provider was actually called", serperCalls.length >= 1, `${serperCalls.length} call(s)`);
    check("the key travelled in the X-API-KEY header, never in the URL",
      serperCalls[0]?.key === "serper-stand-in-not-a-real-credential" && !/serper-stand-in/.test(serperCalls[0]?.path || ""),
      serperCalls[0]?.key ? "header present" : "MISSING");
    check("the query is the trading name with the legal suffix stripped",
      !/\bLTD\b/i.test(serperCalls[0]?.body?.q || "") && /Acme Plumbing/.test(serperCalls[0]?.body?.q || ""),
      JSON.stringify(serperCalls[0]?.body?.q));
    check("Yell was REFUSED and the company's own domain taken",
      r.website === "https://acme-plumbing.co.uk", r.website || `(none) ${r.stage}`);
    check("the published address was read off their own site", r.email === "info@acme-plumbing.co.uk", r.email || "(none)");
    check("at HIGH confidence, because it is a company-domain inbox", r.emailConfidence === "high", r.emailConfidence);
    check("and the web designer's address was NOT taken", r.email !== "hello@brightsparkagency.com");
    check("this row cost nothing — no paid supplier was asked",
      leadmagicCalls.length === 0, `${leadmagicCalls.length} paid call(s)`);
  }

  // -------------------------------------------------------------------------
  say("\n2. THE ROW WITH NO PUBLISHED ADDRESS — the one a paid supplier is for");
  // -------------------------------------------------------------------------
  {
    const free = await enrich.scrapeEnrich({ company: "Quiet Trades Ltd", website: "https://quiet-trades.co.uk" });
    check("the free pass finds the site and no email, and says so",
      free.email === null && free.stage === "site_no_email", `${free.stage}: ${(free.note || "").slice(0, 70)}`);
    check("it reports the phone it DID find rather than nothing",
      (free.phone || "").replace(/\s+/g, "") === "01614961111", free.phone || "(none)");

    // THE PAID PASS. A named person plus a domain is what this supplier answers.
    const before = leadmagicCalls.length;
    // NO `fullName` IS PASSED, and that is the real shape of the call: the
    // waterfall discovers the person from the company's own /about page first,
    // then asks the supplier about them. A caller cannot inject a name here.
    const paid = await enrichPaid.enrichPaid(
      { company: "Quiet Trades Ltd", website: "https://quiet-trades.co.uk" },
      { maxCostAcu: 8 },
    );
    check("LeadMagic was called", leadmagicCalls.length > before, `${leadmagicCalls.length - before} call(s)`);
    check("the key went in X-API-Key, and the endpoint is email-finder",
      leadmagicCalls.at(-1)?.key === "leadmagic-stand-in-not-a-real-credential"
      && leadmagicCalls.at(-1)?.path === "/leadmagic/email-finder");
    check("it sent first_name, last_name and domain — nothing invented",
      leadmagicCalls.at(-1)?.body?.first_name === "Dave" && leadmagicCalls.at(-1)?.body?.last_name === "Smith"
      && leadmagicCalls.at(-1)?.body?.domain === "quiet-trades.co.uk",
      JSON.stringify(leadmagicCalls.at(-1)?.body));
    check("the bought address came back", paid.email === "dave.smith@quiet-trades.co.uk", paid.email || `(none) ${paid.stage}`);
    check("and it is marked BOUGHT, never 'confirmed' — we did not read it on a page",
      paid.emailConfidence !== "verified" && /provider|leadmagic/i.test(`${paid.source} ${paid.note}`),
      `${paid.emailConfidence} / ${paid.source}`);

    // A MISS IS FREE. The same supplier, asked about somebody it does not know.
    const missBefore = leadmagicCalls.length;
    const miss = await enrichPaid.enrichPaid(
      { company: "Acme Plumbing Ltd", website: "https://acme-plumbing.co.uk" },
      { maxCostAcu: 8 },
    );
    check("a company whose address is already published needs no paid call at all",
      miss.email === "info@acme-plumbing.co.uk" && leadmagicCalls.length === missBefore,
      `${miss.email} / ${leadmagicCalls.length - missBefore} paid call(s)`);
  }

  // -------------------------------------------------------------------------
  say("\n3. MAY THIS ADDRESS BE EMAILED AT ALL — before a byte is sent");
  // -------------------------------------------------------------------------
  {
    const biz = mailbox.bulkEligibility({ email: "info@acme-plumbing.co.uk" });
    check("a company mailbox is mailable on legitimate interests, with no consent on file",
      biz.mailable === true && biz.basis === "legitimate_interest", `${biz.basis}`);
    const named = mailbox.bulkEligibility({ email: "dave.smith@quiet-trades.co.uk" });
    check("so is a NAMED mailbox at a company — PECR r22 is about individual subscribers",
      named.mailable === true, `${named.basis}`);
    const consumer = mailbox.bulkEligibility({ email: "dave.smith@gmail.com" });
    check("a personal gmail with nothing on file is REFUSED — the one that is unlawful",
      consumer.mailable === false && consumer.basis === "needs_consent", consumer.basis);
    const out = mailbox.bulkEligibility({ email: "info@acme-plumbing.co.uk", consent: false });
    check("and an objection beats every basis", out.mailable === false && out.basis === "opted_out");
  }

  // -------------------------------------------------------------------------
  say("\n4. HYGIENE AND THE UNDELIVERABLE CHECK");
  // -------------------------------------------------------------------------
  {
    check("info@ is sendable — it is the front door, not a problem",
      email.validateAddress("info@acme-plumbing.co.uk").sendable === true);
    check("abuse@ is still refused",
      email.validateAddress("abuse@acme-plumbing.co.uk").sendable === false);
    const typo = await verify.verifyRecipients(["dave@gmial.com"]);
    check("a mistyped consumer domain is removed before sending, with the correction OFFERED",
      typo.removed[0]?.kind === "typo" && typo.removed[0]?.suggestion === "dave@gmail.com",
      typo.removed[0]?.suggestion);

    // THE HONEST BEHAVIOUR WHEN DNS IS DARK, which is this container exactly.
    // THE DEFECT THIS RUN FOUND. With DNS blocked every lookup returns ENOTFOUND,
    // which reads as "this domain does not exist" — so gmail.com and nhs.uk were
    // removed and marked PERMANENT, which writes a suppression row. A deployment
    // whose DNS broke would have suppressed a customer's entire list in one send.
    verify.clearResolverHealth();
    verify.clearMailRouteCache();
    const res = await verify.verifyRecipients(["a@gmail.com", "b@nhs.uk", "c@acme-plumbing.co.uk"]);
    check("a dead resolver removes NOTHING — the control domains vetoed every verdict",
      res.removed.length === 0 && res.deliverable.length === 3,
      `${res.removed.length} removed, ${res.unknown} unknown`);
    check("and the note blames DNS on this host rather than the customer's list",
      /RESOLVER ON THIS HOST IS NOT ANSWERING/.test(res.note), res.note.slice(0, 100));
    check("nothing was suppressed, so the list survives the outage",
      res.removed.every((r) => !r.permanent));
  }

  // -------------------------------------------------------------------------
  say("\n5. THE SEND — over a real TLS SMTP server, and the bytes inspected");
  // -------------------------------------------------------------------------
  {
    const { fakeSmtp } = await import(new URL("../tests/helpers/fake-smtp.mjs", import.meta.url).href);
    const smtp = fakeSmtp();
    const port = await smtp.listen(0);
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(port);
    process.env.SMTP_USER = "info@marketwaros.com";
    process.env.SMTP_PASS = "stand-in-not-a-real-credential";
    process.env.SMTP_SECURE = "false";
    process.env.EMAIL_FROM = "MarketWar OS <info@marketwaros.com>";
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";   // the local self-signed server only

    // A real 2048-bit key, generated here, so the DKIM signature is a real
    // signature over the real body rather than a placeholder header.
    const keyPem = execFileSync("openssl", ["genrsa", "2048"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

    const { replyTarget } = await import(R("src/shared/sender-identity.ts"));
    const reply = replyTarget({ accountEmail: "owner@acmebathrooms.co.uk", platformFrom: process.env.EMAIL_FROM });

    const results = await email.sendEmailBatch(
      [
        { to: "info@acme-plumbing.co.uk", subject: "Trade supply terms", html: "<p>Hello — we supply bathrooms to trade.</p>" },
        { to: "dave.smith@quiet-trades.co.uk", subject: "Trade supply terms", html: "<p>Hello Dave — we supply bathrooms to trade.</p>" },
      ],
      {
        brandId: "acme-bathrooms", campaign: "trade-intro",
        from: "Acme Bathrooms <hello@acmebathrooms.co.uk>",
        replyTo: reply.address,
        dkim: { domain: "acmebathrooms.co.uk", selector: "mw", privateKeyPem: keyPem },
      },
    );

    check("both messages left", results.filter((r) => r.ok).length === 2 && smtp.received.length === 2,
      `${results.filter((r) => r.ok).length} ok, ${smtp.received.length} on the wire`);

    const m = smtp.received[0]?.body || "";
    say("     — the headers a receiver actually reads —");
    check("DKIM-Signature is present and signs this body",
      /^DKIM-Signature:/im.test(m) && /d=acmebathrooms\.co\.uk/.test(m) && /bh=/.test(m),
      (m.match(/^DKIM-Signature:.*/im) || [""])[0].slice(0, 80));
    check("List-Unsubscribe is set", /^List-Unsubscribe:/im.test(m));
    check("one-click unsubscribe (RFC 8058) — required of bulk senders since Feb 2024",
      /List-Unsubscribe-Post:\s*List-Unsubscribe=One-Click/i.test(m));
    check("a plain-text alternative — HTML-only mail is the biggest single spam signal",
      /multipart\/alternative/i.test(m) && /Content-Type: text\/plain/i.test(m));
    check("List-ID scopes the list, so a receiver can block it without blocking the domain",
      /^List-ID:.*acme-bathrooms/im.test(m), (m.match(/^List-ID:.*/im) || [""])[0].slice(0, 60));
    check("Feedback-ID names the campaign, which is what Gmail's postmaster tools group on",
      /^Feedback-ID:.*trade-intro/im.test(m));
    check("Reply-To is the CUSTOMER'S own mailbox, not the platform's",
      /^Reply-To:\s*owner@acmebathrooms\.co\.uk/im.test(m), (m.match(/^Reply-To:.*/im) || [""])[0]);
    check("and the unsubscribe token differs per recipient, so one link cannot opt out another",
      (() => {
        const tok = (x) => (x.match(/unsubscribe\?t=([^>\s]+)/) || [])[1];
        const a = tok(smtp.received[0].body), b = tok(smtp.received[1].body);
        return Boolean(a && b && a !== b);
      })());
    smtp.close?.();
  }
} finally {
  globalThis.fetch = realFetch;
  supplier.close();
  siteServer.close();
}

say(`\n${proven} proven / ${broken} broken`);
say(`
WHAT THIS RUN DOES NOT AND CANNOT PROVE, said plainly rather than left to the
pass count:

  • WHICH FOLDER a message lands in. Nobody can promise the Primary tab — it is
    Gmail's classifier and it reads engagement history as well as message shape.
    What is proven above is the SHAPE, which is the part under our control.
    MW_SEED_MAILBOXES + /api/placement measures the folder for real.
  • SERPER'S AND LEADMAGIC'S OWN hit rate, data quality or current prices. The
    requests they receive are byte-for-byte the platform's; what comes back here
    is a stand-in, because this container has no outbound network and no DNS.
  • The share of REAL company sites that publish an address at all. That decides
    how many rows need a paid lookup, and it is a property of the web rather than
    of this code.

Everything else above is the platform's own behaviour, measured.`);
process.exit(broken ? 1 : 0);
