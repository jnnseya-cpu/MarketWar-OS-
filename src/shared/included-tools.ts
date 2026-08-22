// WHAT YOU WOULD OTHERWISE BUY SEPARATELY.
//
// The landing page sold the strategy and left out the tools. Somebody reading
// it could not tell that the screen recorder puts you on the recording, that
// bulk email goes out from your own domain with attachments, or that a long
// video comes back as vertical clips — and those are the things a buyer already
// pays three separate monthly bills for.
//
// THE RULE THIS LIST IS BOUND BY: EVERY ROW NAMES SOMETHING THAT SHIPS TODAY.
//
// No roadmap, no "coming soon", no capability that needs a key the customer
// does not have. Where something only works once a provider key is set, the row
// says so rather than implying otherwise — a feature list that overstates is a
// refund in week two, and this platform's whole argument is that its numbers and
// its claims are honest.
//
// AND NO COMPETITOR IS NAMED, AND NO PRICE IS INVENTED. "A separate subscription
// for each of these" is a true statement about how the market is sold. "£39 a
// month for X" would be a claim about somebody else's pricing that nobody here
// has verified, and this platform does not print numbers it has not counted.

export type IncludedTool = {
  /** The category of product a business would otherwise subscribe to. */
  insteadOf: string;
  /** What MarketWar does instead — specific enough to be checkable. */
  included: string;
  /** The honest limit, where there is one. */
  limit?: string;
  /** True when it runs with no provider key at all. */
  keyless: boolean;
};

export const INCLUDED_TOOLS: IncludedTool[] = [
  {
    insteadOf: "A screen-recording tool",
    included: "Record your whole screen with yourself on it — both composited into one file, with your picture draggable anywhere on the frame while you record. Microphone and system sound are mixed together, not one or the other.",
    limit: "Desktop browser. Phones cannot capture a screen.",
    keyless: true,
  },
  {
    insteadOf: "A video-clipping tool",
    included: "One long video in, vertical clips out — cut at the moments worth posting, cropped to 9:16, captions burned in, with the seven counted signals each clip was chosen on so you can disagree with it.",
    limit: "Rendered in your browser, so nothing is uploaded and there is no render bill.",
    keyless: true,
  },
  {
    insteadOf: "An email-sending platform",
    included: "Bulk email from your own authenticated domain — DKIM-signed, with attachments, batched with real per-recipient results, and a suppression list honoured platform-wide. Not a third-party sender wearing your name.",
    limit: "Needs your sending domain's DNS verified, or an API key for a provider.",
    keyless: false,
  },
  {
    insteadOf: "A design tool for ad creative",
    included: "Your own photo in, a postable image out at the real placement size for each channel, contrast-checked, with your logo placed rather than distorted. The headline stays a string you can retype — fixing a typo costs nothing instead of a whole new generation.",
    keyless: true,
  },
  {
    insteadOf: "A social scheduler",
    included: "One master asset adapted to each channel's real limits — caption length, hashtag count, whether links are clickable, the right image shape — and every change it had to make is listed rather than applied silently.",
    limit: "Publishing to a channel needs that channel connected; the adaptation itself does not.",
    keyless: false,
  },
  {
    insteadOf: "A client-approval or proofing tool",
    included: "Send one piece of work to a client with a signed link. They approve, ask for a change or reject it without making an account, and the decision is recorded with the time and their name.",
    limit: "Needs a signing secret set on the deployment, or no link is issued at all.",
    keyless: false,
  },
  {
    insteadOf: "An A/B testing tool",
    included: "Two-proportion significance testing with the sample size you actually need, plus a memory of what has already been tried — so an idea that lost six weeks ago is not proposed again, and one that was abandoned early is not mistaken for one that failed.",
    keyless: true,
  },
  {
    insteadOf: "An ad-spend monitoring tool",
    included: "Stop-loss below break-even, scaling only in +20% steps and only above 3× return, computed budget ceilings — and a refusal to judge at all when there is too little data, instead of a confident number from forty impressions.",
    keyless: true,
  },
  {
    insteadOf: "A website audit tool",
    included: "A real crawl of a real page with findings you can act on. Public, no account, no card — run it on your own site before you decide anything.",
    keyless: true,
  },
  {
    insteadOf: "A reporting dashboard",
    included: "Revenue against the cost you actually entered, campaign verdicts of scale, fix or stop, and a ledger that only ever shows money you recorded. Nothing is projected into a column labelled as measured.",
    keyless: true,
  },
  {
    insteadOf: "An activity or audit log",
    included: "What ran while you were away, kept separate from what you did yourself — with the value before and after every change, and credentials redacted by shape as well as by name.",
    keyless: true,
  },
  {
    insteadOf: "A workflow-automation tool",
    included: "Chains of agents that run one job in order, on your schedule, sharing what they already know about your business. They draft; anything that would spend, send or publish waits for you.",
    keyless: true,
  },
];

/** The honest framing of the whole list. Counts, never adjectives. */
export function includedSummary(): { total: number; keyless: number; line: string } {
  const keyless = INCLUDED_TOOLS.filter((t) => t.keyless).length;
  return {
    total: INCLUDED_TOOLS.length,
    keyless,
    line: `${INCLUDED_TOOLS.length} things a growing business normally pays for separately. ${keyless} of them work on a new account with no keys, no card and no configuration.`,
  };
}
