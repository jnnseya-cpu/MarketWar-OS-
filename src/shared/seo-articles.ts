// Evergreen articles — the creator-earning cluster.
//
// These are CODE, not database rows, for one reason: they are the pages the site
// is meant to rank for, and a page that exists only when Firestore is configured
// is a page that is missing from the sitemap on every deployment that is not.
// The blog store merges them in, so the existing article route, the index, the
// related-post logic and the sitemap all pick them up unchanged.
//
// ── HOW THIS CLUSTER IS BUILT, AND WHY ─────────────────────────────────────
//
// One PILLAR (`creator-earning-programmes`) and five SPOKES. Every spoke links up
// to the pillar and across to its siblings; the pillar links down to all five.
// That is a topic cluster, and the reason it works is not a trick — it tells a
// crawler which page is the authority on the subject and gives a reader a route
// through the whole answer instead of one paragraph of it.
//
// Every internal link points at a page that EXISTS. A cluster whose links 404 is
// worse than no cluster: it wastes the crawl budget it was built to concentrate.
// A test walks every link in every article and fails on a dead one.
//
// ── ON BACKLINKS ───────────────────────────────────────────────────────────
//
// Nothing here manufactures one. A backlink is a link from somebody else's site,
// and placing them yourself — paid links, private networks, reciprocal schemes,
// comment drops — is a Google Search Essentials spam violation that gets the
// domain demoted, not promoted. It is also the exact doctrine this platform
// already sells in `link-opportunities.ts`: EARN links, never place them.
//
// What earns them is a page worth citing. Two of these are built as linkable
// assets on purpose: the payout-economics piece carries a fee table nobody else
// publishes, and the no-tax-reference piece answers a question that has almost
// no good English-language source. `LINKABLE_ASSETS` names what each one is for
// and who would plausibly cite it — that is an outreach list, not a link scheme.

export type SeoArticle = {
  slug: string;
  /**
   * Which topic cluster this belongs to.
   *
   * Two clusters now live here and they are aimed at OPPOSITE people: `creator`
   * answers somebody who wants to earn from an audience, `buyer` answers a
   * small business owner whose marketing is not working. Merging them would
   * produce a hub that is the authority on nothing — a crawler reads a cluster
   * as a claim about one subject, and a page linking to both reads as neither.
   */
  cluster: "creator" | "buyer";
  title: string;
  excerpt: string;
  category: string;
  readMinutes: number;
  keywords: string[];
  /** The pillar links down; every spoke links up and sideways. */
  pillar?: boolean;
  related: string[];
  faq: { q: string; a: string }[];
  content: string;
};

const AUTHOR = "MarketWar OS";

