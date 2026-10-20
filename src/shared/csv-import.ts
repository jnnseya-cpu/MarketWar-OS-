// TURNING SOMEBODY ELSE'S SPREADSHEET INTO PROSPECTS.
//
// WHY THIS IS ITS OWN FILE. It lived inside `dashboard/customers/page.tsx`, a
// client component, which meant nothing could import it and nothing ever tested
// it. A 362-line list of UK venues went in and the vault then answered "No rows
// to enrich — every prospect already has an email, or the rows have no company
// name to search." Neither was true. The parser had put all 362 names in `name`
// and left `company` empty, and enrichment only searches companies. The single
// most ordinary prospecting import there is — one column of business names —
// produced a vault that could do nothing at all.
//
// A parser this central with no test is how that ships. So it is pure, it is
// here, and every rule below is driven by the real file that failed.

import { isSocialProfileUrl } from "@/shared/social-profile";

export type ParsedContact = {
  email: string; name: string; phone: string; company: string;
  totalSpendGbp: string; orderCount: string; lastOrderDaysAgo: string;
  consent?: boolean; trade?: string; town?: string; area?: string;
  status?: string; score?: string;
  /**
   * THE DOMAIN THE FILE ALREADY STATED, which this parser used to throw away.
   *
   * There was no website column here at all — not mapped, not detected, not
   * carried. Every bought list has one, and discarding it has a price in two
   * currencies: the row loses the one input the free crawl needs, and the
   * platform then PAYS for a live search to rediscover a domain the customer
   * had already handed over. A column the customer supplied is better evidence
   * than a search result and costs nothing.
   */
  website?: string;
  /**
   * THE COMPANY'S FACEBOOK OR LINKEDIN PAGE.
   *
   * This is the column a list bought off either network actually comes with,
   * and `backend/social-website.ts` turns it into the company's own site for
   * free. That module existed before this field did, with NOTHING anywhere in
   * the platform able to supply it an input — written, tested, and unreachable.
   * Recognising the column is what connects the two.
   */
  socialUrl?: string;
};

export type ParseResult = {
  rows: ParsedContact[];
  /** Section headings skipped in a single-column list. Reported, never silent. */
  headingsSkipped: string[];
  /** What the single column was taken to be, when there was only one. */
  note: string;
};

/**
 * Extract the first email-looking token from any text — strips trailing quotes,
 * commas and whitespace, and handles multi-email cells like "a@x.com,b@x.com".
 */
export function firstEmail(s: string): string {
  const m = (s || "").match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : "";
}

export function firstPhone(s: string): string {
  const t = (s || "").replace(/[^\d+]/g, "");
  return t.replace(/^\+/, "").length >= 7 ? (s.trim()) : "";
}

/**
 * DECODE THE BYTES THE CUSTOMER ACTUALLY SENT.
 *
 * `File.text()` always decodes as UTF-8. Excel on Windows saves CSV as
 * Windows-1252 by default, which is most of the CSVs in the world — and the
 * venue file proved it: `An Se\xf2mar` and `Sneaky Pete\x92s` arrived as
 * "An Se?mar" and "Sneaky Pete?s", with the replacement character stored in the
 * vault for ever. A prospecting tool that corrupts a prospect's name is
 * worse than useless; the first email it sends spells the business wrong.
 *
 * UTF-8 is tried FIRST and strictly, so a genuine UTF-8 file is never mangled
 * by a fallback. Only when it does not decode is Windows-1252 used — which is a
 * superset of Latin-1 and cannot itself fail, every byte having a character.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return fixC1(new TextDecoder("windows-1252").decode(buf));
  }
}

/**
 * THE 32 BYTES THIS RUNTIME GETS WRONG, AND THEY ARE THE COMMON ONES.
 *
 * `new TextDecoder("windows-1252")` REPORTS `encoding === "windows-1252"` and
 * then decodes 0x80–0x9F as raw C1 control characters — 0x92 arrives as U+0092
 * instead of U+2019 — which is ISO-8859-1 behaviour, not what the Encoding
 * Standard specifies. Measured on this runtime, not assumed: the venue fixture
 * holds "Sneaky Pete" + 0x92 + "s", and the decoded string contained an
 * INVISIBLE control character where the apostrophe belongs.
 *
 * WHY IT MATTERS MORE THAN A WRONG GLYPH. That range is exactly what Excel
 * writes: curly quotes, en and em dashes, the ellipsis, the bullet. So a control
 * character was being stored in a prospect's business name and then put into an
 * email greeting, a subject line and a JSON payload. A control character in a
 * header is a hard send failure, and in a greeting it reads as a broken sender —
 * from a file that was perfectly well formed.
 *
 * The 0x81/0x8D/0x8F/0x90/0x9D slots are genuinely unassigned in windows-1252,
 * so those keep the character they decoded to rather than being invented.
 */
