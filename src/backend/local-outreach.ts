// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Local Outreach — printed flyers and local-group posts, for every brand.
//
// The other half of "reviews, likes and followers". Reviews are handled by
// review-requests.ts; this module covers the two parts of the same ask that are
// straightforwardly legitimate and were simply missing: a business flyer that is
// actually printable, and a local-group post that a real person publishes.
//
// FOLLOWERS. Bought followers are not built here, and the reason is arithmetic
// rather than principle: every feed ranks by engagement RATE. A thousand
// accounts that never comment divide the same engagement across a bigger
// denominator, so the page is shown to FEWER real people after the purchase than
// before it — and Meta's inauthentic-behaviour enforcement lands on the page
// that bought them. Real local followers come from real local reach, which is
// what a flyer with a QR code and a post in a group of actual neighbours is for.
//
// WHY WE DRAFT AND THE CUSTOMER POSTS. There is no supported way for us to
// publish into somebody else's local group: Meta's Groups API only permits
// posting into a group that installed the app, Nextdoor has no third-party
// posting API for neighbourhood posts, and every local group's own rules require
// that a member — a person — posts. Automating it means an unofficial session,
// which is how accounts get restricted. So the engine writes the post, records
// the group's rules, and the customer presses post.

// ---------------------------------------------------------------------------
// Print
//
// A flyer is the one asset in the platform that leaves the screen, and the
// screen sizes we already have are useless for it: 1080×1350 sent to a print
// shop at A5 is 130 DPI and comes back fuzzy. So print is specified in
// millimetres — the unit a printer actually works in — and converted at the end.
// ---------------------------------------------------------------------------
export const PRINT_DPI = 300;         // the standard commercial print resolution
export const BLEED_MM = 3;            // trimmed off; artwork must extend into it
export const SAFE_MARGIN_MM = 5;      // nothing that matters goes outside this

export const mmToPx = (mm: number, dpi: number = PRINT_DPI): number => Math.round((mm / 25.4) * dpi);

export type PrintSizeId = "a6" | "dl" | "a5" | "a4" | "a3";

export type PrintSize = {
  id: PrintSizeId;
  label: string;
  widthMm: number;
  heightMm: number;
  use: string;
};

export const PRINT_SIZES: PrintSize[] = [
  { id: "a6", label: "A6 postcard", widthMm: 105, heightMm: 148, use: "Letterbox drops and counter stacks — cheapest per unit, so it is the one for volume." },
  { id: "dl", label: "DL leaflet", widthMm: 99, heightMm: 210, use: "Fits a standard envelope and a takeaway bag; the shape people expect a menu in." },
  { id: "a5", label: "A5 flyer", widthMm: 148, heightMm: 210, use: "The default. Big enough to read across a table, small enough to hand out." },
  { id: "a4", label: "A4 sheet", widthMm: 210, heightMm: 297, use: "Noticeboards and shop windows, where it is read standing up from a metre away." },
  { id: "a3", label: "A3 poster", widthMm: 297, heightMm: 420, use: "Community boards and events — read from across a room." },
];

export const printSize = (id: string): PrintSize | null => PRINT_SIZES.find((s) => s.id === id) || null;

export type PrintSpec = {
  id: PrintSizeId;
  label: string;
  trimMm: { w: number; h: number };
  bleedMm: number;
  safeMarginMm: number;
  dpi: number;
  // What the file must actually be, including bleed on all four sides.
  pixels: { w: number; h: number };
  trimPixels: { w: number; h: number };
  safeBoxPixels: { x: number; y: number; w: number; h: number };
  notes: string[];
};

