import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A FACEBOOK OR LINKEDIN PAGE IS A LEAD TO A WEBSITE, NOT A DEAD END.
//
// THE DEFECT, AND IT COST REAL MONEY. The owner paid £70 for contact emails off
// LinkedIn and Facebook because his own platform produced none. Driven with
// every key deleted, the cause was exact:
//
//   • the free crawl DOES find a published email on a company's own site, with
//     no key and no credit — it needs only the domain;
//   • `findWebsite` refused a social URL as an aggregator, which is right about
//     what the page IS and wrong about what it is WORTH;
//   • so a list bought off those networks died at "needs live Google data",
//     while the page stated the website right there.
//
// Two rules hold this together and both are asserted below:
//   NOTHING IS GUESSED FROM THE HANDLE. facebook.com/acmeplumbing does not mean
//   acmeplumbing.co.uk exists, and a guessed domain that resolves belongs to
//   somebody.
//   A WALL IS REPORTED AS A WALL. "This page names no website" is a statement
//   about the company; "we were not allowed to read it" is a statement about us.
//
// NO NETWORK IN THIS FILE. The extraction is pure and the fetch is injected.
// The end-to-end path is driven in `npm run drive:social`.
//
// MUTATION TESTED: 12 mutants, all killed. ONE SURVIVED FIRST: wrapping the
// enricher's whole social branch in `if (false)` left the source-order assertion
// passing, because `websiteFromSocialPage` was still written and merely
// unreachable. Closed by the behavioural test at the bottom, which runs the real
// `scrapeEnrich` over a stubbed fetch. Fourth presence-style assertion this
// session satisfied by something other than the code it was about.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const shim = (t) => `https://l.facebook.com/l.php?u=${encodeURIComponent(t)}&h=AT0abc`;
const chrome = "<span>page chrome</span>".repeat(200);

test("Facebook's click shim is unwrapped to the URL the page actually names", async () => {
  const { unwrapRedirect } = await import("../src/shared/social-profile.ts");
  assert.equal(unwrapRedirect(shim("https://acme-plumbing.co.uk/")), "https://acme-plumbing.co.uk/");
  assert.equal(
    unwrapRedirect("https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Facme-plumbing.co.uk&urlhash=xyz"),
    "https://acme-plumbing.co.uk",
  );
  // A plain URL passes through untouched, and a malformed one does not throw.
  assert.equal(unwrapRedirect("https://acme-plumbing.co.uk/contact"), "https://acme-plumbing.co.uk/contact");
  assert.equal(unwrapRedirect("not a url"), "not a url");
});

test("a social profile is told apart from a company's own site", async () => {
  const { isSocialProfileUrl, socialNetworkOf } = await import("../src/shared/social-profile.ts");
  for (const [url, network] of [
    ["https://www.facebook.com/acmeplumbing", "facebook"],
    ["https://m.facebook.com/acmeplumbing", "facebook"],
    ["https://www.linkedin.com/company/acme", "linkedin"],
    ["https://lnkd.in/abc", "linkedin"],
    ["https://instagram.com/acme", "instagram"],
  ]) {
    assert.equal(socialNetworkOf(url), network, url);
    assert.equal(isSocialProfileUrl(url), true, url);
  }
  assert.equal(isSocialProfileUrl("https://acme-plumbing.co.uk"), false);
  assert.equal(socialNetworkOf("not a url"), null);
  // A domain that merely CONTAINS a network's name is not that network.
  assert.equal(isSocialProfileUrl("https://facebook-marketing-agency.co.uk"), false);
});

test("structured data outranks a link in the body", async () => {
  const { websiteCandidatesFrom } = await import("../src/shared/social-profile.ts");
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Organization","name":"Acme",
      "sameAs":["https://acme-plumbing.co.uk"],"url":"https://www.linkedin.com/company/acme"}</script>
    </head><body><a href="${shim("https://someoneelse.com/")}">x</a></body></html>`;
  const found = websiteCandidatesFrom(html);
  // ORDER IS EVIDENCE: the company stating its own site beats whatever the page
  // happens to link, because the caller takes the first that passes the gate.
  assert.equal(found[0].url, "https://acme-plumbing.co.uk");
  assert.equal(found[0].from, "json-ld");
  // And the page's own network is never a candidate — that is where we started.
  assert.ok(found.every((c) => !/linkedin\.com|facebook\.com/.test(c.url)));
});

test("a sign-in wall is a different answer from an empty page", async () => {
  const { authWallSigns } = await import("../src/shared/social-profile.ts");
  assert.equal(authWallSigns("<html><body>You must log in to continue.</body></html>").walled, true);
  assert.equal(authWallSigns(`<html><body>Join LinkedIn to see this${chrome}</body></html>`).walled, true);
  // A SHORT BODY IS ITSELF A WALL. A real page runs to tens of thousands of
  // characters; the wall phrases are often inside the JavaScript a wall ships.
  assert.equal(authWallSigns("<html></html>").walled, true);
  const real = `<html><body><h1>Acme</h1>${chrome}<a href="https://acme-plumbing.co.uk">site</a></body></html>`;
  assert.equal(authWallSigns(real).walled, false, "a real page must not be mistaken for a wall");
});

