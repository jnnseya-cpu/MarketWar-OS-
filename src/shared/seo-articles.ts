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
