// THE SALES DECK, BUILT FROM THE PRODUCT'S OWN NUMBERS.
//
// Every figure on every slide is read from the engines at build time — plan
// prices from `subscription.ts`, the check count from `audit-copy.ts`, the agent
// count from `agents.ts`. Nothing here is typed by hand, because a deck that
// says £49 while the pricing page says something else is the exact defect this
// codebase has a dozen tests against.
//
// It also refuses the two things a sales deck usually leans on: there are no
// customer logos, no testimonials, no ROI multiples and no "3x more leads". The
// landing page already says why — "We're new, so we don't publish invented
// reviews or made-up numbers" — and a deck that broke that rule would contradict
// the product's whole argument on the way to selling it. Slide 10 turns that
// into the close rather than hiding it.
//
// Run: NODE_PATH=<where pptxgenjs is> node --import tsx scripts/build-sales-deck.mjs

// pptxgenjs is NOT a dependency of the app and must not become one: this script
// generates a one-off marketing artefact, and adding it to package.json would put
// it in every `npm ci`, CI's included, for a file that changes twice a year.
//
// Resolved through `createRequire`, which honours NODE_PATH — so it is found
// wherever it happens to be installed without this script reading an environment
// variable of its own. A new env var would have to be registered in
// `shared/env-catalogue.ts`, and the platform's registry is for things a
// DEPLOYMENT needs, not for a local build convenience. The catalogue test caught
// exactly that and was right to.
//
//   npm i pptxgenjs --prefix /tmp/deckbuild
//   NODE_PATH=/tmp/deckbuild/node_modules node --import tsx scripts/build-sales-deck.mjs
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
let pptxgen;
try {
  pptxgen = require_("pptxgenjs");
} catch {
  console.error("pptxgenjs is not installed or not on NODE_PATH. See the note at the top of this file.");
  process.exit(1);
}
import { allPlanEconomics, ACU_PER_GBP, ANNUAL_DISCOUNT, ACU_ALLOCATION_RATE } from "../src/backend/subscription.ts";
import { auditCheckCount, AUDIT_AREAS } from "../src/shared/audit-copy.ts";
import { AGENTS } from "../src/shared/agents.ts";

// ---------------------------------------------------------------------------
// The real numbers.
// ---------------------------------------------------------------------------
const CHECKS = auditCheckCount();
const AREAS = AUDIT_AREAS.length;
const AGENT_COUNT = Object.keys(AGENTS).length;
const PLANS = allPlanEconomics();
const planBy = (id) => PLANS.find((p) => p.id === id);
const gbp = (n) => `£${Number(n).toLocaleString("en-GB")}`;

// ---------------------------------------------------------------------------
// THE BRAND, AND IT IS NOT A TEMPLATE PALETTE.
//
// Near-black ground with ONE accent: brass #BE9247 — a struck, desaturated
// metal. It is the product's real accent, chosen in globals.css precisely
// because it is not the emerald-and-violet every generated interface arrives in,
// and the deck inherits it rather than picking a mood.
// ---------------------------------------------------------------------------
const INK = "0A0A0B";        // the ground, 60-70% of every slide
const INK_CARD = "151516";   // raised surface
const INK_LINE = "2A2A2C";   // hairline
const BRASS = "BE9247";      // the one accent
const BRASS_LT = "DABE81";   // large type in the accent
const TEXT = "EFEFED";       // primary
const MUTED = "9C9C97";      // secondary
const DIM = "7A7A75";        // captions

const H = "Arial";           // display — safe list, true-to-width in QA
const B = "Calibri";         // body
const M = "Courier New";     // the mono the product sets every figure in

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";           // 13.3 x 7.5 — set BEFORE any slide
pres.author = "MarketWar OS";
pres.company = "MarketWar OS";
pres.title = "MarketWar OS — sales presentation";

const W = 13.3, HT = 7.5, M_X = 0.7;

// --- small builders. Each returns FRESH option objects: pptxgenjs mutates them.
const slide = (bg = INK) => {
  const s = pres.addSlide();
  s.background = { color: bg };
  return s;
};

/** The eyebrow every content slide opens with — mono, brass, tiny, tracked. */
const eyebrow = (s, text, y = 0.52) =>
  s.addText(text.toUpperCase(), {
    x: M_X, y, w: 8, h: 0.28, isTextBox: true, margin: 0,
    fontFace: M, fontSize: 10.5, bold: true, color: BRASS, charSpacing: 2.2,
  });