const C1_TO_CP1252 = "€\u0081‚ƒ„…†‡"
  + "ˆ‰Š‹Œ\u008DŽ\u008F"
  + "\u0090‘’“”•–—"
  + "˜™š›œ\u009DžŸ";

export function fixC1(s: string): string {
  return String(s ?? "").replace(/[\u0080-\u009F]/g, (ch) => C1_TO_CP1252[ch.charCodeAt(0) - 0x80] ?? ch);
}

/**
 * Is this text a personal name rather than an organisation?
 *
 * WHY IT MATTERS, AND WHY IT IS CONSERVATIVE. Enrichment costs a paid search per
 * row. Searching "Amara Okafor" with no company attached can never find an
 * address and spends the credit anyway, so a lone personal name must not be
 * enriched. Searching "Wembley Stadium" is exactly what the feature is for.
 *
 * It answers TRUE only for the narrow, confident case — two or three plain
 * capitalised words with nothing organisational in them. Everything else is
 * treated as an organisation, because the cost of the two mistakes is not
 * symmetrical: calling an organisation a person makes the feature do nothing,
 * which is the failure being fixed here.
 */
export function looksLikePersonName(s: string): boolean {
  const t = String(s ?? "").trim();
  if (!t || /[0-9@&/(),.]/.test(t)) return false;
  // A TRAILING POSSESSIVE NAMES A THING BELONGING TO SOMEBODY, WHICH IS A
  // BUSINESS. "Ronnie Scott's" and "Sneaky Pete's" have a perfect personal-name
  // shape and are both venues; a person is never called "Ronnie Scott's". This
  // is the one row-level signal that separates them, and without it the column
  // rule was doing all the work alone.
  if (/['’]s$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  // Any word that names a kind of organisation settles it immediately.
  if (/\b(ltd|limited|plc|llp|inc|group|club|stadium|arena|hall|theatre|theater|centre|center|park|festival|hotel|bar|cafe|pub|company|co|services|studios?|academy|venue|rooms?|house|works|trust|society|college|school|church|gallery|museum|lounge|bank|live)\b/i.test(t)) return false;
  // A CAPITAL INSIDE A SURNAME IS STILL A SURNAME. O'Brien, McDonald and
  // MacLeod each carry one, and the first rule here required every letter after
  // the first to be lower case — so three of the commonest surname shapes in
  // these islands were read as organisations and would each have cost a paid
  // search that could never succeed.
  const WORD = /^(?:[A-Z][a-z'’\-]+|O['’][A-Z][a-z'’\-]+|Ma?c[A-Z][a-z'’\-]+)$/;
  const PARTICLE = /^(?:de|van|der|von|la|le|di|del|dos|da)$/i;
  return words.every((w) => WORD.test(w) || PARTICLE.test(w));
}

/**
 * Detect the delimiter from a sample: tab beats semicolon beats comma when it
 * appears more, which handles tab-separated pastes with commas inside cells.
 */
function detectDelimiter(sample: string): string {
  const n = (re: RegExp) => (sample.match(re) || []).length;
  const tabs = n(/\t/g), semis = n(/;/g), commas = n(/,/g);
  return tabs >= commas && tabs >= semis ? "\t" : semis > commas ? ";" : ",";
}

function makeLineParser(delim: string) {
  return (line: string): string[] => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else { if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ""; } else cur += ch; }
    }
    out.push(cur); return out.map((s) => s.trim());
  };
}

const TRUTHY = new Set(["yes", "true", "1", "y", "subscribed", "opt-in", "opted in", "opted-in", "consented", "oui"]);
// A FILE WHOSE HEADINGS ARE ALL UNKNOWN IS READ AS DATA, heading row and all.
// `looksHeader` needs one of these to fire, and a list exported off LinkedIn or
// Facebook Ads is commonly "Business, Facebook Page, Location" — not one word of
// which was listed, so the headings became a prospect called "Business" and
// every column was then mapped by position. The additions are the headings those
// exports actually use.
const KNOWN_HEADERS = [
  "email", "e-mail", "name", "phone", "mobile", "tel", "company", "organisation", "organization",
  "spend", "revenue", "ltv", "orders", "consent", "opt", "first", "last", "contact",
  "website", "web site", "url", "domain", "homepage", "business",
  "facebook", "linkedin", "social", "profile", "page",
  "town", "city", "trade", "sector", "category", "status", "score",
];

