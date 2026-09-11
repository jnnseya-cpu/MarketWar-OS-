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

export type ParsedContact = {
  email: string; name: string; phone: string; company: string;
  totalSpendGbp: string; orderCount: string; lastOrderDaysAgo: string;
  consent?: boolean; trade?: string; town?: string; area?: string;
  status?: string; score?: string;
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
    return new TextDecoder("windows-1252").decode(buf);
  }
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
const KNOWN_HEADERS = ["email", "e-mail", "name", "phone", "mobile", "tel", "company", "organisation", "organization", "spend", "revenue", "ltv", "orders", "consent", "opt", "first", "last", "contact"];

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
  const looksHeader = !firstHasEmail && first.some((c) => KNOWN_HEADERS.some((k) => c.toLowerCase().includes(k)));

  // ---- Header path: map columns by name ----
  if (looksHeader) {
    const headers = first.map((h) => h.toLowerCase());
    const find = (...names: string[]) => headers.findIndex((h) => names.some((x) => h === x || h.includes(x)));
    const iEmail = find("email", "e-mail"), iName = find("full name", "name", "contact");
    const iFirst = headers.findIndex((h) => ["first name", "firstname", "first", "given name"].includes(h));
    const iLast = headers.findIndex((h) => ["last name", "lastname", "surname", "family name"].includes(h));
    const iPhone = find("phone", "mobile", "tel", "cell"), iCompany = find("company", "organisation", "organization", "account");
    const iSpend = find("spend", "revenue", "ltv", "total value", "value", "amount"), iOrders = find("orders", "order count", "purchases", "transactions");
    const iRecency = find("last order days", "days since", "recency", "days ago"), iConsent = find("consent", "opt-in", "optin", "subscribed", "marketing");
    const iTrade = find("trade", "sector", "category"), iTown = find("town", "city"), iArea = find("area", "region", "postcode area");
    const iStatus = find("status", "stage"), iScore = find("score", "rating");
    const g = (c: string[], i: number) => (i >= 0 && i < c.length ? c[i] : "");
    const rows: ParsedContact[] = [];
    for (let r = 1; r < lines.length; r++) {
      const c = parseLine(lines[r]);
      let name = g(c, iName);
      if (!name && (iFirst >= 0 || iLast >= 0)) name = [g(c, iFirst), g(c, iLast)].filter(Boolean).join(" ");
      rows.push({
        email: firstEmail(g(c, iEmail)) || (iEmail < 0 ? firstEmail(c.join(" ")) : ""),
        name, phone: g(c, iPhone), company: g(c, iCompany),
        totalSpendGbp: g(c, iSpend), orderCount: g(c, iOrders), lastOrderDaysAgo: g(c, iRecency),
        consent: iConsent >= 0 ? TRUTHY.has(g(c, iConsent).toLowerCase()) : undefined,
        trade: g(c, iTrade) || undefined, town: g(c, iTown) || undefined, area: g(c, iArea) || undefined,
        status: g(c, iStatus) || undefined, score: g(c, iScore) || undefined,
      });
    }
    return {
      rows: rows.filter((r) => r.email || r.phone || r.name || r.company),
      headingsSkipped: [],
      note: `Mapped ${rows.length} row(s) from the header row.`,
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
    const textOthers = others.filter((s) => !firstPhone(s));
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
    });
  }
  return {
    rows: rows.filter((r) => r.email || r.phone || r.name || r.company),
    headingsSkipped: [],
    note: `Read ${rows.length} row(s) across ${colCount} columns.`,
  };
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
