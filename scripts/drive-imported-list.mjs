// npm run drive:import
//
// THE £70 LIST, FROM THE FILE TO THE EMAIL — every boundary driven, none assumed.
//
// WHAT THIS EXISTS TO CATCH, because it already happened twice. A value that is
// read on one side of a boundary and never carried across is this repository's
// commonest defect, and the social-website work shipped with the worst possible
// version of it: `backend/social-website.ts` was written, tested and driven, and
// `EnrichInput.socialUrl` — its only input — had NO PRODUCER ANYWHERE. The
// vault's CSV parser had no website column either, so a bought list arrived with
// a name and nothing else and the platform paid for a search to rediscover a
// domain the file had already stated.
//
// Neither defect is visible in a unit test of either side. Both sides pass; the
// chain does nothing. So this walks the REAL chain:
//
//   CSV text → parseCsvDetailed → saveContacts → listContacts
//            → the enrich route's own input mapping → scrapeEnrich
//            → social follow → the company's own site → a published address
//
// WHAT IS STOOD IN FOR, STATED PLAINLY. This container has no DNS and cannot
// reach facebook.com, linkedin.com, google.serper.dev or any customer's website,
// so a local HTTP server plays all four and `fetch` is intercepted ONLY to
// rewrite the host — what arrives at the stand-in is byte-for-byte what the real
// host would receive. NOT exercised: Facebook's real markup, its real wall rate,
// Serper's real results, any real company's real site. What IS real: the parser,
// the store and its merge rules, the route's mapping, the aggregator refusal, the
// social follow, the ownership gate, the crawl, the address extraction, and
// whether a search is spent at all.
//
// THE MONEY CHECK IS THE POINT OF STEP 5. The stand-in counts search calls, so
// "a row that arrived with a link costs no search" is PROVEN by the count rather
// than inferred from a missing key.

import http from "node:http";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------------------
// The stand-ins: a Facebook page, a LinkedIn wall, two company sites, Serper.
// ---------------------------------------------------------------------------
let searchCalls = 0;
const fetched = [];

const FB_PAGE = `<!doctype html><html><head><title>Quiet Trades Ltd | Facebook</title></head><body>
<div id="content">${"Plumbing and heating across Greater Manchester. ".repeat(60)}</div>
<div class="about">
  <a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fquiettrades.co.uk%2F&amp;h=AT0abc">quiettrades.co.uk</a>
  <a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.bookmyjob.io%2Fquiet-trades&amp;h=AT1def">Book online</a>
</div>
<div class="footer">${"Open Monday to Friday. ".repeat(40)}</div></body></html>`;

const LI_WALL = `<!doctype html><html><body><p>Sign in to see who Hillcrest Joinery Ltd knows</p>
<p>Join LinkedIn to view this page</p></body></html>`;

const SITE_QT = `<!doctype html><html><body><h1>Quiet Trades Ltd</h1>
<p>Call 0161 496 1111 or email <a href="mailto:info@quiettrades.co.uk">info@quiettrades.co.uk</a></p>
<p>Site by <a href="https://brightpixel.agency">Bright Pixel</a> — hello@brightpixel.agency</p></body></html>`;

const SITE_MW = `<!doctype html><html><body><h1>Marsh &amp; Weld Fabrication Ltd</h1>
<p>Enquiries: <a href="mailto:enquiries@marshweld.co.uk">enquiries@marshweld.co.uk</a></p></body></html>`;

