// BULK CATALOGUE IMPORT — reading a brand's whole product range from a file.
//
// The catalogue itself already exists. `backend/promotable.ts` holds the
// products, the three permission modes, the two independent gates and the
// public view, and `saveProduct` has been able to store one product since §101.
// What was missing was the door: a brand with two hundred products had to type
// them in one at a time, which means the open_catalogue mode — the whole point
// of that work — was unreachable for anybody with a real shop.
//
// So this is ENTRY, not a second catalogue. Nothing here stores anything, and
// every row it produces goes through the same `saveProduct` a single manual
// entry does. `productId` hashes the brand and the name together, so importing
// the same file twice UPDATES rather than duplicating; that idempotency comes
// free and is asserted rather than assumed.
//
// ---------------------------------------------------------------------------
// WHY THIS IS MOSTLY ABOUT MONEY, AND WHY IT REFUSES RATHER THAN GUESSES
// ---------------------------------------------------------------------------
//
// Every number in a product row is money, and every one of them decides two
// things a person will act on: what a creator earns on a sale, and whether the
// item is claimable at all (`marginAllows` computes eligibility from exactly
// these figures). A price read wrongly does not raise an error. It produces a
// plausible product with a wrong commission, and nobody finds out until a
// creator is underpaid or a brand has promised margin it does not have.
//
// The trap is real and it is not exotic. A shop export can contain:
//
//     "1,299"   →  one thousand two hundred and ninety-nine   (US/UK thousands)
//     "12,99"   →  twelve and ninety-nine                     (European decimal)
//
// Those are the same three characters and a comma, and they are ONE HUNDRED
// TIMES apart. There is no way to tell them apart from the string alone, and
// picking a house style means being silently wrong on half the world's exports.
//
// So an ambiguous amount is REFUSED, with the reason, and the row does not
// import. That is the same doctrine the rest of this codebase runs on — a
// provider's refusal is read rather than guessed at; an unrecognised failure
// keeps its own words and offers no remedy, because inventing one IS the
// defect. A catalogue that is missing four rows a person can fix is worth far
// more than one where four prices are quietly wrong by 100×.
//
// A file can say which convention it uses, and then nothing is ambiguous —
// that is what `decimal` is for. It is never inferred.

/** A delimiter a real export actually uses. `;` is what a European Excel writes. */
export type Delimiter = "," | "\t" | ";" | "|";

/**
 * How this file writes numbers. NEVER GUESSED.
 *
 * `dot`   — 1,299.00 : comma groups thousands, dot is the decimal point.
 * `comma` — 1.299,00 : the European convention, reversed.
 * `unknown` — the file has not said, so any amount whose meaning depends on the
 *   answer is refused rather than assumed. Amounts that do not depend on it
 *   (`12.99`, `1299`, `£8`) still import perfectly well.
 */
export type DecimalConvention = "dot" | "comma" | "unknown";

// ---------------------------------------------------------------------------
// The tokeniser
// ---------------------------------------------------------------------------

/**
 * Split delimited text into rows of cells.
 *
 * Handles what a real export contains rather than what a tidy one would:
 * quoted fields, doubled quotes as an escape (`""`), embedded newlines INSIDE a
 * quoted field, CRLF, and a trailing newline.
 *
 * The embedded newline is the one that matters and the one a line-splitting
 * parser gets wrong: a product description containing a line break turns one
 * row into two, and the second half then reads as a product with no price. The
 * existing contact importer in `app/dashboard/customers/page.tsx` splits on
 * newlines first and so cannot survive that — it is left alone here because it
 * works for the contact exports it was written against, and this file does not
 * silently change it. The duplication is recorded in REQUIREMENTS-COVERAGE.
 */