const title = (s, text, opts = {}) =>
  s.addText(text, {
    // 1.55in, not 1.25: two lines at 45pt spacing measure 1.25in EXACTLY, so
    // the box had zero slack and any font substitution pushed the second line
    // out of it. Content starts at 2.5in, so the extra height costs nothing.
    x: M_X, y: 0.92, w: opts.w ?? 11.9, h: opts.h ?? 1.55, isTextBox: true, margin: 0,
    fontFace: H, fontSize: opts.size ?? 40, bold: true, color: TEXT,
    lineSpacing: opts.size ? opts.size * 1.12 : 45, ...(opts.extra || {}),
  });

/** THE MOTIF: a brass-ruled card. A tint and a hairline, never an edge stripe. */
const card = (s, x, y, w, h) =>
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: INK_CARD }, line: { color: INK_LINE, width: 0.75 },
  });

/** The repeated marker: a number or glyph inside a brass-outlined circle. */
const disc = (s, x, y, label, d = 0.46) => {
  s.addShape(pres.ShapeType.ellipse, {
    x, y, w: d, h: d, fill: { color: INK }, line: { color: BRASS, width: 1.1 },
  });
  s.addText(String(label), {
    x, y, w: d, h: d, isTextBox: true, margin: 0,
    fontFace: M, fontSize: 12, bold: true, color: BRASS, align: "center", valign: "middle",
  });
};

const foot = (s, text) =>
  s.addText(text, {
    x: M_X, y: HT - 0.62, w: 11.9, h: 0.3, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 10, color: DIM,
  });

// ===========================================================================
// 1 — TITLE. The landing page's own line, because it is the best one we have.
// ===========================================================================
{
  const s = slide();
  s.addText("MARKETWAR OS", {
    x: M_X, y: 1.5, w: 8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: M, fontSize: 11.5, bold: true, color: BRASS, charSpacing: 3.4,
  });
  s.addText(
    [
      { text: "You spent the money.", options: { color: TEXT, breakLine: true } },
      { text: "Nobody can tell you", options: { color: BRASS_LT, breakLine: true } },
      { text: "where it went.", options: { color: BRASS_LT } },
    ],
    { x: M_X, y: 2.15, w: 9.4, h: 2.9, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 52, bold: true, lineSpacing: 58 },
  );
  s.addText(
    "An AI customer-acquisition operating system for small and mid-sized businesses. It reads your actual page, tells you what is costing you enquiries, then does the work — and refuses to publish a number it cannot measure.",
    { x: M_X, y: 5.25, w: 8.5, h: 1.0, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 15, color: MUTED, lineSpacing: 22 },
  );
  s.addText("www.marketwaros.com", {
    x: M_X, y: 6.5, w: 6, h: 0.3, isTextBox: true, margin: 0,
    fontFace: M, fontSize: 11.5, color: BRASS,
  });
  s.addNotes("Open on the problem, not the product. Every business in the room has spent money on marketing and cannot account for it. Do not describe features yet.");
}

// ===========================================================================
// 2 — THE PROBLEM. Three costs, as stat callouts.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "The situation");
  title(s, "Three things are true of almost\nevery business we look at.");

  const items = [
    ["Your site leaks", "Enquiries are lost to faults nobody has named: no way to make contact on the page somebody landed on, a title that says nothing, structured data absent. Invisible from the inside."],
    ["Your agency reports activity", "Posts published, impressions delivered, hours billed. None of that is a sale, and none of it says which pound produced one."],
    ["AI answers now, not links", "When somebody asks an assistant who to use, it names businesses. If it cannot read your page, you are not in the answer — and your ranking has nothing to do with it."],
  ];
  items.forEach(([h, body], i) => {
    const x = M_X + i * 4.06;
    card(s, x, 2.55, 3.76, 3.5);
    disc(s, x + 0.32, 2.9, i + 1);
    s.addText(h, { x: x + 0.32, y: 3.55, w: 3.1, h: 0.62, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 17, bold: true, color: TEXT, lineSpacing: 21 });
    s.addText(body, { x: x + 0.32, y: 4.28, w: 3.14, h: 1.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: MUTED, lineSpacing: 17 });
  });
  foot(s, "None of the three shows up in a monthly report. All three cost money every day.");
  s.addNotes("Let each land. The third is the one nobody in the room has a plan for — it is the wedge for slide 6.");
}