const server = http.createServer((req, res) => {
  const host = String(req.headers["x-stand-in-host"] || "");
  const url = `${host}${req.url}`;
  fetched.push(url);
  const html = (body) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(body); };
  const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };

  if (host === "google.serper.dev") { searchCalls++; return json({ organic: [] }); }
  if (host === "www.facebook.com" || host === "facebook.com") {
    if (req.url.startsWith("/quiettrades")) return html(FB_PAGE);
    return html(`<html><body><p>You must log in to continue</p></body></html>`);
  }
  if (host === "www.linkedin.com" || host === "linkedin.com") return html(LI_WALL);
  if (host === "quiettrades.co.uk" || host === "www.quiettrades.co.uk") return html(SITE_QT);
  if (host === "marshweld.co.uk" || host === "www.marshweld.co.uk") return html(SITE_MW);
  res.writeHead(404, { "content-type": "text/html" }); res.end("<html><body>not here</body></html>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

// EVERY outbound request is rewritten to the stand-in, with the real host passed
// in a header so the stand-in can answer as that host. Nothing leaves the box,
// and the path, method, headers and body are the ones the real host would see.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const raw = typeof input === "string" ? input : input?.url ? input.url : String(input);
  let u;
  try { u = new URL(raw); } catch { return realFetch(input, init); }
  if (u.protocol !== "http:" && u.protocol !== "https:") return realFetch(input, init);
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(input, init);
  const headers = new Headers(init?.headers || (typeof input === "object" && input?.headers) || {});
  headers.set("x-stand-in-host", u.hostname);
  const target = `http://127.0.0.1:${PORT}${u.pathname}${u.search}`;
  return realFetch(target, { ...(init || {}), headers });
};

process.env.SERPER_API_KEY = "stand-in-key-not-a-real-credential";
process.env.LEADMAGIC_API_KEY = "stand-in-key-not-a-real-credential";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p) => join(root, p);
const { NextRequest } = await import("next/server");
const { parseCsvDetailed } = await import(R("src/shared/csv-import.ts"));
const { saveContacts, listContacts, clearContacts, patchContact } = await import(R("src/backend/contacts.ts"));
const contactsRoute = await import(R("src/app/api/contacts/route.ts"));
const { explainEnrichment } = await import(R("src/backend/enrichment-explain.ts"));

const BRAND = `drive-import-${Date.now()}`;

// ---------------------------------------------------------------------------
say("");
say("1. THE FILE — a list in the shape the networks actually hand over.");
say("   Four rows: a Facebook page in its own column; a Facebook page filed");
say("   under \"Website\"; a real domain; and a LinkedIn page that walls us.");

const CSV = [
  "Business Name,Website,Facebook Page,Town",
  "Quiet Trades Ltd,,https://www.facebook.com/quiettrades,Manchester",
  "Hillcrest Joinery Ltd,https://www.linkedin.com/company/hillcrest-joinery,,Leeds",
  "Marsh & Weld Fabrication Ltd,marshweld.co.uk,,Sheffield",
  "Pennine Groundworks Ltd,,,Huddersfield",
].join("\n");

const parsed = parseCsvDetailed(CSV);
const byName = (n) => parsed.rows.find((r) => r.company === n) || {};

check("the header row was recognised", parsed.rows.length === 4, `${parsed.rows.length} row(s)`);
check("a Facebook page in its own column lands in socialUrl",
  byName("Quiet Trades Ltd").socialUrl === "https://www.facebook.com/quiettrades",
  byName("Quiet Trades Ltd").socialUrl || "(nothing)");
check("…and is NOT stored as the company's own website",
  !byName("Quiet Trades Ltd").website, byName("Quiet Trades Ltd").website || "(empty, correct)");
check("a social URL filed under \"Website\" is routed by CONTENT, not by heading",
  byName("Hillcrest Joinery Ltd").socialUrl === "https://www.linkedin.com/company/hillcrest-joinery"
  && !byName("Hillcrest Joinery Ltd").website,
  `social=${byName("Hillcrest Joinery Ltd").socialUrl || "(none)"} website=${byName("Hillcrest Joinery Ltd").website || "(none)"}`);
check("a bare domain is kept, with a scheme added",
  byName("Marsh & Weld Fabrication Ltd").website === "https://marshweld.co.uk",
  byName("Marsh & Weld Fabrication Ltd").website || "(nothing)");
check("a row with neither link carries neither",
  !byName("Pennine Groundworks Ltd").website && !byName("Pennine Groundworks Ltd").socialUrl);
check("the parser SAYS what the file supplied, rather than silently using it",
  /already state a website/.test(parsed.note) && /Facebook or LinkedIn/.test(parsed.note), parsed.note);
check("the town column still maps — nothing regressed",
  byName("Quiet Trades Ltd").town === "Manchester", byName("Quiet Trades Ltd").town || "(nothing)");

// ---------------------------------------------------------------------------
say("");
say("2. A HEADERLESS EXPORT — the same file with its heading row missing.");
say("   A URL cell must never be read as the company's name.");

