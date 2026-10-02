// ONE SPLIT, USED BY THE PAGE AND BY ITS SCHEMA.
//
// A generated landing page stores its FAQ as flat strings — "How much does it
// cost? — See the offer above." — and the hosted page splits each one into a
// question and an answer when it renders the accordion.
//
// WHY THIS IS NOT A SECOND COPY OF THAT LOGIC. FAQPage schema tells an assistant
// (and Google) what the questions and answers on this page ARE. If the schema
// splits the string even slightly differently from the renderer, the schema is
// describing a page that does not exist: Google's own FAQ policy treats a
// mismatch between markup and visible content as a violation, and this
// platform's rule against printing anything it has not got is the same rule from
// the other side.
//
// That is this codebase's oldest defect class — a value derived differently on
// two sides of a boundary — so the renderer and the schema builder call this, and
// there is no other implementation to drift from.

export type FaqPair = { question: string; answer: string };

/**
 * One stored FAQ string as a question and an answer.
 *
 * The split is on the FIRST question mark, which is how the accordion has always
 * done it. A string with no question mark is a question with no answer, and is
 * rendered as a bare summary — so it comes back with an empty answer rather than
 * being dropped, because dropping it here would put a question on the page that
 * the schema denies exists.
 */
export function splitFaqItem(raw: string): FaqPair | null {
  const item = (raw || "").trim();
  if (!item) return null;
  const [head, ...rest] = item.split(/\s*[?]\s*/);
  const tail = rest.join("? ").trim();
  const question = tail ? `${head.trim()}?` : head.trim();
  if (!question) return null;
  // The stored form separates the answer with an em or en dash. It is punctuation
  // joining two halves of one string, not part of the answer, so the schema and
  // the accordion both read past it — the words are identical either way.
  const answer = tail.replace(/^[\s—–-]+/, "").trim();
  return { question, answer };
}

/**
 * The pairs worth putting in FAQPage schema.
 *
 * ONLY PAIRS THAT HAVE BOTH HALVES. Schema.org requires an `acceptedAnswer`, and
 * a Question with an empty answer is both invalid and useless to an assistant —
 * it is a prompt with nothing behind it. Those still render on the page as a
 * heading; they are simply not claimed as answered content.
 */
export function faqPairs(items: readonly string[] | undefined): FaqPair[] {
  if (!items?.length) return [];
  const out: FaqPair[] = [];
  for (const raw of items) {
    const pair = splitFaqItem(raw);
    if (pair && pair.answer) out.push(pair);
  }
  return out;
}