// ===========================================================================
// 3 — THE PROOF. The free audit, which is the whole wedge.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "Start here — before you pay anything");
  title(s, "Put your address in. Get the truth\nabout your own page in 15 seconds.");

  // The three stats are pulled left so the card beside them finishes INSIDE the
  // 0.5in margin. The first version ran the card to x=13.30 — the full slide
  // width — which the geometry check caught as touching the edge.
  const stats = [
    [String(CHECKS), "checks on your real page"],
    [String(AREAS), "scored areas, separately"],
    ["£0", "no account, no card"],
  ];
  stats.forEach(([n, l], i) => {
    const x = M_X + i * 2.62;
    s.addText(n, { x, y: 2.75, w: 2.45, h: 1.0, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 58, bold: true, color: BRASS_LT });
    s.addText(l, { x, y: 3.78, w: 2.45, h: 0.7, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: MUTED, lineSpacing: 16 });
  });

  card(s, 8.72, 2.62, 3.88, 2.35);
  s.addText("It reads YOUR page.", { x: 9.02, y: 2.9, w: 3.3, h: 0.4, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 15, bold: true, color: BRASS });
  s.addText("Not a database of averages, not an industry benchmark. It fetches the page, follows your contact links, and names every page it read.",
    { x: 9.02, y: 3.36, w: 3.3, h: 1.45, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: MUTED, lineSpacing: 16 });

  s.addText(
    `Every finding carries three things: what it is, what it is costing you in enquiries, and the fix. ${AUDIT_AREAS.join("  ·  ")}.`,
    { x: M_X, y: 5.2, w: 11.9, h: 0.8, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, color: TEXT, lineSpacing: 19 },
  );
  foot(s, "marketwaros.com/audit — the valuable thing is on the outside of the login, on purpose.");
  s.addNotes("If there is a laptop in the room, run it live on their domain. The deck is the backup, not the demo.");
}

// ===========================================================================
// 4 — WHAT IT ACTUALLY SAYS. Specificity is the persuasion.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "What a finding looks like");
  title(s, "Not a score out of 100.\nA diagnosis you can act on.");

  const rows = [
    ["No way to make contact", "Somebody ready to buy has to hunt for a phone number or an email. Most do not.", "Add a tel: link and an email link above the fold, on every page."],
    ["Invisible to AI assistants", "Your robots.txt blocks the crawlers that feed ChatGPT, Claude and Gemini. It usually arrived in a template.", "Allow the named AI crawlers. Google-Extended does not affect your search ranking at all."],
    ["The page arrives empty", "The text fills in once scripts run. Google renders; most assistant crawlers read the HTML as it comes.", "Serve the copy in the HTML so it is there before anything executes."],
  ];
  rows.forEach(([h, cost, fix], i) => {
    const y = 2.5 + i * 1.42;
    card(s, M_X, y, 11.9, 1.24);
    s.addText(h, { x: M_X + 0.34, y: y + 0.18, w: 3.5, h: 0.4, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 14.5, bold: true, color: TEXT });
    s.addText([{ text: "COSTS  ", options: { color: BRASS, bold: true, fontFace: M, fontSize: 9 } },
               { text: cost, options: { color: MUTED, fontFace: B, fontSize: 11.5 } }],
      { x: M_X + 0.34, y: y + 0.63, w: 5.4, h: 0.5, isTextBox: true, margin: 0, lineSpacing: 15 });
    s.addText([{ text: "FIX  ", options: { color: BRASS, bold: true, fontFace: M, fontSize: 9 } },
               { text: fix, options: { color: MUTED, fontFace: B, fontSize: 11.5 } }],
      { x: M_X + 6.1, y: y + 0.63, w: 5.5, h: 0.5, isTextBox: true, margin: 0, lineSpacing: 15 });
  });
  foot(s, "A check it could not read is reported as unknown — never counted against you as a zero.");
  s.addNotes("The 'counted as unknown' line matters to sceptics: it proves the score is not padded.");
}