const HEADERLESS = [
  "Quiet Trades Ltd,https://www.facebook.com/quiettrades,Manchester",
  "Marsh & Weld Fabrication Ltd,marshweld.co.uk,Sheffield",
].join("\n");
const bare = parseCsvDetailed(HEADERLESS);
const bq = bare.rows.find((r) => /Quiet Trades/.test(r.company || "")) || {};
check("the company name is the company, not the link",
  bq.company === "Quiet Trades Ltd", bq.company || "(nothing)");
check("the link is still captured, as a social page",
  bq.socialUrl === "https://www.facebook.com/quiettrades", bq.socialUrl || "(nothing)");

// ---------------------------------------------------------------------------
say("");
say("3. THE STORE — the links survive the vault, and a RE-IMPORT does not wipe");
say("   a website the platform paid to discover. This is the trap the groups");
say("   field was already burned by: an explicitly-undefined key wins a spread.");

await clearContacts(BRAND);
await saveContacts(BRAND, parsed.rows, new Date().toISOString());
let stored = await listContacts(BRAND);
const sBy = (n) => stored.find((c) => c.company === n) || {};
check("socialUrl persisted through the store",
  sBy("Quiet Trades Ltd").socialUrl === "https://www.facebook.com/quiettrades",
  sBy("Quiet Trades Ltd").socialUrl || "(dropped)");
check("website persisted through the store",
  sBy("Marsh & Weld Fabrication Ltd").website === "https://marshweld.co.uk",
  sBy("Marsh & Weld Fabrication Ltd").website || "(dropped)");

// Enrichment discovers a website for the row that had none, exactly as the
// vault does, and then the ORIGINAL file is imported again.
await patchContact(BRAND, sBy("Pennine Groundworks Ltd").id, { website: "https://pennine-groundworks.co.uk" });
await saveContacts(BRAND, parsed.rows, new Date().toISOString());
stored = await listContacts(BRAND);
check("a re-import of the original file does NOT wipe the discovered website",
  sBy("Pennine Groundworks Ltd").website === "https://pennine-groundworks.co.uk",
  sBy("Pennine Groundworks Ltd").website || "(WIPED — the defect)");

// ---------------------------------------------------------------------------
say("");
say("4. THE ROUTE'S OWN MAPPING — driven, not read. The route builds the");
say("   enrichment input from the stored row, and that mapping is where the");
say("   social URL was being dropped. The real POST handler runs here.");

searchCalls = 0;
fetched.length = 0;
const req = new NextRequest("http://127.0.0.1/api/contacts", {
  method: "POST",
  headers: { "content-type": "application/json", "x-now": new Date().toISOString() },
  body: JSON.stringify({ action: "enrich", brandId: BRAND, business: "Drive Import", limit: 10 }),
});
const res = await contactsRoute.POST(req);
const out = await res.json();
check("the enrich action ran", res.status === 200, `HTTP ${res.status}${out.error ? ` — ${out.error}` : ""}`);

const rBy = (n) => (out.results || []).find((r) => r.company === n) || {};
check("the Facebook page was followed to the company's own site",
  rBy("Quiet Trades Ltd").website === "https://quiettrades.co.uk",
  rBy("Quiet Trades Ltd").website || "(no website — the social URL never arrived)");
check("and that site's published address was returned",
  rBy("Quiet Trades Ltd").email === "info@quiettrades.co.uk",
  rBy("Quiet Trades Ltd").email || "(nothing)");
check("the web designer's address on the same page was refused",
  rBy("Quiet Trades Ltd").email !== "hello@brightpixel.agency");
check("the booking platform the page also links to was refused",
  rBy("Quiet Trades Ltd").website !== "https://www.bookmyjob.io",
  rBy("Quiet Trades Ltd").website || "");
check("the note says where the website came from",
  /Facebook/i.test(rBy("Quiet Trades Ltd").note || ""), (rBy("Quiet Trades Ltd").note || "").slice(0, 120));
check("the row that arrived with a domain was crawled straight away",
  rBy("Marsh & Weld Fabrication Ltd").email === "enquiries@marshweld.co.uk",
  rBy("Marsh & Weld Fabrication Ltd").email || "(nothing)");