/**
 * A URL CELL, CLASSIFIED BY WHAT IT HOLDS RATHER THAN BY ITS HEADING.
 *
 * WHY CONTENT WINS. "Website" is the heading a bought list puts its Facebook
 * page under, because that is the only link the network gave the broker. Trust
 * the heading and the social URL is stored as the company's own site, where
 * `findWebsite` correctly refuses it as an aggregator and the row dies — the
 * exact failure this whole path exists to end. Trust the content and the same
 * value lands in the field that knows how to follow it.
 *
 * It is the same lesson as `looksLikePersonName`: the venue list proved a column
 * heading is a hint and the cell is the evidence.
 *
 * Returns "" for anything that is not a URL or bare domain, so a cell of prose
 * is never promoted to a website.
 */
export function classifyUrlCell(value: string): { kind: "social" | "website" | ""; url: string } {
  const raw = String(value ?? "").trim().replace(/^<|>$/g, "");
  if (!raw || /\s/.test(raw) || firstEmail(raw)) return { kind: "", url: "" };
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  let host = "";
  try { host = new URL(withScheme).hostname.replace(/^www\./, "").toLowerCase(); } catch { return { kind: "", url: "" }; }
  // A real hostname: at least one dot and a plausible TLD. "Acme Ltd" never
  // reaches here (it has a space), but "Acme" and "N/A" would.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || !/\.[a-z]{2,}$/.test(host)) return { kind: "", url: "" };
  return { kind: isSocialProfileUrl(withScheme) ? "social" : "website", url: withScheme };
}

/**
 * Parse a CSV or a paste. Handles real-world exports:
 *  - auto-detects the delimiter (tab, comma or semicolon),
 *  - works WITH a header row (fuzzy-mapped) OR WITHOUT one,
 *  - finds the email in whatever column it lands in, even mid-cell,
 *  - falls back to phone, company or name so a row is never silently dropped.
 */