export const SEO_ARTICLES: SeoArticle[] = [
  // ─────────────────────────────────────────────────────────────── PILLAR ──
  {
    slug: "creator-earning-programmes",
    cluster: "creator",
    pillar: true,
    title: "Creator earning programmes: how MarketWar OS pays people who bring customers",
    excerpt:
      "Three ways to earn from an audience — SHARE2EARN at 0.5% with no follower gate, and influencer bands at 0.75% and 1% — plus what a brand pays, how the money is protected, and how it reaches a creator anywhere in the world.",
    category: "Creator economy",
    readMinutes: 11,
    keywords: [
      "creator earning programme", "affiliate commission rates", "influencer commission",
      "share to earn", "creator payouts", "referral commission software",
    ],
    related: ["share2earn-earn-from-your-audience", "influencer-commission-bands", "creator-payout-economics", "gen-z-growth-features", "profitguard-growthguard-creator-programme"],
    faq: [
      { q: "How much does a creator earn on MarketWar OS?", a: "0.5% of the eligible product value of a verified sale on SHARE2EARN, which has no follower requirement. On the influencer programme it is 0.75% from 5,000 verified followers and 1% from 10,000." },
      { q: "Do I need followers to earn?", a: "No. SHARE2EARN has no follower gate at all. The Creator Score measures conversion rather than reach, so 800 people who trust you can be worth more to a brand than 80,000 who scroll past." },
      { q: "What does the brand pay?", a: "The creator's rate plus a flat 0.25% platform share — so 0.65% on SHARE2EARN, 1% at the 0.75% band, and 1.25% at the 1% band, charged as an acquisition cost on sales the campaign produced." },
    ],
    content: `Most creator programmes answer one question — what is the commission — and leave the three that actually decide whether anybody sticks around. Who is allowed in. What happens when a sale is refunded. How the money reaches somebody who has no bank account.

This is the whole picture, and every rate in it is a number the platform enforces in code rather than a figure in a brochure.

## The three ways to earn

There is one commission ladder, and it has three rungs.

| Programme | You earn | To qualify | Brand pays |
|---|---|---|---|
| [SHARE2EARN](/blog/share2earn-earn-from-your-audience) | **0.5%** | Nothing. No followers, no application. | 0.65% |
| [Influencer · 5,000+](/blog/influencer-commission-bands) | **0.75%** | 5,000 verified followers | 1% |
| [Influencer · 10,000+](/blog/influencer-commission-bands) | **1%** | 10,000 verified followers | 1.25% |

The platform's own share is a flat 0.25% at every rung. That is deliberate: it means moving up a band raises what the creator gets rather than what the platform takes.

SHARE2EARN is capped at 0.5% and the cap is derived from the influencer bands rather than typed in — it is the *minimum* of its own ceiling and the lowest influencer rate, so it can never overtake the programme it sits beneath even if somebody edits the wrong number.

## The part most programmes get wrong

A commission is **earned**, not granted. Somebody posted, somebody bought, the sale settled. From that moment the money belongs to the creator and the brand's role is review rather than permission.

So there is no approval button that money waits behind. A brand can dispute a specific earning with a reason from a fixed list — refunded, charged back, fraudulent, self-referral, policy breach, duplicate, wrongly attributed — and the creator is told which one. It can also release money *early*. What it cannot do is quietly hold a settled, undisputed commission, because an earned commission a payer may keep at will is not a commission, it is a tip.

## Why a brand can run this without fear

The honest objection to any creator programme is that it might cost more than it makes. [ProfitGuard and GrowthGuard](/blog/profitguard-growthguard-creator-programme) are the answer, and they are hard limits rather than dashboards:

- **The Safe Reward Ceiling.** Revenue, then variable costs, then the margin the business protects — and only what is left can fund a reward. A £100 sale with £55 of costs and £20 protected leaves £25, so a £35 commission is *refused*, not warned about.
- **GrowthGuard's 5%.** The entire programme — creator rewards, referral bonuses, reserves and the platform's own fee — can never exceed 5% of the value it generates. Generate nothing and the budget is nothing.
- **Product eligibility.** Where 0.5% would make a transaction lose money, the product is marked ineligible rather than the creator's advertised rate being quietly cut.

## Getting paid, wherever you are

A programme that cannot pay a creator in Kinshasa is not a global programme. [Creator payout economics](/blog/creator-payout-economics) covers this properly: nine rails including M-Pesa, Orange Money, Airtel and Africell, no bank account required, and every fee itemised before you confirm.

Nothing is withheld for tax, because a creator is not an employee. Where a country issues no individual tax reference — or where, as in the DRC, personal tax is collected at source and an informal earner has no number — that fact is what gets reported, and [the platform never asks for a number that does not exist](/blog/creator-payouts-no-tax-reference).

## Where the audience actually is

The programmes are the money. [The Gen-Z layer](/blog/gen-z-growth-features) is the reason anybody opens the app twice: missions, streaks, squads, a Creator Score built from conversion rather than followers, and XP for everything short of a sale so the merchant's margin is never spent on engagement that produced nothing.

## Start

Creators apply on the [growth programme page](/growth). Brands run it from [Partner Network](/dashboard/partner-network), and creators track their own money on [My Earnings](/dashboard/earnings). The [pricing page](/choose-plan) covers what the platform itself costs, and [how it works](/how-it-works) walks the whole system end to end.`,
  },

  // ──────────────────────────────────────────────────────────────── SPOKE ──
  {
    slug: "share2earn-earn-from-your-audience",
    cluster: "creator",
    title: "SHARE2EARN: earn 0.5% from your own audience, with no follower gate",
    excerpt:
      "Share a product you like. Somebody buys. You earn 0.5% of the product value. No application, no follower minimum, and cash only ever comes from a verified sale — here is exactly how it works and what it does not pay for.",
    category: "Creator economy",
    readMinutes: 9,
    keywords: ["share to earn", "earn money sharing links", "no follower affiliate programme", "social selling commission", "gen z side hustle"],
    related: ["creator-earning-programmes", "influencer-commission-bands", "gen-z-growth-features", "creator-payout-economics"],
    faq: [
      { q: "How many followers do I need for SHARE2EARN?", a: "None. There is no follower gate, no application and no audience test. The Creator Score measures results rather than reach." },
      { q: "How much is 0.5%?", a: "£0.50 on a £100 product, £5 on £1,000, £50 on £10,000 of eligible sales. It is taken on the product value, not the checkout total — tax, delivery, tips and gift cards are excluded." },
      { q: "Do I get paid for views?", a: "No. Views, shares, clicks and streaks earn XP, rank and access. Cash comes from a verified sale, because paying cash for engagement that produced no sale spends the merchant's margin on nothing." },
    ],
    content: `Post. Somebody buys. You earn 0.5%.

That is the whole mechanic, and the interesting part is what sits underneath it — because a share-to-earn programme that pays for the wrong things gets farmed to death inside a month, and then it pays nobody.

## No gate, deliberately

There is no follower minimum. No application. No audience test.

The argument for that is not generosity, it is arithmetic: 350 people who actually trust you convert better than 80,000 who scroll past. The [Creator Score](/blog/gen-z-growth-features) is built to prove it — followers are not an input to it at all. It counts your conversion rate, the missions you finished, whether your content stayed up, and your volume. An 800-follower creator converting at 12% scores far above an 80,000-follower creator converting at 0.2%.

Below 25 counted actions it returns nothing at all and says so, because a score computed over four clicks is measuring luck.

## What 0.5% is taken on

Not the checkout total. **The product value.**

A £120 checkout made of a £100 product, £15 tax and £5 delivery is £100 of eligible value, so the commission is £0.50. Tax, delivery, tips and gift cards are excluded on the same principle: money the merchant never keeps cannot fund a commission. A refund reduces the eligible value; a cancellation voids it.

| Eligible sales you generate | You earn |
|---|---|
| £100 | £0.50 |
| £1,000 | £5 |
| £10,000 | £50 |
| £100,000 | £500 |

The point is volume and repetition, not one big cheque. Your content keeps working after you have stopped thinking about it.

## What does not pay cash, and why that protects you

Views, shares, qualified clicks and daily streaks earn **XP** — rank, access to higher-value campaigns, and eventually direct brand proposals. They do not earn cash.

That reads mean until you look at what happens otherwise. Paying per view means paying for numbers nobody can verify on an account the platform cannot see, and a screenshot is not a measurement. Every share-to-earn scheme that has done it got farmed within weeks, and the brands left. A channel that spends a merchant's margin on engagement that produced no sale gets switched off — which costs every honest creator on it.

So the rule is simple: **we pay for what we count ourselves.** Clicks on your own tracked link, leads and sales in the brand's own ledger, and posts that still resolve when we check 48 hours later.

## When a product is not eligible

Sometimes 0.5% is more than a product can afford. A retailer on a 0.3% net margin would lose money paying it.

Rather than quietly cutting your rate to something smaller, the product is marked **ineligible** and does not appear. If the platform advertises 0.5%, you get 0.5% on everything it lists — a headline rate that silently becomes something else is a rate nobody can trust. [ProfitGuard](/blog/profitguard-growthguard-creator-programme) is what makes that call.

## Getting the money

Earnings show as pending until the refund window on the sale closes, then become withdrawable. You are paid gross — nothing is deducted for tax, because you are not an employee — and you can withdraw to a bank, a card, PayPal, Wise, or mobile money on M-Pesa, Orange, Airtel and Africell.

[The payout economics piece](/blog/creator-payout-economics) has the full fee table, and if your country issues no tax reference, [that is handled properly rather than blocking you](/blog/creator-payouts-no-tax-reference).

## Bigger audience?

If you have 5,000 or more verified followers the [influencer bands](/blog/influencer-commission-bands) pay 0.75%, and 1% from 10,000. Same payout mechanism, higher rate. You do not have to choose in advance — SHARE2EARN is open to everyone, and the band follows your verified count.

Start on [the growth programme page](/growth), or read [the full picture of how creators earn here](/blog/creator-earning-programmes).`,
  },

  {
    slug: "influencer-commission-bands",
    cluster: "creator",
    title: "Influencer commission bands: 0.75% from 5,000 followers, 1% from 10,000",
    excerpt:
      "Two verified bands, what a brand pays at each, the £20,000 cap-and-recycle rule, and how the influencer programme differs from SHARE2EARN — same payout machinery, higher rate.",
    category: "Creator economy",
    readMinutes: 8,
    keywords: ["influencer commission rate", "affiliate programme tiers", "creator partnership commission", "micro influencer programme", "influencer payout"],
    related: ["creator-earning-programmes", "share2earn-earn-from-your-audience", "creator-payout-economics", "profitguard-growthguard-creator-programme"],
    faq: [
      { q: "What are the influencer commission bands?", a: "0.75% of eligible net revenue from 5,000 verified followers, and 1% from 10,000. Followers are counted across all your social platforms plus YouTube and must be verified — an unverified count is a claim, not a qualification." },
      { q: "What is the £20,000 cap?", a: "Per referred customer. Once a partner has earned £20,000 from one customer the split flips and the platform takes the full rate for the next £20,000, after which commission on that customer ends permanently." },
      { q: "What if I have fewer than 5,000 followers?", a: "SHARE2EARN has no gate and pays 0.5%. You move to the influencer band automatically the moment 5,000 verified followers are confirmed." },
    ],
    content: `The influencer programme is the same machine as [SHARE2EARN](/blog/share2earn-earn-from-your-audience) with a higher rate and a verification step.

## The bands

| Verified followers | You earn | Platform | Brand pays |
|---|---|---|---|
| 10,000+ | **1%** | 0.25% | 1.25% |
| 5,000–9,999 | **0.75%** | 0.25% | 1% |
| Under 5,000 | 0.5% via SHARE2EARN | 0.25% | 0.65% |

Followers are totalled across every social platform plus YouTube, and they must be **verified**. An unverified count is a claim, not a qualification — otherwise the gate is a text box.

Notice what the platform's share does across the bands: nothing. It stays at 0.25% whether you earn 0.5% or 1%. Moving up a band raises what the creator takes home, not what the platform takes.

## The £20,000 cap-and-recycle

This is the rule most people miss, and it is worth understanding before you build a strategy around one big client.

Commission runs **per referred customer**, and it has three states:

1. **Partner earning.** You take your band's rate, the platform takes 0.25%, until you have earned £20,000 from that single customer.
2. **Platform earning.** The split flips and the platform takes the full rate for the next £20,000.
3. **Complete.** Commission on that customer ends permanently.

It is a cap on a single relationship, not on you. Refer ten customers and you have ten of these running.

## Multiple programmes

A creator can subscribe to between 1 and 100 programmes — one per product or campaign — and gets a unique tracked link and coupon code for each. Attribution is per code, so you can see exactly which piece of content drove which conversion rather than guessing.

## What the brand is buying

Everything a brand pays flows through the same protection as SHARE2EARN. [ProfitGuard](/blog/profitguard-growthguard-creator-programme) computes what a product can afford before a rate is offered, and GrowthGuard caps the entire programme at 5% of the value it generates. A brand cannot accidentally offer 1% on a product whose margin will not carry it — the configuration is refused rather than warned about.

## Same payout, same protections

This matters and it was not always true. The influencer programme and SHARE2EARN now run through **one payout path**: the same identity check, the same itemised fees, the same idempotency protection that makes a double click a single withdrawal, the same release-on-failure so a failed payout never leaves your balance locked.

The details are in [creator payout economics](/blog/creator-payout-economics) — nine rails, mobile money included, and nothing withheld for tax because you are not an employee.

## Applying

Apply on [the growth programme page](/growth). You are scored on audience fit, engagement quality and brand safety — micro and local creators are actively wanted, because trust travels within a niche and a specialist with 6,000 engaged followers usually outperforms a generalist with 200,000.

The [full picture of how creators earn](/blog/creator-earning-programmes) sets the bands in context, and [the Gen-Z feature set](/blog/gen-z-growth-features) covers the missions and progression that sit on top.`,
  },

  {
    slug: "creator-payout-economics",
    cluster: "creator",
    title: "Creator payout economics: what it costs to get your money out, itemised",
    excerpt:
      "Nine payout rails, the real fee on each, why mobile money has a £2 minimum when a bank transfer needs £5, and the three guards that stop fees eating a small withdrawal.",
    category: "Creator economy",
    readMinutes: 9,
    keywords: ["creator payout fees", "affiliate payout methods", "mobile money payout", "m-pesa creator payment", "international creator payments"],
    related: ["creator-earning-programmes", "creator-payouts-no-tax-reference", "share2earn-earn-from-your-audience", "influencer-commission-bands"],
    faq: [
      { q: "What does it cost to withdraw earnings?", a: "The payout rail's own processing fee, passed through at cost, plus a 3% admin fee calculated on that processing fee — not on your withdrawal. On a £2 PayPal fee the admin fee is 6p." },
      { q: "Can I get paid without a bank account?", a: "Yes. Mobile money on M-Pesa, Orange Money, Airtel Money and Africell needs only a phone number, and those rails have a £2 minimum rather than the £5–£20 of the bank rails." },
      { q: "Is tax deducted from my earnings?", a: "No. Creators are not employees and are paid gross — no income tax, no National Insurance, no PAYE. What you owe where you live is yours to declare." },
    ],
    content: `Most creator platforms show you a gross balance and surprise you afterwards. This is the fee table, up front.

## What sits on a withdrawal

Two charges, and they are different things.

**The processing fee** belongs to the rail you chose and is passed through at cost. It varies because moving £50 to an M-Pesa wallet in Kinshasa genuinely does not cost what moving £50 to a UK bank costs.

**The admin fee** is the platform's, and it is **3% of that processing fee** — not 3% of your withdrawal. On a £2 PayPal fee it is 6p.

Here is £100 out, in the UK:

| Rail | Processing | Admin | You receive |
|---|---|---|---|
| Bank transfer | £0.20 | £0.01 | **£99.79** |
| Wise | £0.90 | £0.03 | **£99.07** |
| Local bank | £1.50 | £0.05 | **£98.45** |
| Instant to card | £1.70 | £0.05 | **£98.25** |
| PayPal | £2.00 | £0.06 | **£97.94** |

Every quote is itemised before you confirm, and each line says whose the charge is — the rail's or the platform's. "Fees" as a single number is how a pass-through gets mistaken for a margin. If another rail would leave you with more, the quote tells you so without being asked.

## No bank account required

Four mobile-money rails run through BitriPay: **M-Pesa, Orange Money, Airtel Money and Africell**. They need a phone number and nothing else.

Their minimum withdrawal is **£2**, against £5 for a bank transfer and £20 for a local bank wire. That is deliberate rather than accidental. Small, frequent withdrawals are the norm on those rails, and a high floor there would exclude precisely the people the programme exists for.

## Three guards, so fees never eat the money

1. **A per-rail minimum.** Below it the quote names the minimum and points at a rail with a lower floor.
2. **A warning above 10%.** It warns rather than blocks — the choice stays yours, and sometimes you need the money today.
3. **A hard refusal at 25%.** A withdrawal where fees would take a quarter of it is refused rather than offered. No amount of small print makes that acceptable.

In practice the minimums do the work; the 25% rule is a backstop against a future price change.

## Nothing is withheld

Creators are not employees. There is no income tax, no National Insurance and no PAYE taken from what you earn — you are paid gross and you declare it where you live.

That is not the same as the platform having no obligation. Under the UK's reporting rules for digital platforms — the OECD model rules, DAC7 in the EU — annual earnings are reported to the tax authority, and you receive a copy of exactly what was reported. Knowing who was paid and deducting from it are different things.

If your country issues no individual tax reference, [that is handled without blocking you](/blog/creator-payouts-no-tax-reference).

## Paid twice, never

A payout is irreversible on most rails and instant on some, so the withdrawal is **claimed before the provider is called**. A double click, a retry, or a timeout your browser never saw returns the first result instead of sending again. A failed payout releases your balance immediately, because money locked behind a failure is a support ticket rather than a safeguard.

Both [SHARE2EARN](/blog/share2earn-earn-from-your-audience) and the [influencer bands](/blog/influencer-commission-bands) run through this same path — see [the full picture](/blog/creator-earning-programmes).`,
  },

  {
    slug: "creator-payouts-no-tax-reference",
    cluster: "creator",
    title: "Getting paid when your country issues no tax reference",
    excerpt:
      "Most creator platforms demand a tax identification number and quietly exclude everyone who has none. Here is what the reporting rules actually require, and how a creator in the DRC, Tanzania or the UAE gets paid without one.",
    category: "Creator economy",
    readMinutes: 7,
    keywords: ["creator payout without tax number", "TIN not issued", "DAC7 no TIN", "paid as creator in DRC", "informal earner tax identification"],
    related: ["creator-payout-economics", "creator-earning-programmes", "share2earn-earn-from-your-audience"],
    faq: [
      { q: "Can I earn if my country does not issue a tax number?", a: "Yes. Where a jurisdiction issues no individual tax reference the fact itself is what gets reported, and you are never asked for a number that does not exist." },
      { q: "What if my country issues them but I have none?", a: "Choose one of four reporting codes — jurisdiction issues none, not required to hold one, applied for, or unable to obtain — and that is reported in place of a number. It is a normal answer, not a problem." },
      { q: "Will tax be deducted from my payment?", a: "No, anywhere. Creators are paid gross because they are not employees. What you owe locally is between you and your own authority." },
    ],
    content: `Ask a creator in Kinshasa for a tax identification number and you have asked a question with no correct answer.

The DRC does levy personal income tax, but it is largely collected at source from formal employment. Somebody earning from their phone, outside that system, simply has no number to give. Several countries — the UAE, Qatar, Bahrain, Kuwait — issue none at all, because there is no personal income tax to attach one to.

Most platforms handle this by demanding a number, and quietly excluding everyone who cannot produce one. That is a design choice, not a legal requirement.

## What the rules actually say

The reporting standard already anticipates this. Under the OECD model rules for digital platforms — DAC7 in the EU, in force in the UK since January 2024 — a platform that pays people for services must collect and report their identity and earnings. Where a jurisdiction does not issue a taxpayer identification number, or where the person is not required to hold one, the platform records **that fact** in a form the return accepts.

It does not invent a number. It does not leave a blank. Both of those produce a return that comes back.

## Three situations

**The country issues them and expects them** — the UK, Ireland, France, Germany, the US, Nigeria, Kenya, Ghana, South Africa. A reference is required and format-checked.

**The country issues them but an informal earner usually has none** — the DRC, Tanzania, Uganda, Zambia, Senegal, Côte d'Ivoire, Cameroon, Sierra Leone. You are asked, the reason it is often absent is explained, and a reporting code is accepted instead. The message says plainly that this is a normal answer rather than a problem.

**The country issues none at all** — the UAE, Qatar, Bahrain, Kuwait, the Bahamas, Monaco, Vanuatu. **The question is not asked.** The jurisdiction fact is what gets reported.

## The four codes

Where there is no number, one of these is filed in its place:

- My country does not issue one to individuals
- I am not required to hold one
- I have applied and am waiting
- I cannot obtain one

A chosen code files. A typed "n/a" does not, and is refused — a return needs something it can actually process.

## Nothing is deducted, anywhere

This is worth stating plainly because it is where most confusion sits. A creator in Kinshasa is paid **gross**, exactly as one in Leeds is. No income tax, no National Insurance, no withholding of any kind, because a creator is not an employee of the platform or of any brand they promote.

What you owe where you live is between you and your own authority. The platform reports what it paid you and hands you the same figure it filed — reporting and withholding are different things, and conflating them is how people end up believing money was taken that never was.

None of this is tax advice. Thresholds and rules differ by country and change; check with an accountant before relying on any of it.

## Then you get paid

Once the identity record is complete, the [payout rails](/blog/creator-payout-economics) do the rest — mobile money on M-Pesa, Orange, Airtel and Africell needs only a phone number, with a £2 minimum.

You can start earning before any of this: [SHARE2EARN](/blog/share2earn-earn-from-your-audience) has no gate at all, and the identity step arrives only when you want to take money out. [The full picture is here](/blog/creator-earning-programmes).`,
  },

  {
    slug: "profitguard-growthguard-creator-programme",
    cluster: "creator",
    title: "ProfitGuard and GrowthGuard: running a creator programme that cannot bankrupt you",
    excerpt:
      "The honest objection to any creator programme is that it might cost more than it makes. Two hard limits answer it: a Safe Reward Ceiling computed from your own unit economics, and a 5% cap on the entire programme's cost.",
    category: "Growth economics",
    readMinutes: 10,
    keywords: ["affiliate programme margin", "creator programme ROI", "safe commission rate", "unit economics acquisition", "CPA ceiling"],
    related: ["creator-earning-programmes", "influencer-commission-bands", "share2earn-earn-from-your-audience", "gen-z-growth-features"],
    faq: [
      { q: "How does MarketWar stop a creator programme losing money?", a: "Every reward is bounded by a Safe Reward Ceiling — revenue minus variable costs minus the margin you protect — and the whole programme is capped at 5% of the value it generates. A configuration that exceeds either is refused, not warned about." },
      { q: "What is the 5% GrowthGuard ceiling?", a: "The total cost of the creator programme — rewards, referral bonuses, reserves and the platform fee — can never exceed 5% of the verified value it generates. Generate £10,000 and the maximum spend is £500." },
      { q: "Do I have to fund a budget up front?", a: "Not for sales. Revenue-Locked mode funds commission out of the transaction it came from, so nothing leaves your account before the customer's money arrives." },
    ],
    content: `Every creator programme pitch skips the same question: what stops this costing more than it makes?

Two limits answer it, and both refuse rather than warn.

## The Safe Reward Ceiling

The order is fixed and nothing may reorder it:

**Revenue → variable costs → protected margin → available growth pool → creator + platform + reserve**

Take a £100 sale with £55 of variable costs. Contribution is £45. If the business protects £20 of margin, the pool available to acquisition is **£25** — not £45, and certainly not £100.

So a £35 creator reward on that product is **refused**, naming the £10 it would take out of the protected margin. A configuration of £15 creator, £5 platform, £2 reserve is allowed, and the business keeps £23.

The creator never reaches the protected margin. There is no override, no advanced checkbox, no "just this once" — a floor that can be switched off in a hurry is not a floor, and the hurry is exactly when it would be used.

## GrowthGuard's 5%

The second limit is simpler and it is the one that lets an owner sleep: **the entire programme can never cost more than 5% of the value it generates.**

| Value generated | Maximum total spend | You keep |
|---|---|---|
| £0 | £0 | £0 |
| £2,000 | £100 | £1,900 |
| £10,000 | £500 | £9,500 |
| £100,000 | £5,000 | £95,000 |

That 5% covers everything: creator rewards, referral and squad bonuses, campaign incentives, the fraud and refund reserve, and the platform's own fee. There is no second budget hiding behind it.

And the rate actually used is the **lower** of that 5% and what your own economics can survive. A software business may run at the full 5%; a supermarket will run at a fraction of it, and neither has to work that out for itself. Set a survival floor — "never take my retained contribution below 25%" — and the rate drops further to respect it.

## It earns before it spends

Capacity is created by settled transactions, one at a time. Generate nothing and the performance-funded budget is nothing; there is no starting balance to burn through.

In **Revenue-Locked** mode — the default for sale-based campaigns — commission is funded out of the transaction it came from. Nothing leaves your account before the customer's money has arrived, which is what makes this runnable by a business with no marketing budget at all.

A refund or chargeback before settlement voids the commission entirely. There is no revenue behind it, so there is nothing to pay it from.

## The kill switch

Campaigns stop themselves. Cost per acquisition above the ceiling and a collapse in conversion quality **throttle**; return on spend below the minimum, an exhausted budget, a refund rate over 12% or fraud over 3% **pause** it outright. Every trip says what happened and what was done about it, so nobody has to watch a dashboard all day.

## One word we will not misuse

A sale attributed to a creator's link is not proof it would have been lost otherwise. Classifying a buyer as "new" does not establish that either.

So without a holdout, every figure says **attributed** — the campaign was credited with these sales. Configure a real holdout and lift is measured properly against it, and only then does the word "incremental" appear. A finance director who catches a product calling attributed revenue "incremental" once will never trust another number on the screen, and would be right not to.

## What it looks like in practice

Creator rates sit at [0.5% on SHARE2EARN](/blog/share2earn-earn-from-your-audience) and [0.75% or 1% on the influencer bands](/blog/influencer-commission-bands) — all of them bounded by the ceilings above. Where 0.5% would make a product lose money, that product is marked ineligible rather than the creator's advertised rate being quietly cut.

Run it from [Partner Network](/dashboard/partner-network). [The full picture of how creators earn is here](/blog/creator-earning-programmes), and [the Gen-Z layer](/blog/gen-z-growth-features) covers what keeps creators active once the economics are safe.`,
  },

  {
    slug: "gen-z-growth-features",
    cluster: "creator",
    title: "The Gen-Z growth layer: missions, squads, streaks and a score that ignores followers",
    excerpt:
      "Six hubs, ten mission types, a Creator Score built from conversion rather than reach, and squad leaderboards — the layer that makes a creator open the app twice.",
    category: "Creator economy",
    readMinutes: 9,
    keywords: ["gen z marketing platform", "gamified creator programme", "creator missions", "creator score", "squad referral marketing"],
    related: ["creator-earning-programmes", "share2earn-earn-from-your-audience", "profitguard-growthguard-creator-programme", "influencer-commission-bands"],
    faq: [
      { q: "What is a Creator Score?", a: "A score out of 1,000 built from conversion rate, missions finished, whether content stayed live, and volume. Followers are not an input — there is nowhere to pass one. Below 25 counted actions it returns nothing rather than measuring luck." },
      { q: "What are missions?", a: "Ten kinds of brand-set task — create and earn, share and earn, bring a friend, viral challenge, local mission, sell and earn, review and earn, event, launch squad and ambassador — each with rewards funded before the mission publishes." },
      { q: "What are squads?", a: "A team of up to 25 creators with a shared leaderboard. Squad totals are the sum of what members actually earned; joining one creates no money, and any squad bonus is a funded mission reward like any other." },
    ],
    content: `Commission is why somebody signs up. It is not why they open the app on a Tuesday.

## Six hubs

The whole operating system is re-cut into the six things a creator actually wants to do — **Create, Grow, Earn, Play, Connect, Build** — rather than the fifteen dashboard modules an operator thinks in. Nothing underneath changes; the map does.

## Missions, and the rule that makes them trustworthy

A brand does not just say "share our product". It sets a mission, and there are ten kinds: create and earn, share and earn, bring a friend, viral challenge, local mission, sell and earn, review and earn, event mission, launch squad, ambassador.

Here is the rule that matters: **every bounty is funded before the mission publishes.** "Top 10 creators → £100 pool" is a debt the moment it is displayed. The worst case — every expected creator hitting every target — is computed and reserved up front, and a mission whose budget cannot cover it does not go live. Creators will have done the work by the time the money runs out, and "the pool was decorative" is the one thing a programme like this cannot survive.

## Creator Score: results, not reach

Scored out of 1,000, from four counted components:

- **Conversion rate** — 450 points
- **Missions finished** — 250
- **Content kept up** — 200
- **Volume** — 100

Followers are not an input. There is nowhere to pass one.

The effect is the point: an 800-follower creator converting at 12% scores **945**; an 80,000-follower creator converting at 0.2% scores **329**. Below 25 counted actions it returns nothing at all and says a score there would be measuring luck.

## XP for everything short of a sale

Views from a connected account, shares, qualified clicks, streaks and verified leads earn **XP** rather than cash. XP buys rank and access — Rookie, Creator, Rising, Pro, Elite, Icon — each unlocking higher-value campaigns and eventually direct brand proposals.

That split is what protects the economics. Cash comes only from a verified sale, so [the merchant's margin](/blog/profitguard-growthguard-creator-programme) is never spent on engagement that produced nothing. Progression the platform can give away for free is progression it can keep giving away.

## Squads

Up to 25 creators, one leaderboard. A squad total is the sum of what its members actually earned — joining one creates no money, and any squad bonus is a funded mission reward like any other.

## Trust, stated as facts rather than a score

Fraud checks are a list of things that either happened or did not, each saying what it means: buying through your own link, click duplication above 70%, a shared device, content deleted after the check, an implausible conversion rate. A stopped payout can be argued with as a fact rather than a number.

## The money underneath

All of this sits on [the commission ladder](/blog/creator-earning-programmes): [0.5% with no gate](/blog/share2earn-earn-from-your-audience), [0.75% and 1% on the verified bands](/blog/influencer-commission-bands), and [payouts that reach a phone in Kinshasa as easily as a bank in Leeds](/blog/creator-payout-economics).

Creators start at [the growth programme page](/growth) and track their own money on [My Earnings](/dashboard/earnings).`,
  },

  // ──────────────────────────────────────────── BUYER CLUSTER · PILLAR ──
  //
  // Aimed at the person who actually pays: a small business owner whose
  // marketing is not working and who has not decided that software is the
  // answer. Every page ends where the product can prove itself in fifteen
  // seconds — the free audit — because a stranger will type their own website
  // into a box long before they will create an account.
  {
    slug: "why-your-website-gets-no-enquiries",
    cluster: "buyer",
    pillar: true,
    title: "Your website gets visitors and no enquiries. Here is where they go.",
    excerpt:
      "Six reasons a small business site takes traffic and returns nothing — slow first paint, an unanswerable first screen, a form nobody trusts, invisible contact details, no proof, and a page search engines cannot read. How to tell which one is yours.",
    category: "Getting customers",
    readMinutes: 9,
    keywords: [
      "website not getting enquiries", "website traffic no leads", "why is my website not working",
      "small business website problems", "website conversion small business",
    ],
    related: ["free-website-audit-what-to-check", "why-your-business-doesnt-show-up-on-google", "how-ai-assistants-choose-which-business-to-name", "marketing-with-no-budget", "what-an-agency-charges-for"],
    faq: [
      { q: "Why does my website get visitors but no enquiries?", a: "Almost always one of six things: the page takes too long to become useful, the first screen does not answer what you do and who for, the contact route asks for too much or looks unsafe, your phone number is an image, there is no evidence anyone has used you, or search engines cannot read the page at all. They are diagnosable in about fifteen seconds by reading the page the way a crawler does." },
      { q: "How many enquiries should a small business site get?", a: "There is no honest industry number, and anyone quoting one is selling something. What matters is your own before and after: measure the page now, change one thing, measure again. A site that goes from two enquiries a month to five has doubled its pipeline regardless of what the average is." },
      { q: "Should I rebuild my website?", a: "Usually not. A rebuild is the most expensive way to test a hypothesis you have not written down yet. Fix the first screen, the contact route and the speed on the site you have; if enquiries do not move, you have learned something worth more than a new theme." },
    ],
    content: `A small business site that takes traffic and returns nothing is not a mystery. It is one of six things, and you can usually find out which in the time it takes to make a cup of tea.

What follows is the order to check them in, which is not the order most people check them in. Almost everybody starts with how the site looks. Nobody has ever chosen a plumber on the strength of a colour scheme.

## 1. The page takes too long to become useful

Not "load" — become useful. A visitor on a phone, on mobile data, standing outside a job, gives your site about three seconds before deciding it is broken. If the first thing that appears is a blank screen, a spinner, or a giant image that has not arrived yet, they are gone before your copy has had a turn.

This is measurable rather than arguable: how long the server took to answer, and how much has to be downloaded before anything readable appears.

## 2. The first screen does not answer the only two questions

What do you do, and who is it for. A stranger decides in about five seconds whether they are in the right place, and "Welcome to our website" answers neither question. Nor does a slogan.

The test is brutal and useful: show the top of your homepage to somebody who does not know your business, for five seconds, then ask them what you sell and whether it is for them. Most owners are surprised.

## 3. The contact route asks for too much, or looks unsafe

Every extra field on a form costs you enquiries. A form asking for a company name, a budget range and how they heard about you, from somebody who wanted to ask whether you cover their postcode, is a form that gets abandoned.

And a site without HTTPS now shows a browser warning. However good the rest of it is, a warning about safety appearing above your contact form is not something the copy can recover from.

## 4. Your phone number is a picture

More sites than you would think put the phone number inside an image or a graphic header, which means it is not a link on a phone, cannot be copied, and does not exist as far as any search engine is concerned. The same goes for an address that only appears in a footer graphic.

## 5. There is no evidence anybody has ever used you

Not testimonials you wrote. Reviews with names, work with photographs, a number of years, a named town. Trust is the whole transaction for a local business, and a site with no evidence asks a stranger to go first.

## 6. Search engines cannot read the page

If the title tag is missing or says "Home", if the page renders entirely in JavaScript, if there is no structured data describing what the business is and where — then the page can be beautiful and still be invisible. That is a different problem from the five above, and it is covered properly in [why your business does not show up on Google](/blog/why-your-business-doesnt-show-up-on-google).

## Which one is yours

The honest answer is that guessing is expensive. Five of the six are measurable directly from the page: the speed, the title, the HTTPS, whether the phone number is text, whether the structured data exists.

We built a [free audit](/audit) that reads your actual page and tells you which of these it can see, in about fifteen seconds, with no account. It is the same engine our paying customers use; it is on the outside of the login because arguing that we could help you is worth less than showing you three true things about your own site.

## Then what

Fix one thing. Measure. Fix the next. That is unglamorous and it is how it actually goes.

If you want to know what the free tools check versus what a proper audit sees, that is [in here](/blog/free-website-audit-what-to-check). If the problem turns out to be that nobody is arriving in the first place, start with [why your business does not show up on Google](/blog/why-your-business-doesnt-show-up-on-google) and, increasingly, [how AI assistants decide which business to name](/blog/how-ai-assistants-choose-which-business-to-name).

And if the honest constraint is that there is no money for any of this, [that is a solvable problem too](/blog/marketing-with-no-budget) — and worth reading before [what an agency would charge you](/blog/what-an-agency-charges-for).`,
  },

  // ─────────────────────────────────────────────── BUYER CLUSTER · SPOKES ──
  {
    slug: "free-website-audit-what-to-check",
    cluster: "buyer",
    title: "Free website audit: what to check yourself in ten minutes, and what a tool sees that you cannot",
    excerpt:
      "The eight checks worth doing by hand on your own site, the four that need something to read the page for you, and how to tell a real audit from a lead-capture form with a progress bar.",
    category: "Getting customers",
    readMinutes: 8,
    keywords: [
      "free website audit", "website audit checklist", "check my website", "website health check",
      "small business seo audit", "free site checker",
    ],
    related: ["why-your-website-gets-no-enquiries", "why-your-business-doesnt-show-up-on-google", "what-an-agency-charges-for"],
    faq: [
      { q: "Are free website audits any good?", a: "Some are. The test is whether the report tells you things it measured on your page, with the numbers, or whether it tells you generic advice with your domain name inserted. If it cannot say how many milliseconds your server took, it did not read your site." },
      { q: "What should a website audit check?", a: "At minimum: HTTPS, server response time, the title and meta description, one H1, mobile viewport, image alt text, robots.txt and sitemap.xml, and structured data. Anything beyond that is welcome, but a report missing those is not an audit." },
      { q: "Do I need to pay for a website audit?", a: "No. The measurable parts of an audit are a fetch and a parse — they cost almost nothing to run, which is why so many companies give them away. What costs money is fixing what they find." },
    ],
    content: `Most free website audits are a form with a progress bar. You give an email, a report arrives, and it contains advice that would be true of any site on the internet with your domain pasted into the header.

A real one tells you things it measured on your page, with the numbers attached. Here is how to do the manual half yourself, and what genuinely needs a machine.

## The eight you can check by hand

**1. Does the address bar say Not Secure?** If your site is not on HTTPS, fix that before anything else on this list. It is usually free with your host and takes an afternoon.

**2. Load your homepage on 4G with the wifi off.** Not on your office broadband. Count to three. Is there something readable and useful on screen?

**3. Read the browser tab.** That is your title tag, and it is what appears in search results. If it says "Home" or "Untitled", you have found a free win.

**4. Can you tap your phone number?** On a phone, on your own site. If nothing happens, it is an image, and it is invisible to both customers in a hurry and to search engines.

**5. Show the top of the page to somebody for five seconds.** Ask them what you sell and who for. Most owners are surprised by the answer.

**6. Count the fields on your contact form.** Every one past three costs you enquiries. Name, contact, message.

**7. Look for evidence.** Names, photographs, reviews, a town, a number of years. Not adjectives.

**8. Type your business name and your town into Google.** If you are not on the first page for your own name, something is properly wrong.

## The four that need something to read the page for you

These are not judgement calls, they are facts about the HTML, and you cannot see them by looking:

- **The meta description** — present, and does it read like a sentence a person wrote, or like a list of keywords.
- **The heading structure** — exactly one H1, in a sensible order. Two H1s or none confuses what the page is about.
- **Image alt text** — how many images have none. This is accessibility first and search second, and both matter.
- **robots.txt, sitemap.xml and structured data** — whether search engines and, increasingly, AI assistants can work out what your business is, where it is and what it sells.

## How to tell a real audit from a lead form

Three questions.

Does it give you anything before it asks for your email? A tool confident in what it found shows you some of it.

Does it quote numbers from your page — the actual milliseconds, the actual character count of your title — or does it use bands like "slow" and "needs improvement"?

Does it say what it could NOT measure? Pages that render entirely in JavaScript hide most of this from a simple fetch. An honest report says so; a dishonest one counts what it could not see as a failure and sells you the fix.

## Ours

We run [a free one](/audit) that reads your actual page and gives you the score and the three worst findings with no email at all, then tells you exactly how many others it measured. No account, no card.

It is the same engine our paying customers use. It is outside the login because showing you three true things about your own site is worth more than any claim we could make about ourselves.

What to do with the findings is [in the main piece](/blog/why-your-website-gets-no-enquiries). If the audit says you are invisible rather than unpersuasive, [start here instead](/blog/why-your-business-doesnt-show-up-on-google).`,
  },
  {
    slug: "why-your-business-doesnt-show-up-on-google",
    cluster: "buyer",
    title: "Why your business does not show up on Google — the six causes, in the order they matter",
    excerpt:
      "Not a ranking-factor list. The six reasons a real small business is genuinely invisible, from an unclaimed map listing to a page a crawler cannot read, and which of them you can fix this week.",
    category: "Getting customers",
    readMinutes: 9,
    keywords: [
      "business not showing up on google", "not ranking on google", "google my business not showing",
      "local seo small business", "how to get found on google",
    ],
    related: ["why-your-website-gets-no-enquiries", "free-website-audit-what-to-check", "how-ai-assistants-choose-which-business-to-name"],
    faq: [
      { q: "Why is my business not showing up on Google?", a: "For a local business the usual order is: no Google Business Profile or an unclaimed one, inconsistent name and address across the web, a site with no page about the actual service in the actual town, a page search engines cannot read, no reviews, and only then anything a specialist would call SEO." },
      { q: "How long does it take to show up on Google?", a: "A claimed and verified Business Profile can appear in days. A new page on an existing site is usually indexed within a week or two. Competitive rankings take months, and anybody promising a specific position by a specific date is guessing." },
      { q: "Do I need to pay for Google ads to show up?", a: "No. Paid and organic results are separate, and paying does not improve your unpaid position. For a local trade, a claimed profile with real reviews often outperforms a modest ad budget." },
    ],
    content: `This is not a list of two hundred ranking factors. For a real small business, invisibility is almost always one of six things, and the first three cost nothing to fix.

## 1. Your Google Business Profile is missing, unclaimed or wrong

For anything local this is the single biggest one, and it is bigger than your website. The map pack sits above the normal results, and it is populated from Business Profiles rather than from websites.

Claim it. Verify it. Fill in every field including opening hours and service areas. Add photographs of actual work. This is free and most businesses do about a third of it.

## 2. Your name, address and phone number disagree across the internet

If your address is a suite number in one directory, without one in another, and your phone number has three formats, search engines discount all of them. Consistency matters more than volume here — five identical listings beat twenty that disagree.

## 3. You have no page about the thing, in the place

"Services" is not a page about anything. Somebody searching for an emergency electrician in a named town will not be matched to a page that says "we offer a range of electrical solutions".

One page per service per area you actually cover, written by somebody who does the work, saying what it costs and how long it takes. Three of those beat thirty thin ones, and thirty thin ones now actively hurt.

## 4. Search engines cannot read your page

A missing title tag, no meta description, a page that renders entirely in JavaScript, no robots file, no sitemap. If the crawler cannot work out what the page is, it cannot rank it for anything.

These are facts about your HTML rather than opinions, and they are the ones you cannot see by looking at the site. Our [free audit](/audit) reads the page and tells you which of them apply, in about fifteen seconds and without an account.

## 5. You have no reviews, or they stopped in 2023

Review count and recency both feed local ranking, and both feed the human decision that follows it. Asking every completed customer, every time, is the entire strategy. Do not gate them, do not filter them, do not buy them.

## 6. Only now, anything a specialist would call SEO

Links, content depth, technical fixes beyond the basics. These matter, and they matter after the five above are done. Paying for them first is how small businesses spend a year on the wrong problem.

## What to do this week

Claim the profile. Fix the name and address everywhere. Write one real page about one real service in one real town. Run the [audit](/audit) and fix whatever it says the crawler cannot read.

That is a week's work and it is worth more than most six-month retainers, which is a claim [worth reading properly](/blog/what-an-agency-charges-for).

If people do find you and still do not get in touch, the problem is further down the funnel — [that is the main piece](/blog/why-your-website-gets-no-enquiries). And there is now a second search surface worth understanding: [how AI assistants decide which business to name](/blog/how-ai-assistants-choose-which-business-to-name).`,
  },
  {
    slug: "how-ai-assistants-choose-which-business-to-name",
    cluster: "buyer",
    title: "How AI assistants decide which business to name",
    excerpt:
      "When somebody asks ChatGPT for a plumber in Croydon, something decides which names come back. What that something reads, why most small business sites are invisible to it, and the four things that make you quotable.",
    category: "Getting customers",
    readMinutes: 8,
    keywords: [
      "ai search optimisation", "chatgpt recommend my business", "how to appear in ai search",
      "generative engine optimisation", "llm seo small business", "ai visibility",
    ],
    related: ["why-your-website-gets-no-enquiries", "why-your-business-doesnt-show-up-on-google", "free-website-audit-what-to-check"],
    faq: [
      { q: "How do I get ChatGPT to recommend my business?", a: "You cannot pay for it and you cannot instruct it. What you can do is be legible: a page that states plainly what you do, where, and for whom, in text rather than in images; structured data describing the business; consistent details across the web; and third-party pages that mention you. Assistants assemble answers from what is readable and corroborated." },
      { q: "Does AI search replace Google for small businesses?", a: "Not yet, and possibly not ever entirely. But a meaningful share of the questions that used to start a search now get answered without one, and a business that is invisible to that layer loses those enquiries silently — there is no ranking report showing you what you did not appear in." },
      { q: "What is the single most useful thing to do?", a: "Put the facts in text. An enormous number of small business sites carry their most important information — services, areas covered, prices, phone number — inside images, sliders and scripts. A model reading the page sees nothing." },
    ],
    content: `Somebody asks an assistant for a reliable roofer in their town. It names three. Yours is not one of them, and unlike a search result there is no report telling you what you missed.

This is not mysterious, and it is not the same as SEO, although it overlaps.

## What is actually being read

An assistant answering that question is working from some combination of: pages it can fetch and parse right now, a training corpus that is at least months old, and whatever search index it is allowed to consult. All three favour the same thing — text that plainly states a fact, on a page that can be read without running a browser.

That is the whole game, and it is why so many perfectly good small business sites are invisible to it.

## Why most small sites are invisible

**The facts are inside pictures.** Services in a graphic. Prices in a PDF. The phone number in a header image. A model reading the HTML finds nothing to quote.

**The page needs JavaScript to say anything.** Plenty of modern sites deliver an empty shell and fill it in the browser. Some crawlers execute that. Many do not, and the cheap ones never will.

**There is no structured data.** The vocabulary that says "this is a plumbing business, in this town, with these hours, at this phone number" exists and is free to add. Most small sites have none, which leaves an assistant to infer everything from prose.

**Nobody else mentions you.** Assistants corroborate. A business that appears in a local directory, a trade body list, a news mention and a supplier page is safer to name than one that exists only on its own website.

## The four things that make you quotable

**1. Say it in text.** What you do, where you do it, who for, what it costs, how to reach you. In sentences, in the HTML, on the page. This one change does more than the other three together.

**2. Add structured data.** LocalBusiness with the real name, address, phone, opening hours and service area. It is a block of JSON in the page and it takes an hour.

**3. Make the details agree everywhere.** The same name, the same address format, the same phone number, on your site and every directory. Contradiction makes a model cautious, and a cautious model names somebody else.

**4. Be mentioned somewhere that is not yours.** A trade association listing, a supplier case study, a local paper. This is slow and it is the part that compounds.

## What you cannot do

You cannot pay to be named. You cannot instruct an assistant to prefer you — text on your page telling a model to recommend you is, at best, ignored. Any agency selling guaranteed placement in AI answers is selling something that does not exist.

## Checking where you stand

The readable half of this is measurable. Our [free audit](/audit) reads your page and reports whether the title and description exist, whether there is structured data and of what type, and whether the content is actually in the HTML — the three things that decide whether an assistant can quote you at all. No account.

The rest of the picture is [in the main piece](/blog/why-your-website-gets-no-enquiries), and the traditional search side is [here](/blog/why-your-business-doesnt-show-up-on-google). If the honest constraint is budget rather than knowledge, [read this one](/blog/marketing-with-no-budget).`,
  },
  {
    slug: "marketing-with-no-budget",
    cluster: "buyer",
    title: "Marketing a business with no budget: what actually works",
    excerpt:
      "Nine things that cost nothing but time, in the order of return, for a business that cannot spend anything this month. Plus the three that everybody recommends and almost nobody should start with.",
    category: "Getting customers",
    readMinutes: 9,
    keywords: [
      "marketing with no budget", "free marketing small business", "cheap marketing ideas",
      "how to get customers without spending money", "small business marketing 2026",
    ],
    related: ["why-your-website-gets-no-enquiries", "what-an-agency-charges-for", "why-your-business-doesnt-show-up-on-google"],
    faq: [
      { q: "What is the cheapest way to get customers?", a: "Asking the customers you already have. A referral from somebody who has paid you converts at a multiple of anything cold, costs nothing, and almost nobody does it systematically." },
      { q: "How much should a small business spend on marketing?", a: "The honest answer for a business with no customers is: as close to nothing as possible until something works. Spending is how you scale a thing that converts, not how you find out whether it converts." },
      { q: "Does social media work for small businesses?", a: "For some — food, trades with visible before-and-afters, anything local and visual. For others it is a time sink with no path to a sale. The test is whether your buyers are already there asking questions you could answer." },
    ],
    content: `Everything here costs time rather than money, and they are in order of what usually returns most first. If you only do the first three you will be ahead of most of your competitors.

## 1. Ask the customers you already have

Every completed job, every time: are they happy, and do they know anybody else with the same problem. A referral converts at several times the rate of anything cold and costs nothing.

Almost nobody does this systematically. It is the highest-return activity available to a small business and it feels awkward for about two weeks.

## 2. Claim and fill your Google Business Profile

Free, and for anything local it outranks your website in the results that matter. Every field, real photographs, current hours. Then ask every customer for a review, every time, without gating or filtering.

## 3. Fix what is broken on the site you have

Not a rebuild. The title tag, the HTTPS warning, the phone number that is a picture, the form with nine fields. These are hours of work, not thousands of pounds, and they act on all the traffic you already have. Our [free audit](/audit) will tell you which apply to your page in about fifteen seconds.

## 4. Write one real page about one real thing

The service you actually want more of, in the town you actually cover, priced honestly, written by whoever does the work. Not a blog. One page that answers what somebody would ask on the phone.

## 5. Answer questions where your buyers already ask them

Local Facebook groups, trade forums, the community pages for your town. Answer properly, without pitching. This is slow, it works, and it is free.

## 6. Message ten people you can name

Not a campaign. Ten businesses or people you could describe to a friend, one message each, from your own phone or inbox. Most will say nothing. One or two will not, and that is a week's work turned into a conversation.

## 7. Photograph your work

Before and after, on a phone, badly lit, real. For trades this outperforms any copywriting you could buy, and it costs the two minutes before you pack the van.

## 8. Partner with somebody adjacent

The electrician who needs a plasterer. The accountant who needs a bookkeeper. One conversation can produce a referral stream that costs nothing forever.

## 9. Only then, content and social at volume

This is where most advice starts and it is where you should finish. It compounds, slowly, and it is a poor use of your only resource when you have no customers yet.

## The three to be careful of

**Paid ads before you convert.** Sending paid traffic to a page that does not convert is buying a more expensive version of the same nothing.

**A rebuild.** The most expensive way to test a hypothesis you have not written down.

**An agency retainer, this month.** There is a case for one later. [Here is what you are actually buying](/blog/what-an-agency-charges-for), and which parts of it you can do yourself.

## And when something works

Do more of exactly that before you change anything. The instinct after one success is to redesign everything around it; the correct move is to run it again, twice, and see whether it was real.

If people are arriving and not getting in touch, [the six causes are here](/blog/why-your-website-gets-no-enquiries). If nobody is arriving at all, [start with this one](/blog/why-your-business-doesnt-show-up-on-google).`,
  },
  {
    slug: "what-an-agency-charges-for",
    cluster: "buyer",
    title: "What a marketing agency charges 2,000 pounds a month for — and which parts you can do yourself",
    excerpt:
      "An honest breakdown of a typical small-business retainer: what the hours actually go on, which line items are genuinely skilled work, which are software you could licence directly, and when an agency is the right answer.",
    category: "Getting customers",
    readMinutes: 9,
    keywords: [
      "marketing agency cost", "how much does a marketing agency charge", "agency retainer worth it",
      "marketing agency alternative", "in house vs agency marketing",
    ],
    related: ["why-your-website-gets-no-enquiries", "marketing-with-no-budget", "free-website-audit-what-to-check"],
    faq: [
      { q: "How much does a small business marketing agency cost in the UK?", a: "Typical small-business retainers run from about 750 to 3,000 pounds a month, with 1,500 to 2,000 common for a package covering some SEO, some content and some reporting. Ad spend is normally on top." },
      { q: "Is a marketing agency worth it?", a: "It is worth it when you have something that already converts and you need volume, or when the work needs a skill you genuinely cannot buy as software. It is rarely worth it as the first thing a business with no customers does." },
      { q: "What should I ask an agency before signing?", a: "Which of these hours are strategy and which are software you could licence yourself; what happens to the assets if we stop; what specifically will be different in ninety days; and what result would make you tell us this is not working." },
    ],
    content: `A typical small-business retainer is somewhere between 750 and 3,000 pounds a month. Here is roughly what is inside a 2,000 pound one, based on what these packages usually contain.

None of this is an argument that agencies are dishonest. Most are not. It is an argument that you should know which line you are buying.

## The account manager: 300 to 500 pounds

The person who emails you, joins the monthly call and chases the specialists. Real work, and the first thing to disappear when the agency gets busy.

## The reporting: 150 to 300 pounds

A monthly document assembled from tools that produce it automatically. Genuinely useful when somebody interprets it. Frequently it is a dashboard with a covering paragraph.

**You can do this yourself.** The underlying data is free from Search Console and your analytics.

## The content: 400 to 800 pounds

Usually two to four pieces a month. Quality varies more than any other line — some agencies have excellent writers, some produce filler that will not rank because it says nothing a hundred other pages do not.

**Ask to see three pieces they wrote for a client in a trade like yours.** Not the portfolio. Three real ones.

## The technical SEO: 200 to 400 pounds

Fixing what crawlers cannot read, speed, structured data, internal links. This is real skilled work — and the diagnosis half of it takes seconds and is available free from any number of tools, [including ours](/audit).

The fixing is the part worth paying for. The finding is not.

## The software: 200 to 400 pounds

Rank trackers, audit tools, keyword research, reporting platforms. Bundled invisibly into your retainer at a markup.

**This is the line to ask about directly.** Licensing the same tools yourself is usually a fraction of the cost, and you keep them if you leave.

## The strategy: 100 to 300 pounds

The part that is genuinely hard to replace, and usually the smallest number on the invoice. Knowing which of your services to push, which customers are worth chasing, what to stop doing.

## What is left when you subtract the software and the reporting

Roughly a thousand pounds of skilled work: writing, technical fixes, and someone thinking about your business. That can absolutely be worth two thousand pounds a month to a business turning over enough for it to matter.

It is rarely worth it to a business with no customers yet, because the thing that business needs is not more volume through a funnel — it is finding out whether anybody wants what it sells. [That work costs nothing but time](/blog/marketing-with-no-budget).

## The four questions to ask before signing

Which of these hours are strategy and which are software I could licence directly?

What happens to the content, the accounts and the data if we stop?

What specifically will be different in ninety days, and how would we know?

What result would make you tell me this is not working?

The last one is the useful one. An agency that has never told a client to stop is an agency that will not tell you either.

## Before you decide

Run a [free audit](/audit) of your own site first, so you can tell whether the technical problems an agency finds are the ones you already knew about. If somebody quotes you for six months of fixes and the audit lists the same eight things in fifteen seconds, that is worth knowing before the contract rather than after.

And if the diagnosis is that people arrive and do not get in touch, [start here](/blog/why-your-website-gets-no-enquiries) — that is usually a week of work rather than a retainer.`,
  },
];