check("a LinkedIn wall is reported as a wall, not as a company with no site",
  /wall|signed out|sign-in|log in/i.test(rBy("Hillcrest Joinery Ltd").note || ""),
  (rBy("Hillcrest Joinery Ltd").note || "").slice(0, 140));

// ---------------------------------------------------------------------------
say("");
say("5. THE MONEY. A search is only ever spent on a row that arrived with no");
say("   link at all. Counted at the stand-in, so this is a measurement.");

// TWO WRONG VERSIONS OF THIS CHECK, BOTH MINE, AND THE CODE RIGHT BOTH TIMES.
// The first expected at most one search and counted the walled row as free — but
// a page that withholds itself told us nothing, so that row is deliberately no
// cheaper than a row with no link, and falling through to the search is the
// designed behaviour. The second then expected two, having forgotten that step 3
// gave the linkless row a website of its own. The rule, stated once:
//
//   Quiet Trades   social page answered  → no search
//   Marsh & Weld   domain in the file    → no search
//   Pennine        domain from step 3    → no search
//   Hillcrest      LinkedIn walled us    → one search, by design
//
// An equality, because "at most" would also pass if the three free rows had
// searched and the walled one had not — which is the failure being measured.
check("only the row whose link was withheld spent a search",
  searchCalls === 1,
  `${searchCalls} search call(s) for 4 rows — three answered from links they arrived with, one was walled`);
check("the Facebook page itself was actually fetched",
  fetched.some((u) => /facebook\.com\/quiettrades/.test(u)), fetched.filter((u) => /facebook/.test(u)).join(" ") || "(never fetched)");
check("the company's own site was actually fetched",
  fetched.some((u) => /quiettrades\.co\.uk/.test(u)));

// ---------------------------------------------------------------------------
say("");
say("6. THE DIAGNOSTIC. One row, one URL, free — the surface somebody uses");
say("   when a list finds nothing, which could not take a social URL at all.");

searchCalls = 0;
const ex = await explainEnrichment("Quiet Trades Ltd", 0, "https://www.facebook.com/quiettrades");
const step = (s) => ex.steps.find((x) => x.stage === s) || {};
check("a 'social page' step is reported", Boolean(step("social page").stage), ex.steps.map((s) => s.stage).join(" → "));
check("…and it succeeded", step("social page").ok === true, step("social page").detail || "");
check("the website it found is carried into the result",
  ex.website === "https://quiettrades.co.uk", ex.website || "(nothing)");
check("the address was found with no key and no credit",
  ex.email === "info@quiettrades.co.uk", ex.email || "(nothing)");
check("the search key step says it was not needed rather than probing it",
  /Not needed/.test(step("search key").detail || ""), step("search key").detail || "");
check("no search credit was spent by the diagnostic", searchCalls === 0, `${searchCalls} call(s)`);
check("the LeadMagic key is reported, so a key that is set is visible",
  ex.keys.leadmagic === true, JSON.stringify(ex.keys));

const walled = await explainEnrichment("Hillcrest Joinery Ltd", 0, "https://www.linkedin.com/company/hillcrest-joinery");
const wStep = walled.steps.find((x) => x.stage === "social page") || {};
check("a walled page is reported as a wall and not as a missing website",
  wStep.ok === false && /signed out|wall|sign-in/i.test(wStep.detail || ""), (wStep.detail || "").slice(0, 160));
check("…and the remedy is ours, not 'this company has no site'",
  /SCRAPER_API_URL|website column/.test(wStep.fix || ""), (wStep.fix || "").slice(0, 160));

// ---------------------------------------------------------------------------
await clearContacts(BRAND);
server.close();
say("");
say(`RESULT: ${proven} proven, ${broken} broken.`);
say("");
say("NOT PROVEN HERE, and nobody should read it as proven: Facebook's and");
say("LinkedIn's real markup and their real wall rate, Serper's real results, and");
say("what share of real small businesses publish an address. Those need the live");
say("hosts. What is proven is that every value the file supplies now reaches the");
say("code that can use it, and that a row arriving with a link costs no search.");
process.exit(broken ? 1 : 0);
