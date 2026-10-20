// npm run drive:social
//
// A FACEBOOK OR LINKEDIN PAGE TURNED INTO AN EMAIL, FOR NOTHING.
//
// WHY THIS EXISTS. The owner paid £70 for contact emails off LinkedIn and
// Facebook because his own platform produced none. Driven with every key
// deleted, the cause was exact: the free crawl finds a published email on a
// company's own site and needs only the domain — and `findWebsite` refused a
// social URL as an aggregator, so a list bought off those networks died at
// "needs live Google data", when the page states the website right there.
//
// WHAT IS REAL IN HERE. The real enricher, the real ownership gate, the real
// extraction, and local servers standing in for Facebook, LinkedIn and the
// company's own site. `fetch` is intercepted only to rewrite the host, so what
// the enricher asks for and what it accepts are untouched.
//
// WHY A STAND-IN AT ALL: this container has no DNS — `resolve4` fails for
// google.com — so no live page can be read from here. What is proven is the
// platform's own behaviour. What is NOT proven is the share of real Facebook
// pages that answer a signed-out reader, and the driver says so at the end
// rather than letting the pass rate imply it.

import fs from "node:fs";
import http from "node:http";
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

// NO KEYS. Cleared explicitly, so nothing below can pass by paying for it.
for (const k of ["SERPER_API_KEY", "HUNTER_API_KEY", "APOLLO_API_KEY", "LEADMAGIC_API_KEY", "SCRAPER_API_URL"]) {
  delete process.env[k];
}

// ---------------------------------------------------------------------------
// The three sites: a Facebook page, a LinkedIn page, and the company's own.
// ---------------------------------------------------------------------------
const shim = (target) => `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=AT0abc`;

const PAGES = {
  // A Facebook page as one actually renders: the outbound link goes through the
  // click shim, and the page also links the agency that built the site.
  "fb/acmeplumbing": `<html><head><title>Acme Plumbing Ltd | Facebook</title></head><body>
     ${"<span>page chrome</span>".repeat(200)}
     <div>Plumbing and heating in Manchester since 2004.</div>
     <a href="${shim("https://acme-plumbing.co.uk/")}">acme-plumbing.co.uk</a>
     <a href="${shim("https://brightsparkagency.com/")}">Website by Brightspark</a>
     <a href="https://www.facebook.com/acmeplumbing/photos">Photos</a>
   </body></html>`,

  // A LinkedIn company page that states the site in its own structured data.
  "li/acme-plumbing-ltd": `<html><head>
     <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization",
       "name":"Acme Plumbing Ltd","sameAs":["https://acme-plumbing.co.uk"],
       "url":"https://www.linkedin.com/company/acme-plumbing-ltd"}</script>
     </head><body>${"<div>feed</div>".repeat(300)}</body></html>`,

  // The sign-in wall both networks serve a signed-out reader much of the time.
  "fb/walled-co": `<html><body><div>You must log in to continue.</div></body></html>`,

  // THE SAME PAGE WITH THE AGENCY'S LINK FIRST. Needed because the gate returns
  // on the first candidate that PASSES, so when the company's own domain comes
  // first the agency is never examined and `rejected` stays empty — which my own
  // first version of this check mistook for the gate not working. Here the
  // agency is reached first, so the refusal is actually exercised.
  "fb/designer-first": `<html><head><title>Acme Plumbing Ltd | Facebook</title></head><body>
     ${"<span>page chrome</span>".repeat(200)}
     <a href="${shim("https://brightsparkagency.com/")}">Website by Brightspark</a>
     <a href="${shim("https://acme-plumbing.co.uk/")}">acme-plumbing.co.uk</a>
   </body></html>`,

  // A page that names only somebody else's domain.
  "fb/mismatch-co": `<html><head><title>Northern Boilers Ltd</title></head><body>
     ${"<span>chrome</span>".repeat(200)}
     <a href="${shim("https://bookingplatform.io/northern")}">Book online</a>
   </body></html>`,

  // A readable page that names no website at all.
  "fb/nosite-co": `<html><head><title>Quiet Trades Ltd</title></head><body>
     ${"<span>chrome</span>".repeat(200)}<div>Call us on 0161 496 0000.</div>
   </body></html>`,

  // The company's own site — what the crawl does once it has the domain.
  "own/": `<html><body><h1>Acme Plumbing Ltd</h1><a href="/contact">Contact</a></body></html>`,
  "own/contact": `<html><body><h1>Contact Acme Plumbing Ltd</h1>
     <p>Email <a href="mailto:info@acme-plumbing.co.uk">info@acme-plumbing.co.uk</a> or call 0161 496 0000.</p>
     <p>Site by <a href="mailto:hello@brightsparkagency.com">Brightspark</a></p>
   </body></html>`,
};

