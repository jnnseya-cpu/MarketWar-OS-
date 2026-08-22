// COMMENT INTELLIGENCE (§41) — what a public comment is actually asking for.
//
// `engagement.ts` already classifies EMAIL THREAD replies (`suggestReply`).
// This is not that, and the difference is the whole reason it is a separate
// module rather than another branch in there:
//
//   • A comment is PUBLIC and permanent. A wrong reply is read by everybody who
//     finds the post, for as long as the post exists. An email mistake is seen
//     by one person.
//   • The classes are different. Email replies are interested / question /
//     objection / unsubscribe. Comments are somebody asking the price, somebody
//     complaining where customers can see it, somebody abusive, and a great deal
//     of spam.
//   • The money is in one class. "How much?" under a post is a customer with
//     their hand up, and the cost of missing it is a sale.
//
// THE THREE RULES THAT MADE THIS WORTH BUILDING PROPERLY.
//
//   1. NOTHING IS EVER AUTO-SENT. Every reply is a draft. A public channel is
//      the last place to let a classifier speak for the brand unattended.
//   2. A COMPLAINT CAN NEVER RECEIVE A SALES DRAFT. Not "should not" —
//      structurally cannot: the complaint draft is written to acknowledge and
//      move the conversation off the public post, and nothing in it sells.
//      Answering a public complaint with an offer is how a bad afternoon
//      becomes a screenshot.
//   3. AN UNCLEAR COMMENT IS CALLED UNCLEAR. No confidence number, no guess. If
//      nothing matched, it says so and routes it to a person — the platform's
//      standing rule that nothing is presented as a measurement unless
//      something counted it, applied to intent.
//
// Pure and in `shared` so a surface can classify without a round trip, and so
// the rules are testable without a provider.

export type CommentIntent =
  | "buying_intent"
  | "question"
  | "complaint"
  | "praise"
  | "spam"
  | "hostile"
  | "competitor"
  | "unclear";

export type Handling = "reply_now" | "reply_soon" | "route_to_human" | "hide_or_ignore" | "no_action";

export type CommentVerdict = {
  intent: CommentIntent;
  /** Which phrases decided it. Shown, so a person can disagree with the reason. */
  signals: string[];
  /** No number. Either something matched or nothing did. */
  matched: boolean;
  handling: Handling;
  /** Order for a queue. Money first, then reputation. */
  priority: number;
  /** Absent wherever a draft would be dangerous. */
  draftReply?: string;
  /** Always true where a draft exists. There is no auto-send path in this module. */
  isDraft?: true;
  note: string;
};

type Rule = { intent: CommentIntent; patterns: RegExp[] };

// ORDER IS THE DESIGN. Checked top to bottom, first match wins.
//
// Hostile and spam come before everything, because a comment can be abusive AND
// contain a question, and answering the question is the wrong move. Buying
// intent comes before complaint so that "how much is it, the last one was late"
// is treated as a customer with money — the complaint is still visible in the
// signals, and a human sees both.
const RULES: Rule[] = [
  {
    intent: "hostile",
    patterns: [
      /\b(scam|scammers?|fraud|thie(f|ves)|liars?|lying|crooks?)\b/i,
      /\b(shut up|piss off|f\*+k|fuck|shit|idiots?|morons?|stupid)\b/i,
      /\b(sue|lawyer|legal action|trading standards)\b/i,
    ],
  },
  {
    intent: "spam",
    patterns: [
      /\b(follow ?back|f4f|check my (page|profile|bio)|dm for promo|make \$?\d+ ?(a|per) day)\b/i,
      /\b(crypto|forex|binary option|investment opportunity|earn from home)\b/i,
      /(https?:\/\/|www\.)\S+\.(ru|top|xyz|click|loan)\b/i,
    ],
  },
  {
    intent: "buying_intent",
    patterns: [
      /\b(how much|what.{0,10}(the )?price|price list|pricing|cost|quote)\b/i,
      /\b(where (can|do) i (buy|get|order)|how do i (buy|order|book)|want to (buy|order|book))\b/i,
      /\b(in stock|available|do you (ship|deliver)|delivery to|can i get)\b/i,
      /\b(dm(ed)? (me|you)|send(ing)? (me )?(a )?(dm|link|details)|link please|link\?)\b/i,
      /\bi.?ll take (one|two|it)\b/i,
    ],
  },
  {
    intent: "complaint",
    patterns: [
      /\b(still waiting|never (arrived|came|turned up)|no ?one (has )?(replied|answered|got back))\b/i,
      /\b(broken|faulty|damaged|wrong (item|size|order)|missing)\b/i,
      /\b(refund|money back|cancel(led)? my order|charged twice|overcharged)\b/i,
      /\b(terrible|awful|worst|disappointed|unacceptable|appalling)\b/i,
      /\b(third time|weeks? ago|months? ago) (i|we) (have )?(asked|emailed|called|contacted)\b/i,
    ],
  },
  {
    intent: "competitor",
    patterns: [
      /\b(cheaper (at|from|with)|better (at|from|with)|i use \w+ instead|switch(ed)? to \w+)\b/i,
    ],
  },
  {
    intent: "praise",
    patterns: [
      /\b(love (this|it|these)|amazing|brilliant|fantastic|best .{0,20}(ever|i.?ve had)|recommend(ed)?)\b/i,
      /\b(thank(s| you)|great (service|job|work)|so happy|chuffed)\b/i,
    ],
  },
  {
    intent: "question",
    patterns: [
      /\?/,
      /\b(how (do|does|long|often)|what (is|are|time)|when (do|does|is)|which one|can you|do you|is (it|this))\b/i,
    ],
  },
];

