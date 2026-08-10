import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import type { Metadata } from "next";

// Pages the product tells customers never to ship without a title and
// description — while shipping several itself. The pricing page is the
// sharpest: a search result for it had nothing but the site-wide default.
export const metadata: Metadata = {
  title: "How MarketWar OS works · From URL to running campaigns",
  description: "Paste your website. The OS audits the real page, builds your Business DNA, maps where you can win, then writes, publishes and measures the campaigns — with nothing published without your approval.",
  alternates: { canonical: "/how-it-works" },
  openGraph: { title: "How MarketWar OS works · From URL to running campaigns", description: "Paste your website. The OS audits the real page, builds your Business DNA, maps where you can win, then writes, publishes and measures the campaigns — with nothing published without your approval.", type: "website" },
};

const PHASES = [
  {
    phase: "Phase 1 — Brain Sync",
    title: "Tell the OS what you sell, who you want and where you operate",
    detail:
      "Ten questions build your Business Brain: product, pricing, margins, location, target customer, past spend and results — including the countries and cities you actually sell to. That target market is not decoration: it is what stops a report counting eleven thousand impressions as a result when most of them came from somewhere you cannot deliver to. You never need to be a marketer — the OS carries the strategy from here.",
  },
  {
    phase: "Phase 2 — Failure Diagnosis",
    title: "Find out exactly why past marketing produced nothing",
    detail:
      "The Marketing Failure Audit scores conversion risk, offer weakness, audience mismatch, trust, landing experience and follow-up readiness — then maps every leak in your funnel and names the top five reasons money was wasted.",
  },
  {
    phase: "Phase 3 — Offer Engineering",
    title: "Rebuild the offer until it forces action",
    detail:
      "The Offer Builder engineers volume, margin and recovery offers with deadlines and caps — each one arithmetic-checked for margin safety (it trims any discount that would breach your floor) before you launch it.",
  },
  {
    phase: "Phase 4 — Campaign Warfare",
    title: "Launch small-budget experiments with kill criteria locked",
    detail:
      "The Campaign Commander designs £15/day test plans: one offer, three hooks, a WhatsApp destination — with exact kill and scale numbers set before launch, so no losing ad survives on hope. Ad targeting, content localisation and trend watching all read the same target market, so a campaign is aimed where you sell rather than wherever reach is cheapest. Connect your ad accounts and it launches and manages them for you.",
  },
  {
    phase: "Phase 5 — Capture & Conversion",
    title: "Every click lands somewhere that converts",
    detail:
      "Generated landing pages and the WhatsApp Sales Center are built to qualify leads, present offers and take orders — with follow-up sequences timed at 1h, 24h and 48h so no lead dies of silence. Email runs on the platform's own sending infrastructure: send from your authenticated domain (DKIM/SPF/DMARC), DKIM-signed and tracked (opens, clicks, one-click unsubscribe), with no third-party provider. Nothing goes out unseen — every campaign is previewed through the real send path, merged for real contacts, and anything that would embarrass you blocks the send. Sending windows are computed per market, so nine in the morning is nine in the morning where the recipient is. And the result is reported honestly: the open rate is shown as a floor, because somebody who clicked without loading images opened the message whatever the tracking pixel says, and the platform names what is holding the number down instead of colouring it green. WhatsApp capture switches on when you connect WhatsApp.",
  },
  {
    phase: "Phase 6 — Budget Protection",
    title: "The Financial Shield watches every pound",
    detail:
      "Campaigns that spend without producing leads are flagged to pause — and auto-pause the moment your ad accounts connect — with the budget rerouted to proven winners and a weekly 'money saved' receipt.",
  },
  {
    phase: "Phase 7 — Recovery & Compounding",
    title: "Mine the revenue you already own, then scale",
    detail:
      "The Customer Vault scores every contact for recovery probability. Reactivation waves, referral loops and local domination compound growth, while Revenue Intelligence forecasts next month's money (base/push/stretch) from your own attributed-revenue ledger. This is also where reviews come from: the OS works out which of your real customers is eligible to be asked — a genuine order, finished long enough ago to have an opinion, not asked recently, consent intact — builds the correct review link for Google, Trustpilot, Facebook or your trade directory, and paces the asks so a sudden burst does not trip the platforms' own filters. Everyone eligible gets the same link, because filtering for the happy ones first is a banned practice under the UK DMCC Act 2024. And for the parts of local growth that happen off the screen, it produces flyers specified in millimetres at print resolution, with bleed and a QR code big enough to scan, plus posts written for the community groups you are actually a member of.",
  },
  {
    phase: "Phase 8 — The creative, and the part nobody tells you about",
    title: "An ad you can still change after it is made",
    detail:
      "Most AI advertising ends with a flat picture. One typo in the headline, one price that moved, one logo in the wrong corner, and the only way out is to generate the whole thing again — a new charge and a composition that is not quite the one you liked. Here an ad is a document instead: the headline is a string you retype, the logo is a layer you move, and the artwork underneath never changes, so editing calls nothing and costs nothing. Because every layer is placed in fractions of the frame rather than in pixels, resizing for a story, a reel or an email banner is a fresh layout rather than a centre crop — which is why the offer does not arrive underneath the reply bar. What the OS checks are things that can actually be measured: the contrast ratio of your text against what is behind it, and each platform's own published safe area. It will not tell you the ad is good. For video it gives you twelve formats you can genuinely film — a street interview, a podcast clip, a founder to camera — each with a timed shot list and the specific way it fails, and none of them ranked, because nobody outside the advertiser knows what an ad returned. A synthetic presenter is available too, and it is the one place the OS refuses before it renders: medical, financial, political and news-style scripts are declined outright, and putting a real person's face on screen needs their consent on record first, scoped to where, on what, and until when. Withdraw it and it stops working that moment.",
  },
  {
    phase: "Phase 9 — Other people selling for you",
    title: "Turn customers and creators into a distribution network",
    detail:
      "The cheapest salesperson a business will ever have is somebody who already likes the product and has an audience, however small. SHARE2EARN opens that to everyone: no follower requirement, no application, no audience test — share a product, and when a verified sale comes from your content you earn 0.5% of the product value. Creators with 5,000 verified followers earn 0.75% and 10,000 earns 1%. What makes this safe for the business rather than a budget with no floor is that the numbers are computed before anything is offered. Revenue, then variable costs, then the margin you have chosen to protect, and only what is left can fund a reward — so a commission that would eat into your protected margin is refused rather than flagged, and where a product's margin cannot carry the advertised rate that product is excluded instead of the creator's rate being quietly cut. The whole programme, rewards and platform fee together, can never cost more than 5% of the value it generates; generate nothing and it costs nothing, because capacity is created one settled transaction at a time. Nothing is paid on a refunded order, nothing is paid for views the platform cannot verify, and nothing is paid before the customer's money has arrived. On the creator's side the money is theirs once the sale settles — a brand can dispute a specific earning with a stated reason or release one early, but it cannot quietly hold a commission that was earned. Withdrawals reach a bank, a card, PayPal, Wise or mobile money on M-Pesa, Orange, Airtel and Africell, with every fee itemised before you confirm and nothing deducted for tax, because a creator is not an employee.",
  },
  {
    phase: "Phase 10 — Working while you are not",
    title: "Agents that run in order, on a schedule, and stop where they should",
    detail:
      "Several agents on one job, in sequence — each handed what the earlier ones produced and what the platform already knows about your business, so the result is one connected answer rather than five unrelated ones. Anything the OS has MEASURED is labelled as measured and anything an agent inferred is labelled as a guess, so one model's assumption never quietly becomes the next model's premise. Chains run when you press the button or on a cadence you choose, and here is the part that matters: they draft. Every step declares what it would do, and only drafting steps run unattended — a step that would send a message, publish a page or spend money becomes an approval item with the draft attached, including at three in the morning. Unattended spend has a fixed daily ceiling per brand, reserved before the work rather than counted after it, and any step that does not fit says so instead of vanishing. You can also compose your own chain from the agent list; what a step DOES is decided by the platform, not by the chain, so you can ask for more oversight but never less.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to MarketWar OS
        </Link>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Mission protocol</p>
        <h1 className="font-display text-4xl font-bold text-white">How MarketWar OS works</h1>
        <p className="mt-4 text-lg text-slate-400">
          {PHASES.length} phases take a business from &ldquo;boosted posts and hope&rdquo; to an autonomous
          customer acquisition machine.
        </p>

        <ol className="mt-12 space-y-0">
          {PHASES.map((p, i) => (
            <li key={p.phase} className="relative border-l border-ink-600 pb-10 pl-8 last:pb-0">
              <span className="absolute -left-[13px] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/50 bg-ink-900 font-display text-xs font-bold text-emerald-400">
                {i + 1}
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">{p.phase}</p>
              <h2 className="mt-1 font-display text-xl font-bold text-white">{p.title}</h2>
              <p className="mt-2 text-slate-400">{p.detail}</p>
            </li>
          ))}
        </ol>

        <div className="mt-14 text-center">
          <Link href="/signup" className="btn-primary text-base">
            Start Phase 1 now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