export function parseCsvDetailed(text: string): ParseResult {
  // BLANK LINES ARE KEPT UNTIL THE HEADINGS ARE FOUND. Dropping them first is
  // what made a section title indistinguishable from a venue: in the file that
  // failed, "Indoor arenas", "Exhibition and conference venues", "Indoor
  // theatres and halls" and "Smaller venues" each sit alone after an empty line,
  // and each became a prospect the platform would have tried to sell to.
  const all = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = all.filter((l) => l.trim().length);
  if (!lines.length) return { rows: [], headingsSkipped: [], note: "The file had no rows." };

  const delim = detectDelimiter(lines.slice(0, 20).join("\n"));
  const parseLine = makeLineParser(delim);
  const first = parseLine(lines[0]);
  const firstHasEmail = first.some((c) => firstEmail(c));
  // A HEADING IS A WORD, AND IT IS NOT A URL.
  //
  // THE DEFECT THIS FIXES, AND IT WAS MINE. Widening `KNOWN_HEADERS` to cover
  // the headings bought lists actually use ("business", "facebook", "trade")
  // made a DATA row match: "Quiet Trades Ltd,https://facebook.com/quiettrades"
  // contains "trade" by substring and "facebook" inside the URL, so a headerless
  // export was read as a heading row and its first company was consumed as
  // column names — one row silently gone. A row quietly discarded by the
  // importer is the worst class of bug this file can have.
  //
  // Two rules, both narrow: match whole WORDS so "Trades" is not "trade", and
  // never look at a cell that is itself data — a URL, an address, a number.
  const headerish = (cell: string): boolean => {
    const c = String(cell ?? "").trim();
    if (!c || firstEmail(c) || classifyUrlCell(c).kind) return false;
    const n = c.toLowerCase().replace(/[_\-./\\]+/g, " ").replace(/\s+/g, " ").trim();
    return KNOWN_HEADERS.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n));
  };
  const looksHeader = !firstHasEmail && first.some(headerish);

  // ---- Header path: map columns by name ----
  if (looksHeader) {
    const headers = first.map((h) => h.toLowerCase());
    const find = (...names: string[]) => headers.findIndex((h) => names.some((x) => h === x || h.includes(x)));
    const iEmail = find("email", "e-mail");
    const iFirst = headers.findIndex((h) => ["first name", "firstname", "first", "given name"].includes(h));
    const iLast = headers.findIndex((h) => ["last name", "lastname", "surname", "family name"].includes(h));
    const iPhone = find("phone", "mobile", "tel", "cell");
    // "BUSINESS NAME" IS A COMPANY COLUMN, and it is the commonest heading on a
    // bought B2B list. It matched none of the company synonyms, while matching
    // "name" — so every business name on such a file was filed as a PERSON's
    // name with the company column left empty. That is the venue-list defect in
    // a different costume: enrichment searches `company || name`, so the rows
    // survived, but the vault then held 2,000 businesses recorded as people,
    // and every screen, export and salutation that reads `name` as a human got
    // "Dear Quiet Trades Ltd".
    const iCompany = find("company", "organisation", "organization", "account",
      "business", "business name", "trading name", "firm", "practice", "venue", "employer", "client");
    // THE COMPANY COLUMN IS NEVER ALSO THE NAME COLUMN. "Business Name" matches
    // both lists by substring, and a row carrying the same text in `name` and
    // `company` is a row that claims a person and a company with one value.
    const iName = headers.findIndex((h, idx) =>
      idx !== iCompany && ["full name", "name", "contact"].some((x) => h === x || h.includes(x)));
    const iSpend = find("spend", "revenue", "ltv", "total value", "value", "amount"), iOrders = find("orders", "order count", "purchases", "transactions");
    const iRecency = find("last order days", "days since", "recency", "days ago"), iConsent = find("consent", "opt-in", "optin", "subscribed", "marketing");
    const iTrade = find("trade", "sector", "category"), iTown = find("town", "city"), iArea = find("area", "region", "postcode area");
    const iStatus = find("status", "stage"), iScore = find("score", "rating");
    // THE SOCIAL HEADING IS LOOKED FOR FIRST AND EXCLUDED FROM THE WEBSITE ONE.
    // `find` matches on `includes`, so "facebook url" and "linkedin page" both
    // satisfy "url" and "page" — and a website column claimed by the Facebook
    // heading is how the social link ends up in the field that refuses it.
    const iSocial = headers.findIndex((h) => /facebook|linkedin|\bfb\b|social|instagram/.test(h));
    const iWebsite = headers.findIndex((h, idx) =>
      idx !== iSocial && /website|web site|^web$|url|^site$|domain|homepage/.test(h));
    const g = (c: string[], i: number) => (i >= 0 && i < c.length ? c[i] : "");
    const rows: ParsedContact[] = [];
    for (let r = 1; r < lines.length; r++) {
      const c = parseLine(lines[r]);
      let name = g(c, iName);
      if (!name && (iFirst >= 0 || iLast >= 0)) name = [g(c, iFirst), g(c, iLast)].filter(Boolean).join(" ");
      // EACH URL CELL GOES WHERE ITS CONTENT BELONGS, not where its heading
      // says. A "Website" column holding facebook.com/acme is the ordinary
      // shape of a list bought off Facebook, and the two fields are read by
      // different code for different reasons.
      let website = "", socialUrl = "";
      for (const cell of [g(c, iWebsite), g(c, iSocial)]) {
        const v = classifyUrlCell(cell);
        if (v.kind === "social" && !socialUrl) socialUrl = v.url;
        else if (v.kind === "website" && !website) website = v.url;
      }
      rows.push({
        email: firstEmail(g(c, iEmail)) || (iEmail < 0 ? firstEmail(c.join(" ")) : ""),
        name, phone: g(c, iPhone), company: g(c, iCompany),
        totalSpendGbp: g(c, iSpend), orderCount: g(c, iOrders), lastOrderDaysAgo: g(c, iRecency),
        consent: iConsent >= 0 ? TRUTHY.has(g(c, iConsent).toLowerCase()) : undefined,
        trade: g(c, iTrade) || undefined, town: g(c, iTown) || undefined, area: g(c, iArea) || undefined,
        status: g(c, iStatus) || undefined, score: g(c, iScore) || undefined,
        website: website || undefined, socialUrl: socialUrl || undefined,
      });
    }
    // A "NAME" COLUMN FULL OF BUSINESSES IS A COMPANY COLUMN — THE COLUMN
    // DECIDES, NOT THE ROW. This is the same rule the single-column path below
    // argues for at length, and the reason is identical: a file headed only
    // "Name" is one kind of thing, and judging row by row filed 22% of a real
    // venue list as people. It applies only when the file has NO company column
    // of its own, so a list with both keeps both exactly as supplied.
    if (iCompany < 0 && iName >= 0) {
      const named = rows.filter((r) => r.name);
      const orgLike = named.filter((r) => !looksLikePersonName(r.name)).length;
      if (named.length > 0 && orgLike * 2 >= named.length) {
        for (const r of rows) if (r.name && !r.company) { r.company = r.name; r.name = ""; }
      }
    }

    // THE KEEP RULE IS UNCHANGED ON PURPOSE. A row whose only content is a URL
    // is not kept, because `contactId` keys on email, phone, name or company —
    // every such row would collapse onto one id and overwrite the last. Parsing
    // a row the store then drops is the same boundary fault this section fixes.
    const kept = rows.filter((r) => r.email || r.phone || r.name || r.company);
    return {
      rows: kept,
      headingsSkipped: [],
      note: `Mapped ${rows.length} row(s) from the header row.${linkNote(kept)}`,
    };
  }

  // ---- Headerless ----
  const parsed = lines.map(parseLine);
  const colCount = Math.max(...parsed.map((c) => c.length));

  // ---- ONE COLUMN: A LIST OF ORGANISATIONS, WHICH IS THE WHOLE POINT --------
  //
  // THE DEFECT THIS FIXES. A single text column was assigned to `name` and
  // `company` was left empty, because the old code took the first text cell as a
  // person and the second as their employer. With one column there is no second
  // cell, so every row was a nameless company — and enrichment, which searches
  // `company || website`, had nothing to search and reported that the rows "have
  // no company name", which was true and was its own doing.
  //
  // A LONE PERSONAL NAME IS NOT ENRICHABLE AND A LONE ORGANISATION IS. You
  // cannot find an address from "Amara Okafor" with nothing else; you can from
  // "Wembley Stadium". So the mapping that can ever do anything is `company`,
  // and that is the one to choose — with the narrow, confident personal-name
  // case still going to `name`, because inventing a company from a person is its
  // own kind of wrong.
  if (colCount === 1) {
    const headings = new Set<string>();
    // A single-column line that sits alone after a blank line is a section
    // heading, not a prospect. Derived from the blank lines kept above.
    for (let i = 0; i < all.length; i++) {
      const v = all[i].trim();
      if (!v) continue;
      const prevBlank = i > 0 && !all[i - 1].trim();
      if (prevBlank && !firstEmail(v) && !firstPhone(v) && v.split(/\s+/).length <= 6) headings.add(v);
    }
    const values: string[] = [];
    const skipped: string[] = [];
    for (const c of parsed) {
      const v = (c[0] || "").trim();
      if (!v) continue;
      if (headings.has(v)) { skipped.push(v); continue; }
      values.push(v);
    }

    // THE COLUMN DECIDES, NOT THE ROW — and judging row by row was wrong by 22%
    // on the very file that exposed this. "Villa Park" and "Hyde Park" carry an
    // organisational word and classify correctly; "Elland Road", "Old Trafford",
    // "Bramall Lane", "Clapham Common" and "Tobacco Dock" are two plain
    // capitalised words and are indistinguishable from a person by any rule
    // written about one row. Seventy-nine of 354 venues would have been filed as
    // people and never enriched, which is the same dead end in a smaller size.
    //
    // A single column is ONE KIND OF THING. Nobody exports a list that is 78%
    // venues and 22% staff. So the share of rows carrying an unmistakable
    // organisational signal decides the whole column, and the ambiguous rows
    // follow the majority instead of each being guessed at separately.
    const textual = values.filter((v) => !firstEmail(v) && !(firstPhone(v) && !/[A-Za-z]{3}/.test(v)));
    const orgLike = textual.filter((v) => !looksLikePersonName(v)).length;
    const columnIsOrganisations = textual.length > 0 && orgLike * 2 >= textual.length;

    const rows: ParsedContact[] = [];
    let people = 0;
    for (const v of values) {
      const email = firstEmail(v);
      if (email) { rows.push(blank({ email })); continue; }
      const phone = firstPhone(v);
      if (phone && !/[A-Za-z]{3}/.test(v)) { rows.push(blank({ phone })); continue; }
      if (columnIsOrganisations) { rows.push(blank({ company: v })); continue; }
      people++;
      rows.push(blank({ name: v }));
    }
    const orgs = rows.length - people;
    return {
      rows, headingsSkipped: skipped,
      note: columnIsOrganisations
        ? `One column of business names — ${orgs} of them${skipped.length ? `, skipping ${skipped.length} section heading(s): ${skipped.join(", ")}` : ""}. ${orgLike} carried an unmistakable business signal, so the whole column was read that way. Business names are what Find emails searches.`
        : `One column of person names — ${people} of them. A personal name with no company cannot be searched for an email, so Find emails will have nothing to do with these. Add a company column and import again.`,
    };
  }

  // ---- Several columns: detect the email column by content ----
  let emailCol = -1, best = 0;
  for (let ci = 0; ci < colCount; ci++) {
    let hits = 0;
    for (const c of parsed) if (c[ci] && firstEmail(c[ci])) hits++;
    if (hits > best) { best = hits; emailCol = ci; }
  }
  const rows: ParsedContact[] = [];
  for (const c of parsed) {
    const email = emailCol >= 0 && firstEmail(c[emailCol] || "") ? firstEmail(c[emailCol]) : firstEmail(c.join(" "));
    const others = c.map((s) => s.trim()).filter((s, i) => s && i !== emailCol && !firstEmail(s));
    const phone = c.map((s) => firstPhone(s)).find(Boolean) || "";
    // URL CELLS ARE PULLED OUT BEFORE ANYTHING IS READ AS A NAME. With no
    // header row the first text cell became the company, so a headerless
    // "Acme Plumbing, facebook.com/acmeplumbing, Leeds" export produced a
    // company called facebook.com/acmeplumbing on half its rows — searched for
    // by name, found as nothing, and the link that would have answered the row
    // consumed as the thing to search for.
    let website = "", socialUrl = "";
    for (const s of others) {
      const v = classifyUrlCell(s);
      if (v.kind === "social" && !socialUrl) socialUrl = v.url;
      else if (v.kind === "website" && !website) website = v.url;
    }
    const textOthers = others.filter((s) => !firstPhone(s) && !classifyUrlCell(s).kind);
    // THE SAME RULE, APPLIED PER CELL rather than by position. Two text cells
    // used to mean "person, then company" whatever they contained, so a
    // "Venue, Town" export produced a person called Wembley Stadium.
    const a = textOthers[0] || "", b = textOthers[1] || "";
    const aIsPerson = looksLikePersonName(a);
    rows.push({
      email,
      name: aIsPerson ? a : (looksLikePersonName(b) ? b : ""),
      phone,
      company: aIsPerson ? b : a,
      totalSpendGbp: "", orderCount: "", lastOrderDaysAgo: "", consent: undefined,
      website: website || undefined, socialUrl: socialUrl || undefined,
    });
  }
  const keptRows = rows.filter((r) => r.email || r.phone || r.name || r.company);
  return {
    rows: keptRows,
    headingsSkipped: [],
    note: `Read ${rows.length} row(s) across ${colCount} columns.${linkNote(keptRows)}`,
  };
}

/**
 * Say what links the file supplied, because the money difference is large and
 * invisible otherwise: a row that arrives with a domain costs no search at all,
 * and a row that arrives with a Facebook page is followed for free.
 */
function linkNote(rows: ParsedContact[]): string {
  const sites = rows.filter((r) => r.website).length;
  const social = rows.filter((r) => r.socialUrl).length;
  if (!sites && !social) return "";
  const parts: string[] = [];
  if (sites) parts.push(`${sites} already state a website, so no search is spent finding one`);
  if (social) parts.push(`${social} carry a Facebook or LinkedIn page, which is read for the company's own site for free`);
  return ` ${parts.join("; ")}.`;
}

function blank(patch: Partial<ParsedContact>): ParsedContact {
  return {
    email: "", name: "", phone: "", company: "",
    totalSpendGbp: "", orderCount: "", lastOrderDaysAgo: "", consent: undefined,
    ...patch,
  };
}

/** The rows only, for callers that do not need the commentary. */
export const parseCsv = (text: string): ParsedContact[] => parseCsvDetailed(text).rows;