/**
 * What each asset is genuinely worth citing for — an outreach list, not a link
 * scheme. Nothing here places a link anywhere; it names who would plausibly want
 * to, which is the only lawful half of the job.
 */
export const LINKABLE_ASSETS: { slug: string; whyCitable: string; whoWouldCite: string }[] = [
  {
    slug: "creator-payout-economics",
    whyCitable: "A published, itemised fee comparison across nine payout rails including African mobile money. Almost nobody publishes the mobile-money side at all.",
    whoWouldCite: "Creator-economy newsletters, fintech and remittance writers, African tech publications, and comparison pages for affiliate payout methods.",
  },
  {
    slug: "creator-payouts-no-tax-reference",
    whyCitable: "A plain-English answer to what happens under DAC7 and the OECD model rules when a jurisdiction issues no individual TIN. There is very little good English-language writing on this.",
    whoWouldCite: "Accountancy and tax blogs, gig-economy policy writers, freelancer unions, and platform-compliance guides.",
  },
  {
    slug: "profitguard-growthguard-creator-programme",
    whyCitable: "A worked model for capping a creator programme at a share of the value it generates, with the arithmetic shown.",
    whoWouldCite: "Ecommerce and DTC operator newsletters, affiliate-marketing publications, and finance-for-founders writers.",
  },
];

export const OUTREACH_DOCTRINE = [
  "Nothing here places a backlink. A link from somebody else's site is theirs to give, and buying, exchanging or planting them is a Google Search Essentials spam violation that demotes a domain rather than lifting it.",
  "What earns links is a page worth citing. The three assets above exist because they answer questions with no good published answer — the payout fee table and the no-TIN piece especially.",
  "Outreach is telling the people who write about this subject that the page exists. It is not asking for a link, and it works about a tenth of the time, which is normal.",
  "The internal links in this cluster are a different thing entirely and are entirely within our gift: they tell a crawler which page is the authority on the subject and give a reader a route through the whole answer.",
];