// ===========================================================================
// 5 — IT DOES THE WORK. The agents.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "Then it does something about it");
  title(s, `${AGENT_COUNT} agents that do the job,\nnot ${AGENT_COUNT} chatbots that describe it.`);

  const cols = [
    ["Find", ["Opportunity discovery", "Competitor intelligence", "Ideal-customer profile", "Keyword + prompt universes"]],
    ["Make", ["Ads, emails, landing pages", "Images and brand content", "Vertical clips from long video", "Print-ready flyers, in millimetres"]],
    ["Send", ["Email from your own domain", "Social publishing", "WhatsApp funnels", "Review requests, where permitted"]],
    ["Prove", ["Money ledger, recorded revenue only", "Per-agent cost and impact", "Attribution, or an honest null", "Emergency stop on spend"]],
  ];
  cols.forEach(([h, items], i) => {
    const x = M_X + i * 3.03;
    card(s, x, 2.5, 2.78, 3.5);
    s.addText(h.toUpperCase(), { x: x + 0.28, y: 2.78, w: 2.2, h: 0.34, isTextBox: true, margin: 0,
      fontFace: M, fontSize: 11, bold: true, color: BRASS, charSpacing: 1.8 });
    s.addText(items.map((t, k) => ({ text: t, options: { breakLine: k < items.length - 1 } })),
      { x: x + 0.28, y: 3.22, w: 2.24, h: 2.5, isTextBox: true, margin: 0, bullet: true,
        fontFace: B, fontSize: 11.5, color: MUTED, paraSpaceAfter: 8, lineSpacing: 15 });
  });
  foot(s, "They draft. Anything that would spend, send or publish waits for you.");
  s.addNotes("The last line is the objection-killer for anyone who has been burned by automation.");
}

// ===========================================================================
// 6 — THE AI-SEARCH PLAY. The differentiated, timely one.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "The one nobody else is measuring");
  // 34pt, not 40: this title shares the slide with the card at x=8.05, so it has
  // 7.2in rather than the full width, and at 40pt the second line wrapped to
  // four lines and overflowed. Shorter line, smaller size, same point.
  title(s, "Your customers now ask\nan assistant, not Google.", { w: 7.2, size: 34 });

  s.addText(
    "When somebody asks ChatGPT, Claude or Gemini who to use, the answer is assembled from pages the assistant's crawler was allowed to fetch and could actually read. A site can rank perfectly on Google and be completely absent from that answer.",
    { x: M_X, y: 2.6, w: 6.9, h: 1.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, color: MUTED, lineSpacing: 21 },
  );
  s.addText("We check whether ten named AI crawlers can read you — by parsing your robots.txt, not by pattern-matching it — and we say what to change.",
    { x: M_X, y: 4.35, w: 6.9, h: 1.1, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 14, color: TEXT, lineSpacing: 21 });

  card(s, 8.05, 2.5, 4.55, 3.55);
  s.addText("What we will NOT claim", { x: 8.38, y: 2.82, w: 3.9, h: 0.36, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 15, bold: true, color: BRASS });
  s.addText(
    "That you are being cited, or how often, or for which questions. Answering that means asking the assistants, which costs real AI calls and belongs to the paid engines.\n\nThe free audit answers the narrow, measurable question — CAN they read you — and says so in exactly those words.",
    { x: 8.38, y: 3.3, w: 3.9, h: 2.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: MUTED, lineSpacing: 17 },
  );
  foot(s, "Google-Extended is the one most often blocked by accident — it changes nothing about your search ranking.");
  s.addNotes("This is the slide that separates us from every SEO tool in the room. Timely, specific, and honestly bounded.");
}

// ===========================================================================
// 7 — YOUR OWN SENDING INFRASTRUCTURE.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "Email, without a third party in the middle");
  title(s, "Sent as your domain.\nSigned by your keys.");

  const facts = [
    ["Your domain", "SPF, DKIM and DMARC on your own sending domain — so mail arrives as you, not as a platform forwarding on your behalf."],
    ["A reputation governor", "The daily limit is the lower of the published ramp and what your own record has earned. It holds when bounces or complaints rise, and stops at the line Gmail filters on."],
    ["Consent in the send path", "A send without granted consent is refused. Hard bounces and complaints go on a suppression ledger and are never retried."],
  ];
  facts.forEach(([h, body], i) => {
    const y = 2.55 + i * 1.28;
    disc(s, M_X, y + 0.06, i + 1, 0.42);
    s.addText(h, { x: M_X + 0.68, y, w: 3.3, h: 0.42, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 15.5, bold: true, color: TEXT });
    s.addText(body, { x: M_X + 4.15, y: y - 0.03, w: 7.7, h: 1.0, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: MUTED, lineSpacing: 17 });
  });
  foot(s, "Target bounce rate under 0.5% — six times inside the Gmail and Yahoo bulk-sender threshold.");
  s.addNotes("For anyone who has had a domain burned by a cheap blast tool, the governor is the whole pitch.");
}