const page = (body) => async () => body;

test("the company's own site is returned and the agency's is refused", async () => {
  const { websiteFromSocialPage } = await import("../src/backend/social-website.ts");
  // THE AGENCY'S LINK FIRST, deliberately: the gate returns on the first
  // candidate that PASSES, so with the company's own domain first the agency is
  // never examined — which my own first driver check mistook for the gate
  // working. This ordering actually exercises the refusal.
  const html = `<html><head><title>Acme Plumbing Ltd</title></head><body>${chrome}
    <a href="${shim("https://brightsparkagency.com/")}">Website by Brightspark</a>
    <a href="${shim("https://acme-plumbing.co.uk/")}">acme-plumbing.co.uk</a></body></html>`;
  const v = await websiteFromSocialPage({ url: "https://www.facebook.com/acmeplumbing", company: "Acme Plumbing Ltd", fetchImpl: page(html) });
  assert.equal(v.outcome, "found");
  assert.equal(v.website, "https://acme-plumbing.co.uk");
  assert.equal(v.costAcu, 0, "it must stay free — that is the entire point of it");
  assert.ok(v.rejected.some((r) => /brightsparkagency/.test(r.url)), "the agency must be examined and refused");
  assert.match(v.rejected[0].why, /cannot be tied to "Acme Plumbing Ltd"/);
});