export function parseDelimited(text: string, delimiter?: Delimiter): { rows: string[][]; delimiter: Delimiter } {
  const raw = String(text ?? "");
  const delim = delimiter || sniffDelimiter(raw);

  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (raw[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; continue; }
    if (ch === delim) { cells.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { cells.push(cell); rows.push(cells); cells = []; cell = ""; continue; }
    cell += ch;
  }
  // Whatever is still in hand is the last cell of the last row — but only if
  // there is something there, so a trailing newline does not invent a row.
  if (cell !== "" || cells.length) { cells.push(cell); rows.push(cells); }

  return { rows: rows.map((r) => r.map((c) => c.trim())), delimiter: delim };
}

/**
 * Which delimiter this file uses, decided on the FIRST LINE ONLY.
 *
 * Counting across the whole file lets prose in a description column outvote the
 * real delimiter: one product blurb containing three commas beats a
 * semicolon-separated header. The header line is the one row guaranteed to be
 * structural.
 */
export function sniffDelimiter(text: string): Delimiter {
  const first = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").find((l) => l.trim().length) || "";
  const candidates: Delimiter[] = ["\t", ";", "|", ","];
  let best: Delimiter = ",";
  let bestCount = 0;
  for (const d of candidates) {
    const n = first.split(d).length - 1;
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type Amount =
  | { ok: true; pence: number; why: string }
  | { ok: false; reason: string };

/** Currency marks a shop export puts next to a number. Stripped, never interpreted. */
const CURRENCY = /[£$€\s]|GBP|USD|EUR/gi;

/**
 * Read a money amount into pence.
 *
 * Returns a REASON rather than a number whenever the string cannot be read with
 * certainty. See the header: the separator ambiguity is genuinely undecidable
 * from the characters, and being wrong is silent and 100×.
 */
export function readAmount(input: unknown, decimal: DecimalConvention = "unknown"): Amount {
  const original = String(input ?? "").trim();
  if (!original) return { ok: false, reason: "empty" };

  const s = original.replace(CURRENCY, "").trim();
  if (!s) return { ok: false, reason: `"${original}" has a currency mark and no number` };
  if (!/^-?[\d.,]+$/.test(s)) return { ok: false, reason: `"${original}" is not a number` };
  if (s.startsWith("-")) return { ok: false, reason: `"${original}" is negative — a price, a cost or a fee cannot be` };

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  // No separators at all: a whole number of pounds. Unambiguous.
  if (!dots && !commas) return finish(Number(s), original, "a whole number");

  // BOTH present: the LAST one is the decimal point and the other groups
  // thousands. `1,299.00` and `1.299,00` are both fully determined this way, so
  // the convention does not need to have been declared.
  if (dots && commas) {
    const decimalChar = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const groupChar = decimalChar === "." ? "," : ".";
    const normalised = s.split(groupChar).join("").replace(decimalChar, ".");
    if ((normalised.match(/\./g) || []).length > 1) return { ok: false, reason: `"${original}" has separators this cannot read` };
    return finish(Number(normalised), original, `${groupChar} groups thousands, ${decimalChar} is the decimal point`);
  }

  // ONE KIND of separator, and this is where the ambiguity lives.
  const sep = dots ? "." : ",";
  const parts = s.split(sep);

  // More than one of the same separator can only be thousands grouping:
  // `1.234.567` is not a decimal number in any convention. Parsed correctly
  // here and then judged by the sanity cap below — every such number is a
  // million or more by construction, and at that size a separator mistake is
  // far likelier than a real price for the businesses this serves. Parsing it
  // properly first is what lets the refusal name the actual reason.
  if (parts.length > 2) {
    if (!parts.slice(1).every((p) => p.length === 3)) return { ok: false, reason: `"${original}" has separators this cannot read` };
    return finish(Number(parts.join("")), original, `${sep} groups thousands`);
  }

  const tail = parts[1];

  // A tail that is not three digits long cannot be a thousands group, so this is
  // a decimal point whatever the file's convention: `12.99`, `12,5`, `8,754`… no,
  // three digits is exactly the ambiguous case, handled below.
  if (tail.length !== 3) return finish(Number(`${parts[0]}.${tail}`), original, `${sep} is the decimal point`);

  // THE AMBIGUOUS CASE: exactly one separator with exactly three digits after
  // it. `1,299` is 1299 as a thousands group and 1.299 as a decimal.
  //
  // A dot with three trailing digits is decided by convention too — `1.299` is
  // 1299 in Europe. Neither is safe to assume, so both are refused unless the
  // file has said which convention it uses.
  if (decimal === "unknown") {
    return {
      ok: false,
      reason:
        `"${original}" could be ${Number(parts.join(""))} or ${Number(`${parts[0]}.${tail}`)} — a "${sep}" with three digits after it ` +
        `is a thousands separator in one convention and a decimal point in the other, and they are 100× apart. ` +
        `Say which your file uses and this row imports.`,
    };
  }
  const isDecimalPoint = (decimal === "dot" && sep === ".") || (decimal === "comma" && sep === ",");
  return isDecimalPoint
    ? finish(Number(`${parts[0]}.${tail}`), original, `${sep} is the decimal point in this file`)
    : finish(Number(parts.join("")), original, `${sep} groups thousands in this file`);
}

function finish(pounds: number, original: string, why: string): Amount {
  if (!Number.isFinite(pounds)) return { ok: false, reason: `"${original}" is not a number` };
  // Rounded at the last step, once. Multiplying a float by 100 gives 1298.9999…
  // for some values, and a truncation there is a penny lost per product.
  const pence = Math.round(pounds * 100);
  if (pence > 100_000_000) return { ok: false, reason: `"${original}" is over £1,000,000 — check the separators` };
  return { ok: true, pence, why };
}

/** A percentage, for the returns allowance. 0–100, and never a fraction in disguise. */
export function readPercent(input: unknown): { ok: true; pct: number } | { ok: false; reason: string } {
  const original = String(input ?? "").trim();
  if (!original) return { ok: true, pct: 0 };
  const s = original.replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d*\.?\d+$/.test(s)) return { ok: false, reason: `"${original}" is not a percentage` };
  const pct = Number(s);
  if (pct > 100) return { ok: false, reason: `"${original}" is over 100%` };
  return { ok: true, pct };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const PRODUCT_FIELDS = [
  "name", "url", "price", "cogs", "fulfilment", "paymentFee", "tax", "returnsPct", "otherVariable",
] as const;
export type ProductField = (typeof PRODUCT_FIELDS)[number];

/**
 * Header spellings seen in the exports this has to accept.
 *
 * Shopify writes `Variant Price` and `Cost per item`; WooCommerce writes
 * `Regular price`; a spreadsheet somebody typed writes `RRP` or `Sell price`.
 * Matching is on a normalised header (lowercased, punctuation dropped) so
 * `Cost per item`, `cost_per_item` and `Cost Per Item` are one thing.
 */
const SYNONYMS: Record<ProductField, string[]> = {
  name: ["name", "product", "product name", "title", "item", "item name", "description"],
  url: ["url", "link", "product url", "product link", "page", "permalink", "handle", "web address"],
  price: ["price", "sell price", "selling price", "regular price", "variant price", "rrp", "retail price", "list price", "amount", "gross"],
  cogs: ["cogs", "cost", "unit cost", "cost per item", "cost price", "wholesale", "buy price", "supplier cost"],
  fulfilment: ["fulfilment", "fulfillment", "shipping", "delivery", "postage", "shipping cost", "pick and pack"],
  paymentFee: ["payment fee", "payment fees", "processing fee", "card fee", "transaction fee", "merchant fee", "stripe fee"],
  tax: ["tax", "vat", "sales tax", "vat amount", "tax amount", "duty"],
  returnsPct: ["returns", "returns pct", "returns allowance", "return rate", "refund rate", "returns %"],
  otherVariable: ["other", "other variable", "other costs", "variable", "misc", "overhead"],
};

const normalise = (h: string) => String(h ?? "").toLowerCase().replace(/[_\-.]+/g, " ").replace(/[^a-z0-9% ]+/g, "").replace(/\s+/g, " ").trim();

export type ColumnMap = {
  /** field → column index. A field with no column is simply absent. */
  columns: Partial<Record<ProductField, number>>;
  /** Headers this did not recognise, reported rather than dropped in silence. */
  unmapped: { index: number; header: string }[];
  missingRequired: ProductField[];
};

/** Without these two there is no product at all. */
export const REQUIRED_FIELDS: ProductField[] = ["name", "price"];

export function mapProductColumns(headers: string[]): ColumnMap {
  const columns: Partial<Record<ProductField, number>> = {};
  const unmapped: { index: number; header: string }[] = [];

  headers.forEach((raw, index) => {
    const h = normalise(raw);
    if (!h) return;
    // EXACT MATCHES FIRST, ACROSS EVERY FIELD, before any prefix matching.
    //
    // Scoring each column against fields in declaration order let a loose match
    // win over an exact one: "Cost per item" contains "item", which is a `name`
    // synonym, and `name` is declared first — so a Shopify export mapped its
    // cost column to the product name and left the real cost unmapped. Every
    // product then imported with zero cost of goods and a commission computed
    // on a margin the brand does not have.
    const exact = (PRODUCT_FIELDS as readonly ProductField[]).find((f) => SYNONYMS[f].includes(h));
    const field = exact ?? (PRODUCT_FIELDS as readonly ProductField[]).find((f) => SYNONYMS[f].some((s) => h === `${s}s` || h.startsWith(`${s} `)));
    if (field && columns[field] === undefined) columns[field] = index;
    else unmapped.push({ index, header: raw });
  });

  return { columns, unmapped, missingRequired: REQUIRED_FIELDS.filter((f) => columns[f] === undefined) };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Exactly the numbers `OfferEconomics` needs, and nothing this layer invents. */
export type ImportedOffer = {
  pricePence: number;
  cogsPence: number;
  fulfilmentPence: number;
  paymentFeePence: number;
  taxPence: number;
  returnsAllowancePct: number;
  otherVariablePence: number;
};

export type RowOutcome =
  | { ok: true; row: number; name: string; url: string; offer: ImportedOffer; notes: string[] }
  | { ok: false; row: number; name: string; problems: string[] };

/**
 * Read one row.
 *
 * A MISSING optional cost is 0 and says so; an UNREADABLE one refuses the row.
 * Those are different and the difference is the whole point: "this shop does
 * not pay a fulfilment cost" and "this fulfilment cost could not be read" must
 * not both silently become zero, because zero cost is the value that makes a
 * product look most eligible.
 */
export function readRow(cells: string[], map: ColumnMap, rowNumber: number, decimal: DecimalConvention = "unknown"): RowOutcome {
  const at = (f: ProductField): string => {
    const i = map.columns[f];
    return i === undefined ? "" : String(cells[i] ?? "").trim();
  };

  const name = at("name");
  const problems: string[] = [];
  const notes: string[] = [];

  if (!name) problems.push("no product name");

  const price = readAmount(at("price"), decimal);
  if (!price.ok) problems.push(`price: ${price.reason}`);
  else if (price.pence <= 0) problems.push("price: a product priced at zero cannot pay a commission");

  const optional: { field: ProductField; key: keyof ImportedOffer; label: string }[] = [
    { field: "cogs", key: "cogsPence", label: "cost of goods" },
    { field: "fulfilment", key: "fulfilmentPence", label: "fulfilment" },
    { field: "paymentFee", key: "paymentFeePence", label: "payment fee" },
    { field: "tax", key: "taxPence", label: "tax" },
    { field: "otherVariable", key: "otherVariablePence", label: "other variable costs" },
  ];

  const offer: ImportedOffer = {
    pricePence: price.ok ? price.pence : 0,
    cogsPence: 0, fulfilmentPence: 0, paymentFeePence: 0, taxPence: 0,
    returnsAllowancePct: 0, otherVariablePence: 0,
  };

  for (const { field, key, label } of optional) {
    const cell = at(field);
    if (!cell) { notes.push(`${label} not in the file — treated as 0`); continue; }
    const a = readAmount(cell, decimal);
    if (!a.ok) problems.push(`${label}: ${a.reason}`);
    else offer[key] = a.pence;
  }

  const returnsCell = at("returnsPct");
  if (returnsCell) {
    const p = readPercent(returnsCell);
    if (!p.ok) problems.push(`returns allowance: ${p.reason}`);
    else offer.returnsAllowancePct = p.pct;
  }

  // A cost stack that exceeds the price is a data error, not a loss-leader we
  // should quietly accept: it produces a negative margin, and every downstream
  // eligibility answer computed from it is meaningless.
  if (!problems.length) {
    const costs = offer.cogsPence + offer.fulfilmentPence + offer.paymentFeePence + offer.taxPence + offer.otherVariablePence;
    if (costs > offer.pricePence) {
      problems.push(`the costs add up to more than the price (${costs}p of costs against ${offer.pricePence}p) — check the columns are the right way round`);
    }
  }

  if (problems.length) return { ok: false, row: rowNumber, name, problems };
  return { ok: true, row: rowNumber, name, url: at("url"), offer, notes };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export type ImportPlan = {
  delimiter: Delimiter;
  decimal: DecimalConvention;
  headerRow: number;
  headers: string[];
  mapping: ColumnMap;
  ready: Extract<RowOutcome, { ok: true }>[];
  refused: Extract<RowOutcome, { ok: false }>[];
  /** Later rows sharing a name with an earlier one. The LAST wins, as a re-import would. */
  duplicates: { row: number; name: string; firstSeenRow: number }[];
  totalRows: number;
  summary: string;
  /** True when nothing can be imported at all — a bad file rather than bad rows. */
  fatal: string;
};

/**
 * Turn a file into a plan. NOTHING IS STORED HERE.
 *
 * The plan is the whole point: importing two hundred products blind is how a
 * catalogue gets wrecked, and the row that was refused is more interesting than
 * the ones that were not. The caller shows this, and only then writes.
 */
export function planImport(input: { text: string; delimiter?: Delimiter; decimal?: DecimalConvention; headerRow?: number }): ImportPlan {
  const decimal = input.decimal ?? "unknown";
  const { rows, delimiter } = parseDelimited(input.text, input.delimiter);

  const empty = (fatal: string): ImportPlan => ({
    delimiter, decimal, headerRow: -1, headers: [],
    mapping: { columns: {}, unmapped: [], missingRequired: REQUIRED_FIELDS },
    ready: [], refused: [], duplicates: [], totalRows: rows.length, summary: fatal, fatal,
  });

  if (!rows.length) return empty("The file is empty.");

  const headerRow = input.headerRow ?? 0;
  if (headerRow < 0 || headerRow >= rows.length) return empty(`There is no row ${headerRow + 1} in this file.`);

  const headers = rows[headerRow];
  const mapping = mapProductColumns(headers);
  if (mapping.missingRequired.length) {
    return {
      ...empty(""),
      headerRow, headers, mapping,
      fatal:
        `This file has no ${mapping.missingRequired.join(" and no ")} column, and without ${mapping.missingRequired.length > 1 ? "those" : "that"} there is no product to import. ` +
        `The headers read: ${headers.filter(Boolean).join(", ") || "(none)"}.`,
      summary: "Nothing imported.",
    };
  }

  const ready: Extract<RowOutcome, { ok: true }>[] = [];
  const refused: Extract<RowOutcome, { ok: false }>[] = [];
  const duplicates: { row: number; name: string; firstSeenRow: number }[] = [];
  const seen = new Map<string, number>();

  for (let i = headerRow + 1; i < rows.length; i++) {
    const cells = rows[i];
    // A blank line in the middle of an export is not a failed product.
    if (!cells.some((c) => c !== "")) continue;

    const outcome = readRow(cells, mapping, i + 1, decimal);
    if (!outcome.ok) { refused.push(outcome); continue; }

    // Same name twice in ONE file. `productId` hashes brand + name, so the
    // second write lands on the first one's document — which is correct for a
    // re-import and surprising inside a single file, so it is reported.
    const key = outcome.name.trim().toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) duplicates.push({ row: outcome.row, name: outcome.name, firstSeenRow: first });
    seen.set(key, outcome.row);
    ready.push(outcome);
  }

  const ambiguous = refused.filter((r) => r.problems.some((p) => p.includes("100× apart"))).length;
  const summary =
    `${ready.length} product${ready.length === 1 ? "" : "s"} ready to import` +
    (refused.length ? `, ${refused.length} refused` : "") +
    (duplicates.length ? `, ${duplicates.length} repeated name${duplicates.length === 1 ? "" : "s"}` : "") +
    "." +
    (ambiguous
      ? ` ${ambiguous} of the refusals are the same fixable thing: this file writes numbers in a way that could mean two amounts 100× apart. Tell us whether it uses 1,299.00 or 1.299,00 and they will import.`
      : "");

  return { delimiter, decimal, headerRow, headers, mapping, ready, refused, duplicates, totalRows: rows.length, summary, fatal: "" };
}