const HANDLING: Record<CommentIntent, { handling: Handling; priority: number; note: string }> = {
  buying_intent: { handling: "reply_now", priority: 1, note: "Somebody is asking to buy. This is the one where a slow reply costs money." },
  complaint: { handling: "route_to_human", priority: 2, note: "A complaint in public. Answer it as a person, quickly, and take the detail somewhere private." },
  hostile: { handling: "route_to_human", priority: 3, note: "Hostile or accusatory. No draft is offered — nothing good comes of a generated reply here." },
  question: { handling: "reply_soon", priority: 4, note: "A real question. Answering in public helps the next person who asks it." },
  competitor: { handling: "route_to_human", priority: 5, note: "A comparison with somebody else. Arguing under your own post rarely reads the way you hope." },
  praise: { handling: "reply_soon", priority: 6, note: "Thank them like a person. This is also the cheapest place to ask for a review." },
  spam: { handling: "hide_or_ignore", priority: 8, note: "Promotional noise. Hide it — replying feeds it." },
  unclear: { handling: "route_to_human", priority: 7, note: "Nothing in this matched a known pattern. Left for a person rather than guessed at." },
};

// Drafts exist only where a draft is SAFE. Hostile and unclear have none by
// design, and the complaint draft sells nothing.
const DRAFTS: Partial<Record<CommentIntent, string>> = {
  buying_intent: "Thanks for asking — sending you the details now. If it is easier, drop us a message and we will get you sorted today.",
  question: "Good question — here is the answer, and shout if you want more detail.",
  complaint: "I am sorry, that is not what should have happened. Can you send us a message with your order number and we will get it put right today.",
  praise: "Thank you — that genuinely means a lot to the team.",
  competitor: "Appreciate the comparison — happy to talk through the difference if it is useful.",
};

export function classifyComment(text: string): CommentVerdict {
  const raw = (text || "").trim();
  if (!raw) {
    return { intent: "unclear", signals: [], matched: false, ...HANDLING.unclear };
  }

  for (const rule of RULES) {
    const signals: string[] = [];
    for (const p of rule.patterns) {
      const m = raw.match(p);
      if (m) signals.push(m[0].trim());
    }
    if (signals.length === 0) continue;

    const meta = HANDLING[rule.intent];
    const draft = DRAFTS[rule.intent];
    return {
      intent: rule.intent,
      signals,
      matched: true,
      handling: meta.handling,
      priority: meta.priority,
      note: meta.note,
      ...(draft ? { draftReply: draft, isDraft: true as const } : {}),
    };
  }

  return { intent: "unclear", signals: [], matched: false, ...HANDLING.unclear };
}

export type TriagedComment = CommentVerdict & { id: string; text: string };

/**
 * A queue, money first.
 *
 * Sorted by priority and then by ORDER RECEIVED, never by length or by any
 * derived score — a queue that reorders itself on something invisible is a
 * queue people stop trusting.
 */
export function triage(comments: { id: string; text: string }[]): {
  queue: TriagedComment[];
  counts: Record<CommentIntent, number>;
  headline: string;
} {
  const counts = Object.fromEntries(
    (Object.keys(HANDLING) as CommentIntent[]).map((k) => [k, 0]),
  ) as Record<CommentIntent, number>;

  const queue = comments.map((c, i) => {
    const v = classifyComment(c.text);
    counts[v.intent] += 1;
    return { ...v, id: c.id, text: c.text, _i: i };
  })
    .sort((a, b) => (a.priority - b.priority) || (a._i - b._i))
    .map(({ _i, ...rest }) => rest);

  const buying = counts.buying_intent;
  const complaints = counts.complaint;
  const headline = buying > 0
    ? `${buying} ${buying === 1 ? "person is" : "people are"} asking to buy. Answer those first.`
    : complaints > 0
      ? `${complaints} ${complaints === 1 ? "complaint" : "complaints"} in public and nobody asking to buy. Handle the complaints.`
      : comments.length === 0
        ? "No comments to work through."
        : "Nothing urgent — questions and praise only.";

  return { queue, counts, headline };
}

export const COMMENT_DOCTRINE = [
  "Nothing is ever auto-sent. Every reply is a draft, because a public channel is the last place to let a classifier speak for the brand unattended.",
  "A complaint can never receive a sales draft. Answering a public complaint with an offer is how a bad afternoon becomes a screenshot.",
  "Hostile comments get no draft at all. Nothing good comes of a generated reply to an accusation.",
  "An unmatched comment is called unclear and routed to a person. No confidence number, no guess.",
  "Buying intent outranks everything, because that is the class where a slow reply costs money.",
];