// ===========================================================================
// 8 — THE STACK IT REPLACES.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "One bill");
  title(s, "The tools you are already\npaying for, included.");

  const kit = ["Website audit + SEO workbench", "Email sending + automation", "Social publishing + scheduling",
               "Ad creative + resizing", "Landing pages", "Competitor intelligence",
               "Review requests", "Creator + affiliate programme", "Video clipping + captions"];
  kit.forEach((t, i) => {
    const x = M_X + (i % 3) * 4.06;
    const y = 2.55 + Math.floor(i / 3) * 0.92;
    card(s, x, y, 3.76, 0.74);
    s.addText(t, { x: x + 0.3, y, w: 3.2, h: 0.74, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: TEXT, valign: "middle" });
  });
  s.addText(
    `Every engine behind one subscription, priced in credits. £1 = ${ACU_PER_GBP} ACUs, ${Math.round(ACU_ALLOCATION_RATE * 100)}% of what you pay comes back as credits each month, and you top up only what you use.`,
    { x: M_X, y: 5.55, w: 11.9, h: 0.7, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 13.5, color: MUTED, lineSpacing: 19 },
  );
  foot(s, "Add up what those nine cost you separately. That is the comparison we want you to make.");
  s.addNotes("Ask them to name their current stack out loud and total it. The number is always bigger than they expect.");
}

// ===========================================================================
// 9 — PRICING. Real, from the engine.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "What it costs");
  title(s, "Start free. Pay when it works.");

  const show = ["free", "starter", "growth", "scale", "business"].map(planBy).filter(Boolean);
  const blurb = {
    free: "Diagnose, and try the whole OS.",
    starter: "Your first real campaigns.",
    growth: "The full acquisition machine.",
    scale: "Multi-brand operators.",
    business: "Agencies and franchises.",
  };
  show.forEach((p, i) => {
    const x = M_X + i * 2.44;
    const hero = p.id === "growth";
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 2.5, w: 2.22, h: 3.3, rectRadius: 0.08,
      fill: { color: hero ? "1F1A12" : INK_CARD },
      line: { color: hero ? BRASS : INK_LINE, width: hero ? 1.4 : 0.75 },
    });
    s.addText(p.name.toUpperCase(), { x: x + 0.24, y: 2.76, w: 1.8, h: 0.3, isTextBox: true, margin: 0,
      fontFace: M, fontSize: 10, bold: true, color: hero ? BRASS : DIM, charSpacing: 1.6 });
    s.addText(p.monthlyGbp === 0 ? "£0" : gbp(p.monthlyGbp), {
      x: x + 0.24, y: 3.12, w: 1.85, h: 0.72, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 34, bold: true, color: hero ? BRASS_LT : TEXT });
    s.addText(p.monthlyGbp === 0 ? "for ever" : "per month", {
      x: x + 0.24, y: 3.84, w: 1.8, h: 0.26, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 10.5, color: DIM });
    s.addText(p.monthlyGbp === 0 ? "100 credits to start" : `${p.monthlyAcus.toLocaleString("en-GB")} credits / month`, {
      x: x + 0.24, y: 4.2, w: 1.85, h: 0.4, isTextBox: true, margin: 0,
      fontFace: M, fontSize: 10, color: hero ? BRASS : MUTED });
    s.addText(blurb[p.id], { x: x + 0.24, y: 4.68, w: 1.8, h: 0.9, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11, color: MUTED, lineSpacing: 15 });
  });
  s.addText(
    `Annual billing takes ${Math.round(ANNUAL_DISCOUNT * 100)}% off. Three larger tiers run to ${gbp(planBy("global").monthlyGbp)} a month for networks and multi-market operators. No card to start, and nothing to cancel if you stop.`,
    { x: M_X, y: 6.05, w: 11.9, h: 0.6, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12.5, color: MUTED, lineSpacing: 18 },
  );
  s.addNotes(`Prices read from subscription.ts at build time. Growth at ${gbp(planBy("growth").monthlyGbp)} is the tier to steer toward — it is the first with the full agent workforce.`);
}

