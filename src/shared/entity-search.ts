// SEARCHING THE CUSTOMER'S OWN WORK (§92).
//
// `search.ts` is WEB search — Serper, competitors, local leads. Nothing searched
// the things the customer made: their approvals, their brand facts, their past
// experiments, their assets. So the only way to find last month's campaign was
// to remember which screen it was on.
//
// This is the matching and ranking, kept pure and in `shared` so a surface can
// use it without a round trip and so the rules can be tested without a database.
// The gathering — asking each module for its records — is `global-search.ts`.
//
// THREE THINGS IT DELIBERATELY DOES NOT DO.
//
//   • NO RELEVANCE PERCENTAGE. Results carry WHERE they matched (title, body, an
//     exact phrase) and their position. A "94% relevant" would be a number
//     nothing measured, which this platform does not print.
//   • NO FUZZY GUESSING. Stop-words are dropped and the rest must actually
//     appear. A search that returns something for every query teaches people to
//     ignore the results.
//   • NO SILENT EMPTY. "Nothing matched" says what was searched and what was
//     ignored, so a person can tell a bad query from an empty account.

export type EntityKind =
  | "approval" | "brand_fact" | "experiment" | "asset" | "campaign" | "publication" | "contact";

export type SearchableEntity = {
  id: string;
  kind: EntityKind;
  title: string;
  subtitle?: string;
  body?: string;
  /** Where to open it. A result you cannot click is a result you cannot use. */
  href: string;
  /** ISO. Ties break towards the more recent thing. */
  at?: string;
};

export type MatchField = "exact_phrase" | "title" | "subtitle" | "body";

export type SearchHit = SearchableEntity & {
  matchedOn: MatchField[];
  /** Which of the query's words were actually found. Shown, never scored. */
  matchedWords: string[];
};

export type SearchOutcome = {
  hits: SearchHit[];
  /** The words that were actually searched for. */
  terms: string[];
  /** Words dropped as too common to be worth matching. */
  ignored: string[];
  totalSearched: number;
  headline: string;
};

// Common words carry no signal and match everything. Same reasoning as the
// experiment-history matcher: a length filter is not enough, because plenty of
// function words are four letters or more.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "these", "those", "your",
  "our", "their", "them", "they", "have", "has", "had", "been", "was", "were",
  "will", "would", "into", "onto", "over", "under", "than", "then", "when",
  "what", "which", "while", "about", "after", "before", "more", "most", "less",
  "just", "some", "such", "only", "also", "very", "all", "any", "can", "did",
  "does", "how", "its", "not", "out", "you", "are", "but", "his", "her",
]);

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function queryTerms(query: string): { terms: string[]; ignored: string[] } {
  const words = norm(query).split(" ").filter(Boolean);
  const terms: string[] = [];
  const ignored: string[] = [];
  for (const w of words) {
    if (w.length < 2 || STOPWORDS.has(w)) ignored.push(w);
    else terms.push(w);
  }
  return { terms: [...new Set(terms)], ignored: [...new Set(ignored)] };
}

/** Rank order, lowest first. Where it matched decides; recency only breaks ties. */
function rankOf(fields: MatchField[]): number {
  if (fields.includes("exact_phrase")) return 0;
  if (fields.includes("title")) return 1;
  if (fields.includes("subtitle")) return 2;
  return 3;
}

export function searchEntities(query: string, entities: SearchableEntity[], opts: { limit?: number } = {}): SearchOutcome {
  const { terms, ignored } = queryTerms(query);
  const phrase = norm(query);
  const limit = opts.limit ?? 25;
  const totalSearched = entities.length;

  if (terms.length === 0) {
    return {
      hits: [], terms, ignored, totalSearched,
      headline: ignored.length
        ? `Nothing to search for — "${ignored.join(" ")}" ${ignored.length === 1 ? "is a word that" : "are words that"} appear everywhere. Add something specific.`
        : "Type something to search your campaigns, approvals, brand facts and experiments.",
    };
  }

  const hits: (SearchHit & { _rank: number; _time: number })[] = [];
  for (const e of entities) {
    const title = norm(e.title);
    const subtitle = norm(e.subtitle || "");
    const body = norm(e.body || "");
    const haystack = `${title} ${subtitle} ${body}`;

    const matchedWords = terms.filter((t) => haystack.includes(t));
    // EVERY term must appear. Matching on any-of returns the whole account for a
    // two-word query, which is the same as returning nothing useful.
    if (matchedWords.length !== terms.length) continue;

    const fields: MatchField[] = [];
    // A PHRASE NEEDS MORE THAN ONE WORD.
    //
    // With a single-term query the phrase and the term are the same string, so
    // every body match was scored as an exact-phrase match and the ranking
    // collapsed: a passing mention in a newer item outranked the same word in
    // another item's title. Caught by the ordering test.
    if (terms.length >= 2 && phrase.length > 2 && haystack.includes(phrase)) fields.push("exact_phrase");
    if (terms.some((t) => title.includes(t))) fields.push("title");
    if (terms.some((t) => subtitle.includes(t))) fields.push("subtitle");
    if (terms.some((t) => body.includes(t))) fields.push("body");

    hits.push({
      ...e, matchedOn: fields, matchedWords,
      _rank: rankOf(fields),
      _time: e.at ? Date.parse(e.at) || 0 : 0,
    });
  }

  hits.sort((a, b) => (a._rank - b._rank) || (b._time - a._time) || a.title.localeCompare(b.title));
  const out = hits.slice(0, limit).map(({ _rank, _time, ...rest }) => rest);

  const byKind = new Map<EntityKind, number>();
  for (const h of out) byKind.set(h.kind, (byKind.get(h.kind) || 0) + 1);
  const kinds = [...byKind.entries()].map(([k, n]) => `${n} ${k.replace(/_/g, " ")}${n === 1 ? "" : "s"}`);

  const headline = out.length === 0
    ? `Nothing in your ${totalSearched} saved item${totalSearched === 1 ? "" : "s"} contains ${terms.map((t) => `"${t}"`).join(" and ")}.${ignored.length ? ` (Ignored: ${ignored.join(", ")}.)` : ""}`
    : `${hits.length} match${hits.length === 1 ? "" : "es"}${hits.length > out.length ? `, showing ${out.length}` : ""} — ${kinds.join(", ")}.`;

  return { hits: out, terms, ignored, totalSearched, headline };
}

export const SEARCH_DOCTRINE = [
  "Every term must appear. Matching on any-of returns the whole account for a two-word query, which is the same as returning nothing useful.",
  "No relevance percentage. A result carries where it matched and its position — a score would be a number nothing measured.",
  "Common words are dropped and SAID to be dropped, so a person can tell a bad query from an empty account.",
  "Where it matched decides the order; recency only breaks ties. A newer irrelevant thing never outranks an older exact one.",
  "Every result carries a link. A result you cannot click is a result you cannot use.",
];