const asked = [];
const server = http.createServer((req, res) => {
  const key = decodeURIComponent(req.url.replace(/^\//, "").split("?")[0]);
  asked.push(key);
  const body = PAGES[key];
  if (body === undefined) { res.writeHead(404); res.end(""); return; }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(body);
});
const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  let u;
  try { u = new URL(url); } catch { return realFetch(input, init); }
  const host = u.hostname.replace(/^www\./, "");
  const map = (key) => realFetch(`http://127.0.0.1:${port}/${encodeURIComponent(key)}`, init);
  if (/facebook\.com$/.test(host) && !/^l\./.test(u.hostname)) return map(`fb${u.pathname.replace(/\/$/, "")}`);
  if (/linkedin\.com$/.test(host)) return map(`li${u.pathname.replace(/^\/company/, "").replace(/\/$/, "")}`);
  if (host === "acme-plumbing.co.uk") return map(`own${u.pathname}`);
  return realFetch(input, init);
};

try {
  const social = await import(R("src/backend/social-website.ts"));
  const pure = await import(R("src/shared/social-profile.ts"));
  const enrich = await import(R("src/backend/enrich.ts"));

  // -------------------------------------------------------------------------
  say("\n1. THE EXTRACTION — Facebook's click shim is not an obstacle");
  // -------------------------------------------------------------------------
  check("the shim is unwrapped to the real target",
    pure.unwrapRedirect(shim("https://acme-plumbing.co.uk/")) === "https://acme-plumbing.co.uk/",
    pure.unwrapRedirect(shim("https://acme-plumbing.co.uk/")));
  check("a social URL is recognised, a company site is not",
    pure.isSocialProfileUrl("https://facebook.com/acmeplumbing") === true
    && pure.isSocialProfileUrl("https://acme-plumbing.co.uk") === false);
  check("structured data is read ahead of a plain link",
    pure.websiteCandidatesFrom(PAGES["li/acme-plumbing-ltd"])[0]?.from === "json-ld");
  check("and the page's OWN network is never offered as the answer",
    pure.websiteCandidatesFrom(PAGES["fb/acmeplumbing"]).every((c) => !/facebook\.com/.test(c.url)));

  // -------------------------------------------------------------------------
  say("\n2. THE GATE — the company's site, and not the agency that built it");
  // -------------------------------------------------------------------------
  {
    const v = await social.websiteFromSocialPage({ url: "https://www.facebook.com/acmeplumbing", company: "Acme Plumbing Ltd" });
    check("the website is found", v.website === "https://acme-plumbing.co.uk" && v.outcome === "found", `${v.outcome}: ${v.website}`);
    check("it cost nothing", v.costAcu === 0);
    check("the web designer's domain is never the answer",
      v.website !== "https://brightsparkagency.com", v.website);
    check("and the verdict says where it was read from", /outbound link/.test(v.why), v.why.slice(0, 95));
  }
  {
    // THE ORDER THAT ACTUALLY EXERCISES THE GATE: the agency's link first.
    const v = await social.websiteFromSocialPage({ url: "https://www.facebook.com/designer-first", company: "Acme Plumbing Ltd" });
    check("with the agency's link FIRST, it is examined and refused",
      v.rejected.some((r) => /brightsparkagency/.test(r.url)), v.rejected.map((r) => r.url).join(", ") || "(none rejected)");
    check("and the company's own domain is still the one returned",
      v.website === "https://acme-plumbing.co.uk" && v.outcome === "found", `${v.outcome}: ${v.website}`);
    check("the refusal says why that domain could not be tied to the company",
      /cannot be tied to "Acme Plumbing Ltd"/.test(v.rejected[0]?.why || ""), (v.rejected[0]?.why || "").slice(0, 95));
  }
  {
    const v = await social.websiteFromSocialPage({ url: "https://www.linkedin.com/company/acme-plumbing-ltd", company: "Acme Plumbing Ltd" });
    check("a LinkedIn page works the same way", v.website === "https://acme-plumbing.co.uk" && v.evidence === "json-ld", `${v.outcome}/${v.evidence}`);
  }

  // -------------------------------------------------------------------------
  say("\n3. THE THREE HONEST FAILURES, each a different sentence");
  // -------------------------------------------------------------------------
  {
    const walled = await social.websiteFromSocialPage({ url: "https://www.facebook.com/walled-co", company: "Walled Co Ltd" });
    check("a sign-in wall is reported as a wall", walled.outcome === "walled", walled.outcome);
    check("and it says the fault is OURS, not the company's",
      /says nothing about the company/.test(walled.why), walled.why.slice(0, 100));
    check("it names the remedy without naming a workaround",
      /SCRAPER_API_URL/.test(walled.why) && !/log in as|credentials|cookie/i.test(walled.why));

    const mismatch = await social.websiteFromSocialPage({ url: "https://www.facebook.com/mismatch-co", company: "Northern Boilers Ltd" });
    check("a domain that cannot be tied to the company is REFUSED", mismatch.outcome === "rejected" && mismatch.website === null, mismatch.outcome);
    check("and the refusal explains the cost of being wrong",
      /real stranger's company/.test(mismatch.why), mismatch.why.slice(-80));

    const none = await social.websiteFromSocialPage({ url: "https://www.facebook.com/nosite-co", company: "Quiet Trades Ltd" });
    check("a readable page naming no site says exactly that", none.outcome === "none", none.outcome);
    check("and does NOT suggest a guessed domain", none.website === null && /not a guessed domain/.test(none.why));

    // No company name means no gate, so there is no answer to give.
    const ungated = await social.websiteFromSocialPage({ url: "https://www.facebook.com/acmeplumbing", company: "" });
    check("with no company name nothing is returned, rather than the first link",
      ungated.website === null && ungated.outcome === "rejected", ungated.why.slice(0, 80));
  }

  // -------------------------------------------------------------------------
  say("\n4. END TO END: a Facebook URL in the website column → an email, £0");
  // -------------------------------------------------------------------------
  {
    // THE ROW THE OWNER ACTUALLY BOUGHT. A list off Facebook puts the page in
    // the website column, and this is the row that used to die.
    const before = asked.length;
    const r = await enrich.scrapeEnrich({
      company: "Acme Plumbing Ltd",
      website: "https://www.facebook.com/acmeplumbing",
      town: "Manchester",
    });
    check("the email was found", r.email === "info@acme-plumbing.co.uk", r.email || `(none) ${r.stage}`);
    check("confidence is high, because it was read off their own domain", r.emailConfidence === "high", r.emailConfidence);
    check("the website was resolved from the social page", r.website === "https://acme-plumbing.co.uk", r.website || "(none)");
    check("the designer's address was not taken", r.email !== "hello@brightsparkagency.com");
    check("the note says the social page is where the domain came from",
      /Facebook page/.test(r.note || ""), (r.note || "").slice(0, 110));
    check("NO search provider was called — there is no key and none was needed",
      !asked.slice(before).some((k) => /serper|google/i.test(k)), asked.slice(before).join(", "));

    // And the explicit field, for a list that has the social URL in its own column.
    const viaField = await enrich.scrapeEnrich({
      company: "Acme Plumbing Ltd", socialUrl: "https://www.linkedin.com/company/acme-plumbing-ltd",
    });
    check("socialUrl works as its own column too", viaField.email === "info@acme-plumbing.co.uk", viaField.email || viaField.stage);
  }

  // -------------------------------------------------------------------------
  say("\n5. THE ROW THAT STILL CANNOT BE SOLVED SAYS WHY — and names the real obstacle");
  // -------------------------------------------------------------------------
  {
    const walled = await enrich.scrapeEnrich({ company: "Walled Co Ltd", website: "https://www.facebook.com/walled-co" });
    check("a walled row falls through to search and still has no key", walled.mode === "demo", walled.mode);
    check("but the note leads with the WALL, not with 'set SERPER_API_KEY'",
      /wall|log in/i.test((walled.note || "").slice(0, 120)), (walled.note || "").slice(0, 140));
    check("the Serper advice is still there, second, for the rows it would help",
      /SERPER_API_KEY/.test(walled.note || ""));
  }
} finally {
  globalThis.fetch = realFetch;
  server.close();
}

say(`\n${proven} proven / ${broken} broken`);
say(`
NOT PROVEN, AND IT IS THE NUMBER THAT DECIDES THE YIELD: what share of REAL
Facebook and LinkedIn pages answer a signed-out reader rather than a sign-in
wall. This container has no DNS, so no live page could be read. Everything above
is the platform's own behaviour — the extraction, the ownership gate, and the
three failures kept apart. The hit rate has to be measured on a deployment with
network access, against a real list.`);
process.exit(broken ? 1 : 0);