test("a domain that cannot be tied to the company is never returned", async () => {
  const { websiteFromSocialPage } = await import("../src/backend/social-website.ts");
  const html = `<html><head><title>Northern Boilers</title></head><body>${chrome}
    <a href="${shim("https://bookingplatform.io/northern")}">Book online</a></body></html>`;
  const v = await websiteFromSocialPage({ url: "https://www.facebook.com/northern", company: "Northern Boilers Ltd", fetchImpl: page(html) });
  assert.equal(v.outcome, "rejected");
  assert.equal(v.website, null);
  // The cost of being wrong is the reason the gate exists at all.
  assert.match(v.why, /real stranger's company/);
});

test("nothing is guessed from the handle, and no name means no answer", async () => {
  const { websiteFromSocialPage } = await import("../src/backend/social-website.ts");
  const bare = `<html><head><title>Quiet Trades Ltd</title></head><body>${chrome}<div>Call 0161 496 0000.</div></body></html>`;
  const none = await websiteFromSocialPage({ url: "https://www.facebook.com/quiettrades", company: "Quiet Trades Ltd", fetchImpl: page(bare) });
  assert.equal(none.outcome, "none");
  assert.equal(none.website, null, "the handle `quiettrades` must not become quiettrades.co.uk");
  assert.match(none.why, /not a guessed domain/);

  // WITHOUT THE COMPANY NAME THERE IS NO GATE, so returning the first outbound
  // link would hand back a booking platform or whoever built the site.
  const html = `<html><body>${chrome}<a href="${shim("https://anything.com/")}">x</a></body></html>`;
  const ungated = await websiteFromSocialPage({ url: "https://www.facebook.com/x", company: "", fetchImpl: page(html) });
  assert.equal(ungated.website, null);
  assert.equal(ungated.outcome, "rejected");
  assert.match(ungated.why, /rather than a guess/);
});

test("a wall blames us, and an unanswered request is a third thing again", async () => {
  const { websiteFromSocialPage } = await import("../src/backend/social-website.ts");
  const walled = await websiteFromSocialPage({
    url: "https://www.facebook.com/walled", company: "Walled Co Ltd",
    fetchImpl: page("<html><body>You must log in to continue.</body></html>"),
  });
  assert.equal(walled.outcome, "walled");
  assert.match(walled.why, /says nothing about the company/,
    "reporting a wall as 'no website' would have the customer delete a good lead");
  assert.match(walled.why, /SCRAPER_API_URL/, "and it must name the remedy");
  // IT MUST NOT SUGGEST DEFEATING THE CONTROL. The platform does not offer to
  // sign in as somebody, replay cookies or rotate around a block.
  assert.doesNotMatch(walled.why, /log in as|credential|cookie|rotate|bypass/i);

  const dead = await websiteFromSocialPage({ url: "https://www.facebook.com/x", company: "X Ltd", fetchImpl: page("") });
  assert.equal(dead.outcome, "unfetchable");
  assert.match(dead.why, /not the same as the company having no website/);

  const notSocial = await websiteFromSocialPage({ url: "https://acme-plumbing.co.uk", company: "Acme Plumbing Ltd", fetchImpl: page("") });
  assert.equal(notSocial.outcome, "not-social");
});

test("the enricher follows a social URL BEFORE paying for a search", async () => {
  // This is the wiring that turns the module into the fix. A row whose website
  // column holds a Facebook page used to be refused as an aggregator and then
  // fall through to "needs live Google data".
  const code = codeOf(readFileSync("src/backend/enrich.ts", "utf8"));
  assert.match(code, /import \{ isSocialProfileUrl \} from "@\/shared\/social-profile"/);
  assert.match(code, /socialUrl\?: string;/, "a list with its own social column must be able to say so");
  assert.match(code, /const social = \[input\.socialUrl, input\.website\]/,
    "the website column itself has to be tried — that is where a bought list puts the page");
  // ORDER: the social attempt must precede the paid search call.
  const socialAt = code.indexOf("websiteFromSocialPage");
  const searchAt = code.indexOf("await webSearch(");
  assert.ok(socialAt > 0 && searchAt > socialAt, "a free answer must be tried before a paid one");
  // And the reason a social page failed travels into the note.
  assert.match(code, /socialNote/);
});

test("the note names the real obstacle instead of a key that would not help", async () => {
  // "Set SERPER_API_KEY" is useless advice to somebody whose row had a Facebook
  // link that turned out to be a sign-in wall. The social sentence comes first.
  const code = codeOf(readFileSync("src/backend/enrich.ts", "utf8"));
  assert.match(code, /note: \[socialNote, providerError \|\| "Enrichment needs live Google data/);
  assert.match(code, /\.filter\(Boolean\)\.join\(" "\)/);
});

test("the free pass needs no key, and the ownership gate is reused not rebuilt", async () => {
  const social = codeOf(readFileSync("src/backend/social-website.ts", "utf8"));
  // REUSED: `domainMatchesCompany` is the same rule the email crawl already uses
  // to decide whether an address belongs to a company. A second ownership rule
  // is two rules that disagree the first time either is edited.
  assert.match(social, /import \{ domainMatchesCompany, scraperProxyConfigured \} from "@\/backend\/enrich"/);
  assert.doesNotMatch(social, /function domainMatches/, "it must not grow its own copy");
  // No key is read anywhere in this path.
  assert.doesNotMatch(social, /process\.env\.(SERPER|HUNTER|APOLLO|LEADMAGIC)/);
  assert.match(social, /costAcu: 0/);
});

test("the enricher solves the row IN FACT, not only in source", async () => {
  // SOURCE ASSERTIONS PROVE THE TEXT, and mutation testing is what said so
  // again: wrapping the whole social branch in `if (false)` left the order
  // assertion above passing, because `websiteFromSocialPage` was still written
  // — just unreachable. This runs the real `scrapeEnrich` on the real row the
  // owner actually bought.
  //
  // No network: `fetch` is replaced with a map of pages, so the enricher's own
  // behaviour — which paths it asks for, what it accepts, what it refuses — is
  // the only thing under test.
  const { scrapeEnrich } = await import("../src/backend/enrich.ts");
  for (const k of ["SERPER_API_KEY", "HUNTER_API_KEY", "APOLLO_API_KEY", "LEADMAGIC_API_KEY", "SCRAPER_API_URL"]) {
    delete process.env[k];
  }

  const PAGES = {
    "https://www.facebook.com/acmeplumbing": `<html><head><title>Acme Plumbing Ltd</title></head><body>${chrome}
      <a href="${shim("https://brightsparkagency.com/")}">Website by Brightspark</a>
      <a href="${shim("https://acme-plumbing.co.uk/")}">acme-plumbing.co.uk</a></body></html>`,
    "https://acme-plumbing.co.uk": `<html><body><h1>Acme Plumbing Ltd</h1><a href="/contact">Contact</a></body></html>`,
    "https://acme-plumbing.co.uk/contact": `<html><body><h1>Contact</h1>
      <p>Email <a href="mailto:info@acme-plumbing.co.uk">info@acme-plumbing.co.uk</a></p>
      <p>Site by <a href="mailto:hello@brightsparkagency.com">Brightspark</a></p></body></html>`,
  };
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    asked.push(url);
    const body = PAGES[url.replace(/\/$/, "")] ?? PAGES[url] ?? "";
    return {
      ok: Boolean(body), status: body ? 200 : 404, url,
      headers: { get: (n) => (n.toLowerCase() === "content-type" ? "text/html" : null) },
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      body: null,
    };
  };

  try {
    // THE ROW THAT USED TO DIE: a Facebook page in the website column.
    const r = await scrapeEnrich({
      company: "Acme Plumbing Ltd",
      website: "https://www.facebook.com/acmeplumbing",
      town: "Manchester",
    });
    assert.equal(r.email, "info@acme-plumbing.co.uk", `got ${r.email} (${r.stage}) — ${r.note}`);
    assert.equal(r.website, "https://acme-plumbing.co.uk");
    assert.equal(r.emailConfidence, "high");
    assert.notEqual(r.email, "hello@brightsparkagency.com", "the designer's address must not be taken");
    assert.match(r.note, /Facebook page/, "the note must say where the domain came from");
    // AND IT COST NOTHING: no search provider was reached, because none was needed.
    assert.ok(!asked.some((u) => /serper|google\.com\/search/i.test(u)), asked.join(", "));
    assert.ok(asked.some((u) => /facebook\.com/.test(u)), "the social page has to have actually been read");
  } finally {
    globalThis.fetch = real;
  }
});