export function printSpec(id: string, dpi: number = PRINT_DPI): PrintSpec | null {
  const s = printSize(id);
  if (!s) return null;
  const d = Math.max(72, Math.min(1200, Math.round(dpi)));
  const bleedPx = mmToPx(BLEED_MM, d);
  const safePx = mmToPx(SAFE_MARGIN_MM, d);
  const trimW = mmToPx(s.widthMm, d);
  const trimH = mmToPx(s.heightMm, d);
  return {
    id: s.id,
    label: s.label,
    trimMm: { w: s.widthMm, h: s.heightMm },
    bleedMm: BLEED_MM,
    safeMarginMm: SAFE_MARGIN_MM,
    dpi: d,
    pixels: { w: trimW + bleedPx * 2, h: trimH + bleedPx * 2 },
    trimPixels: { w: trimW, h: trimH },
    safeBoxPixels: { x: bleedPx + safePx, y: bleedPx + safePx, w: trimW - safePx * 2, h: trimH - safePx * 2 },
    notes: [
      `${s.widthMm}×${s.heightMm}mm trimmed, plus ${BLEED_MM}mm bleed on every side — background artwork must run into the bleed or a white sliver shows on the cut edge.`,
      `Keep text and the logo inside the safe box (${SAFE_MARGIN_MM}mm in from the trim); guillotines drift by a millimetre or two.`,
      `Exported at ${d} DPI in RGB. Most online printers convert to CMYK themselves, but a bright RGB blue or orange will shift when they do — ask your printer, and expect the printed colour to be duller than the screen.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// The flyer itself
//
// A flyer fails for one of three boring reasons: nobody can read it from where
// they are standing, it does not say what to do next, or the QR code is too
// small to scan. So the plan checks those three things instead of describing a
// mood.
// ---------------------------------------------------------------------------

// A QR code is scanned from about arm's length. The practical rule printers use
// is that the code should be roughly a tenth of the scanning distance — 30cm
// away means about 3cm of code. 20mm is the floor below which cheap phone
// cameras start failing in poor light. Both are conventions, not measurements.
export const QR_MIN_MM = 20;
export const QR_RECOMMENDED_MM = 30;

export type FlyerBlock = { role: "headline" | "subhead" | "proof" | "offer" | "cta" | "contact"; text: string; maxChars: number; over: boolean };

export type FlyerPlan = {
  spec: PrintSpec;
  blocks: FlyerBlock[];
  qr: { target: string; sizeMm: number; sizePx: number; ok: boolean; note: string } | null;
  warnings: string[];
  readableFrom: string;
  checklist: string[];
};

// Character budgets that hold at a readable point size for each format. They are
// derived from the width, not guessed: a headline at a size readable from the
// stated distance fits roughly this many characters across the safe box.
const HEADLINE_CHARS_PER_MM = 0.14;   // ~20 characters across an A5's 138mm safe width

export function flyerPlan(input: {
  sizeId: string;
  headline: string;
  subhead?: string;
  proof?: string;         // a real review line, a real number, a real credential
  offer?: string;
  cta?: string;
  contact?: string;       // phone / address / opening hours
  qrTarget?: string;      // where the code goes — the site, the menu, the review link
  qrSizeMm?: number;
  dpi?: number;
}): { ok: false; error: string } | { ok: true; plan: FlyerPlan } {
  const spec = printSpec(input.sizeId, input.dpi);
  if (!spec) return { ok: false, error: `Unknown size "${input.sizeId}" — use ${PRINT_SIZES.map((s) => s.id).join(", ")}` };

  const safeWidthMm = spec.trimMm.w - SAFE_MARGIN_MM * 2;
  // How many characters of HEADLINE fit across the safe width at a size
  // readable from this format's distance — about 19 on an A5's 138mm.
  const perLine = Math.max(12, Math.round(safeWidthMm * HEADLINE_CHARS_PER_MM));
  // Two lines of headline, five of subhead, and so on — a flyer that needs more
  // words than this is a leaflet, and should be one.
  const budget: Record<FlyerBlock["role"], number> = {
    headline: perLine * 2,
    subhead: perLine * 5,
    proof: perLine * 4,
    offer: perLine * 2,
    cta: 40,
    contact: perLine * 4,
  };

  const raw: [FlyerBlock["role"], string | undefined][] = [
    ["headline", input.headline],
    ["subhead", input.subhead],
    ["proof", input.proof],
    ["offer", input.offer],
    ["cta", input.cta],
    ["contact", input.contact],
  ];
  const blocks: FlyerBlock[] = raw
    .filter(([, t]) => (t || "").trim().length > 0)
    .map(([role, t]) => {
      const text = (t as string).trim();
      return { role, text, maxChars: budget[role], over: text.length > budget[role] };
    });

  const warnings: string[] = [];
  if (!input.headline || !input.headline.trim()) warnings.push("No headline. A flyer with no headline is read as junk mail and binned in the hallway.");
  for (const b of blocks) {
    if (b.over) warnings.push(`The ${b.role} is ${b.text.length} characters and ${b.maxChars} fit at a readable size on ${spec.label} — it will either be shrunk until nobody reads it or run outside the safe area.`);
  }
  if (!blocks.some((b) => b.role === "cta")) warnings.push("No call to action. The commonest reason a flyer produces nothing is that it never says what to do next.");
  if (!blocks.some((b) => b.role === "contact") && !input.qrTarget) warnings.push("No phone number, address or QR code — there is no way to act on this flyer.");

  let qr: FlyerPlan["qr"] = null;
  if (input.qrTarget && input.qrTarget.trim()) {
    const sizeMm = Math.max(5, Math.round(input.qrSizeMm || QR_RECOMMENDED_MM));
    const ok = sizeMm >= QR_MIN_MM;
    if (!ok) warnings.push(`The QR code is ${sizeMm}mm. Below ${QR_MIN_MM}mm phone cameras start failing in the light a flyer is actually read in.`);
    qr = {
      target: input.qrTarget.trim(),
      sizeMm,
      sizePx: mmToPx(sizeMm, spec.dpi),
      ok,
      note: `Print it with a quiet zone of at least four modules of white around it, and test the printed one — not the screen one — with two different phones before ordering the run.`,
    };
  }

  // Reading distance follows the format. This is what the size is FOR, and it is
  // the thing people get wrong when they design an A3 poster in an A5 layout.
  const readableFrom =
    spec.id === "a3" ? "across a room — about 3 metres"
    : spec.id === "a4" ? "standing at a noticeboard — about 1 metre"
    : spec.id === "a5" ? "in the hand or across a table — about 40cm"
    : "in the hand — about 30cm";

  return {
    ok: true,
    plan: {
      spec,
      blocks,
      qr,
      warnings,
      readableFrom,
      checklist: [
        `Export at ${spec.pixels.w}×${spec.pixels.h}px (${spec.dpi} DPI, includes ${BLEED_MM}mm bleed).`,
        `Everything that matters inside ${spec.safeBoxPixels.w}×${spec.safeBoxPixels.h}px, centred.`,
        `Designed to be read from ${readableFrom} — hold a print at that distance before you order 5,000.`,
        input.qrTarget ? "Scan the printed QR code with two phones before the run." : "No QR code: make sure the phone number is the largest thing after the headline.",
        "Print one proof copy first. A colour shift or a cropped logo costs nothing to fix on one sheet and everything on a pallet.",
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Local groups
// ---------------------------------------------------------------------------
export type GroupKindId = "facebook-group" | "nextdoor" | "whatsapp-community" | "reddit-local" | "noticeboard" | "local-forum";

export type GroupKind = {
  id: GroupKindId;
  label: string;
  // What these groups' rules almost always say. Breaking them gets the post
  // removed and the member banned, which costs more than the post was worth.
  rules: string[];
  // Can anything be automated? Answered honestly per platform.
  automation: string;
  cadence: string;
};

export const GROUP_KINDS: GroupKind[] = [
  {
    id: "facebook-group",
    label: "Facebook local group",
    rules: [
      "Most local groups ban advertising outright, or confine it to one promo day a week — read the pinned rules before posting, every time.",
      "Admin approval is usually on. A post that reads like an advert is rejected; one that answers a question in the group is not.",
      "Post from your personal profile as a member. Posting as a Page into a community group is the fastest route to removal.",
    ],
    automation:
      "None available. Meta's Groups API only permits posting into a group that has installed your app, so no third-party tool can publish into a neighbourhood group — the ones that claim to are driving an unofficial session and get the account restricted.",
    cadence: "Once a week at most per group, and only on the day the rules allow. Two posts in a week from the same business is what gets a member banned.",
  },
  {
    id: "nextdoor",
    label: "Nextdoor",
    rules: [
      "Businesses post from a Business Page; posting a promotion from a neighbour account breaches the guidelines.",
      "Nextdoor verifies addresses, so the neighbourhood you post into must be one you actually serve.",
      "Recommendations from neighbours carry the weight here — asking for one is normal, buying one is not.",
    ],
    automation: "No third-party posting API for neighbourhood posts. Drafts are posted by hand.",
    cadence: "Roughly fortnightly. Nextdoor feeds are small and a business that appears constantly is muted.",
  },
  {
    id: "whatsapp-community",
    label: "WhatsApp community / neighbourhood group",
    rules: [
      "Only post where you are a genuine member and the admin permits business posts.",
      "One message, no follow-up chasers — an unread message in a group of 200 cannot be re-sent politely.",
      "Bulk-adding numbers to a group without permission breaches WhatsApp's terms and gets the number banned.",
    ],
    automation: "The WhatsApp Business API sends to people who messaged you or opted in — it does not post into community groups. That part is manual by design.",
    cadence: "Once a month unless there is real news.",
  },
  {
    id: "reddit-local",
    label: "Local subreddit",
    rules: [
      "Nearly every city subreddit bans self-promotion outside a weekly thread; check the sidebar and the wiki.",
      "An account with no history posting a business link is removed as spam by automod before a human sees it.",
      "Disclose that it is your business. Not disclosing is against Reddit's rules and the FTC's endorsement guides.",
    ],
    automation: "Reddit's API permits posting, but posting promotional content programmatically into local subs is what the spam filters exist for. Draft here, post as yourself.",
    cadence: "Only in the designated thread, at the designated interval.",
  },
  {
    id: "noticeboard",
    label: "Physical noticeboard (shop, library, café, gym)",
    rules: [
      "Ask the owner. A card put up without asking is taken down the same day.",
      "A4 is the format that survives on a crowded board; anything smaller disappears.",
      "Date it and take it down yourself when it expires — the businesses that do get to put the next one up.",
    ],
    automation: "None, obviously. This is the one channel where nobody else is automating either, which is why it still works.",
    cadence: "Refresh monthly so it does not go yellow and stop being read.",
  },
  {
    id: "local-forum",
    label: "Local forum / community website",
    rules: [
      "Sponsorship and a business listing are usually welcome; unmarked promotion usually is not.",
      "Many local sites will run a genuine piece about a local business — that is an editorial ask, not a post.",
    ],
    automation: "None. Approach the site owner directly.",
    cadence: "Once, properly, rather than repeatedly.",
  },
];

export const groupKind = (id: string): GroupKind | null => GROUP_KINDS.find((g) => g.id === id) || null;

export type GroupPost = {
  kind: GroupKindId;
  label: string;
  post: string;
  chars: number;
  rules: string[];
  automation: string;
  cadence: string;
  warnings: string[];
};

// The words that turn a community post into an advert, which is what gets it
// removed. Flagged rather than stripped: the customer may have a good reason,
// and a silently rewritten post is a post they did not write.
const ADVERT_RE = /\b(limited time|act now|don'?t miss|hurry|best in town|number one|unbeatable|cheapest|guaranteed|click here|dm me now)\b/i;

export function draftGroupPost(input: {
  kindId: string;
  brandName: string;
  town?: string;
  what: string;              // what the business does, in the owner's words
  offer?: string;
  link?: string;
  personalNote?: string;     // why they are a member of this group
}): { ok: false; error: string } | { ok: true; post: GroupPost } {
  const g = groupKind(input.kindId);
  if (!g) return { ok: false, error: `Unknown group type "${input.kindId}" — use ${GROUP_KINDS.map((k) => k.id).join(", ")}` };

  const brand = (input.brandName || "our business").trim();
  const town = (input.town || "").trim();
  const what = (input.what || "").trim();
  const where = town ? ` in ${town}` : "";

  // A local-group post that works reads like a neighbour talking, opens by
  // saying who you are, and asks for nothing on the first line.
  const lines: string[] = [];
  lines.push(input.personalNote?.trim() || `Hello — I run ${brand}${where}.`);
  if (what) lines.push(what);
  if (input.offer?.trim()) lines.push(input.offer.trim());
  if (input.link?.trim()) lines.push(input.link.trim());
  lines.push(
    g.id === "noticeboard"
      ? `Ask for us by name — we are local and we will look after you.`
      : `Happy to answer anything in the comments. If the admins would rather this went in the weekly thread, tell me and I will move it.`
  );
  const post = lines.join("\n\n");

  const warnings: string[] = [];
  const adv = post.match(ADVERT_RE);
  if (adv) warnings.push(`"${adv[0]}" is advert language — in a community group that is what gets a post removed and a member banned. Say the plain thing instead.`);
  if (!what) warnings.push("The post does not say what the business actually does, so nobody reading it knows what they are being offered.");
  if (post.length > 1200) warnings.push("Over 1,200 characters — group posts are collapsed behind a 'See more' after a few lines, so the ask must be in the first three.");

  return {
    ok: true,
    post: { kind: g.id, label: g.label, post, chars: post.length, rules: g.rules, automation: g.automation, cadence: g.cadence, warnings },
  };
}

// ---------------------------------------------------------------------------
// Followers, honestly
// ---------------------------------------------------------------------------
export const FOLLOWER_DOCTRINE =
  "Followers are not bought here. Every feed ranks by engagement RATE, so " +
  "accounts that never engage divide the same engagement across a larger " +
  "denominator and the page is shown to fewer real people than before — the " +
  "purchase makes the reach worse, before any enforcement. Meta, TikTok and " +
  "X all treat purchased followers as inauthentic behaviour and act against " +
  "the page that holds them.";

export type FollowerPlay = { play: string; where: string; effort: "low" | "medium" | "high"; why: string };

// What actually produces local followers, in the order a small business can do
// them. No projected numbers: nobody can forecast a follower count for a
// business they have not measured, and a forecast presented as a plan is the
// same defect as a bought follower — a number that was invented.
export function followerPlays(input: { hasFlyer?: boolean; hasReviews?: boolean; hasStaff?: boolean }): FollowerPlay[] {
  const plays: FollowerPlay[] = [
    { play: "Put the QR code to your page on the flyer, the receipt, the bag and the window", where: "print + premises", effort: "low", why: "The people who already chose you once are the cheapest followers you will ever get, and they are local by definition." },
    { play: "Post the review requests that are already due", where: "Reputation → Review requests", effort: "low", why: "A customer who has just written about you is a customer who will follow you. The request and the follow ask travel in the same message." },
    { play: "Answer questions in the local groups you are a member of, without selling", where: "Local groups", effort: "medium", why: "Groups are where a neighbourhood asks 'can anyone recommend…'. The business that answered three of those is the one named the fourth time." },
    { play: "Post what happens in the business, not what you sell", where: "Any platform", effort: "medium", why: "Local follows are for people, not catalogues. The kitchen at 6am outperforms the product shot in every local account." },
    { play: "Ask, out loud, at the counter", where: "In person", effort: "low", why: "The single highest-converting follow request is a person asking a person who is already standing there." },
  ];
  if (input.hasFlyer === false) plays.unshift({ play: "Make the flyer first — there is nothing to put the QR code on yet", where: "Local → Flyers", effort: "medium", why: "Every other play here assumes something physical with a code on it." });
  if (input.hasStaff === false) plays.splice(plays.length - 1, 1);
  return plays;
}