// ===========================================================================
// 10 — THE TRUST CLOSE. Everything we refuse to do.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "Why you should believe any of this");
  title(s, "We are new. So here is what\nwe will not do to win you.");

  const refusals = [
    ["No invented reviews", "There are no testimonials in this deck and none on the site, because we do not have customers to quote yet. Every competitor's wall of five-star cards cost them nothing to make."],
    ["No made-up numbers", "No 3x, no 40% uplift, no case study with a rounded figure and no method. If we cannot measure it on your account, it does not get printed."],
    ["A rate we cannot support is withheld", "When the ledger cannot prove an open rate, the platform prints \"not computable\" and says why — instead of a number that looks better."],
    ["The audit says what it could not read", "A check it failed to measure is reported as unknown, never counted against you as a zero. Those want opposite actions."],
  ];
  refusals.forEach(([h, body], i) => {
    const x = M_X + (i % 2) * 6.1;
    const y = 2.5 + Math.floor(i / 2) * 1.85;
    card(s, x, y, 5.8, 1.62);
    s.addText(h, { x: x + 0.32, y: y + 0.2, w: 5.1, h: 0.36, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 14.5, bold: true, color: BRASS });
    s.addText(body, { x: x + 0.32, y: y + 0.62, w: 5.16, h: 0.9, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 11.5, color: MUTED, lineSpacing: 16 });
  });
  foot(s, "Everything above is enforced in the code, not promised in a policy.");
  s.addNotes("This is the close, not a disclaimer. Say it with confidence — it is the strongest thing we own against an incumbent.");
}

// ===========================================================================
// 11 — HOW YOU START.
// ===========================================================================
{
  const s = slide();
  eyebrow(s, "Three steps, and the first one is free");
  title(s, "You can test the claim\nbefore you speak to us.");

  const steps = [
    ["Run the audit", "Put your address into marketwaros.com/audit. No account, no card. Read what it says about your own page."],
    ["Judge it on your own site", "You know your business better than any tool. If the findings are wrong, you will know in seconds — and you will have lost nothing."],
    ["Start free", `The free tier gives you 100 credits and the whole platform to explore. ${gbp(planBy("growth").monthlyGbp)} a month is where the full ${AGENT_COUNT}-agent workforce turns on, and you upgrade only when it has earned it.`],
  ];
  steps.forEach(([h, body], i) => {
    const x = M_X + i * 4.06;
    card(s, x, 2.55, 3.76, 3.2);
    disc(s, x + 0.32, 2.9, i + 1);
    s.addText(h, { x: x + 0.32, y: 3.55, w: 3.1, h: 0.42, isTextBox: true, margin: 0,
      fontFace: H, fontSize: 16.5, bold: true, color: TEXT });
    s.addText(body, { x: x + 0.32, y: 4.06, w: 3.14, h: 1.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 12, color: MUTED, lineSpacing: 17 });
  });
  foot(s, "Nothing published, sent or spent without your approval — at any tier.");
  s.addNotes("Hand them the audit URL on paper or by text before leaving the room. The wedge only works if they actually run it.");
}

// ===========================================================================
// 12 — CLOSE.
// ===========================================================================
{
  const s = slide();
  s.addText("MARKETWAR OS", {
    x: M_X, y: 1.45, w: 8, h: 0.3, isTextBox: true, margin: 0,
    fontFace: M, fontSize: 11.5, bold: true, color: BRASS, charSpacing: 3.4,
  });
  s.addText([
    { text: "Find out what your", options: { color: TEXT, breakLine: true } },
    { text: "website is costing you.", options: { color: BRASS_LT } },
  ], { x: M_X, y: 2.0, w: 10, h: 1.9, isTextBox: true, margin: 0,
       fontFace: H, fontSize: 48, bold: true, lineSpacing: 55 });

  s.addText(`${CHECKS} checks on your real page. About fifteen seconds. No account, no card.`,
    { x: M_X, y: 4.05, w: 9, h: 0.5, isTextBox: true, margin: 0,
      fontFace: B, fontSize: 16, color: MUTED });

  s.addShape(pres.ShapeType.roundRect, {
    x: M_X, y: 4.85, w: 4.5, h: 0.78, rectRadius: 0.09,
    fill: { color: BRASS }, line: { color: BRASS, width: 1 },
  });
  s.addText("www.marketwaros.com/audit", {
    x: M_X, y: 4.85, w: 4.5, h: 0.78, isTextBox: true, margin: 0,
    fontFace: H, fontSize: 15, bold: true, color: INK, align: "center", valign: "middle",
  });
  s.addText("info@marketwaros.com", {
    x: M_X + 4.95, y: 4.85, w: 4, h: 0.78, isTextBox: true, margin: 0,
    fontFace: B, fontSize: 14, color: TEXT, valign: "middle",
  });
  s.addNotes("End on the offer, not on thanks. The audit is the only ask.");
}

const OUT = "docs/MarketWar-OS-Sales-Deck.pptx";
await pres.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT}`);
console.log(`Derived: ${CHECKS} checks · ${AREAS} areas · ${AGENT_COUNT} agents · Growth ${gbp(planBy("growth").monthlyGbp)}/mo`);
