# A to Z: product on the shelf → money in the creator's bank

Every step, who does it, what code runs, and **what is missing**.

Status: ✅ built · 🟡 partial · ❌ missing · 💰 money actually moves

**The chain has two breaks.** Steps 5 and 7. Everything else is either built or a
known small piece. Read those two first — nothing downstream can work without
them, and no amount of work elsewhere compensates.

---

## Cast

| Who | What they are |
|---|---|
| **Brand** | The company with something to sell (AxionOS, or a customer) |
| **Creator** | Share2Earn member or influencer with a tracked code |
| **Buyer** | The creator's audience member who actually pays |
| **MarketWar** | Runs the programme, computes the commission, pays the creator |

---

## 1. The brand lists what it sells — ✅

`backend/promotable.ts` · `marginAllows()`

The brand adds a product or service with its real price and cost. ProfitGuard
(`backend/profit-guard-economics.ts` → `economicsFor`) splits every future order
into a **growth pool** and a **protected margin that is never reachable**.

> **The ruling that matters:** where 0.5% would make the transaction
> commercially unsafe, the product is marked **ineligible** — the creator's rate
> is never quietly reduced. A headline rate that silently becomes 0.2% on some
> products is a rate nobody can trust.

## 2. The brand opens a mission or programme — ✅ policy, 🟡 funding

`backend/share2earn.ts` (missions) · `backend/creator-engine.ts` (programmes)

Rewards are set: fixed-fee actions (content 25p, engagement 2p, traffic 3p, lead
60p) and/or **sale commission** (0.5%, capped by `campaignLimits` at a share of
the growth pool).

`worstCasePence` computes the maximum the mission could ever owe and **refuses to
publish** if the budget is lower.

- **Revenue-locked** (Cash-Protected Growth): sale commission funds itself from
  the transaction, so only activity rewards need cash up front.
- 🟡 **The gap:** the budget is a *declared number*. Nothing collects or holds
  it. See step 9.

## 3. The creator joins and gets a code — ✅

`backend/share2earn-signup.ts` → `joinShare2Earn` · bands in
`shared/creator-program.ts`

No application, no follower minimum for Share2Earn. Influencer bands (5k / 10k)
pay more and are verified. **Share2Earn's rate is derived as the minimum of its
own cap and the lowest influencer rate**, so it can never overtake the influencer
tiers — there is no number to remember to update.

## 4. The creator posts; the buyer clicks — 🟡

`app/r/[code]/page.tsx` → `subscriptionByCode` → redirect to the **brand's own
destination** with `?ref=CODE&mw_ref=CODE`.

Links always lead to the brand's site, never back to a MarketWar page.

> 🟡 **The click is not recorded.** The route resolves the code and redirects,
> and writes nothing. So there is no click count, no timestamp, no evidence
> behind an attribution claim, and no way to spot a creator sending fake
> traffic. Cheap to fix and needed before any traffic reward is paid.

## 5. ❌ **BREAK ONE — the brand's site must tell us a sale happened**

**Nothing exists for this. It is the single thing that stops the whole chain.**

The buyer pays **on the brand's own site**, in the brand's own checkout. Our code
never sees it. Without a report back, MarketWar cannot know a sale occurred, and
therefore cannot owe, compute or pay a commission.

What has to be built — a **conversion postback**:

- an authenticated endpoint the brand's checkout calls on a completed order:
  `ref` code, order id, currency, **product value, tax, delivery, tip, gift card**
  broken out (step 6 needs those lines), and whether it is one-off or recurring;
- **idempotent by order id**, or a retry pays twice;
- signed with a per-brand secret, or anyone can post fake orders and mint
  commission;
- plus a Shopify/WooCommerce/Stripe adaptor, because a small business will not
  write a postback by hand.

Until this exists, every step below is unreachable in production.

## 6. What the sale is worth — ✅

`backend/share2earn.ts` → `netEligibleValue` → `saleCommissionPence`

Commission is computed on **product value net of refunds only**. Tax, delivery,
tips and gift cards are excluded: *the merchant never keeps them, so they cannot
fund a commission.* A cancelled or fully refunded order earns nothing.

## 7. ❌ **BREAK TWO — one-off vs subscription is undecided**

The code has no notion of a renewal earning a commission. For a subscription the
question is commercial, not technical, and it must be answered before anything is
promised to a creator:

| Option | Effect |
|---|---|
| **First payment only** | Simplest, cheapest, weakest incentive |
| **Every renewal, forever** | Strongest incentive; an unbounded liability per creator |
| **Renewals for N months** | The usual answer — bounded and still attractive |

Whatever is chosen must be **written into the creator-facing wording before a
single creator joins**. Changing it afterwards is changing the deal.

Also undecided and needed here: **the attribution window.** How long after a
click does a purchase still belong to that creator? No value exists anywhere in
the code. Without one, either every later sale is claimed forever, or none is.

## 8. It becomes payable — ✅

`backend/profit-guard-economics.ts` → `settlementState`

| State | Meaning |
|---|---|
| `unfunded` | Revenue-locked and the customer has not paid. Nothing accrues. |
| `pending` | Paid, inside the refund window. Held. |
| `part_settled` | Half released on payment, half on window close. |
| `settled` | Refund window closed. Fully payable. |
| `void` | **Refunded or charged back — the commission never becomes payable.** |

## 9. 💰 The money is split — ✅ arithmetic, ❌ custody

`shared/settlement-split.ts` → `splitOrder`

**creator + platform + brand === gross, exactly, always.** Whole pence, remainder
to the brand in one named place. Money still inside the refund window stays in
the brand's remittance — holding a buyer's money on their behalf is a different,
regulated activity. It refuses outright if commission + fee exceed what the buyer
paid, rather than paying out and invoicing later.

> ❌ **Custody does not exist.** No Stripe Connect, no collection, no transfers.
> Today `reservedPence` is a number on a record and `/share2earn` — a **public
> page** — tells creators "£X reserved" and "money that already exists". That
> wording must be corrected in the same change that adds real custody.

**What Connect has to add:** brand onboarding, `application_fee`, transfers to
creators, **who is merchant of record** (it changes who owes the VAT), and
clawback when a chargeback lands *after* a payout.

## 10. The creator sees it — ✅ dashboard, 🟡 fed by nothing

`/dashboard/partner-network`, `/share2earn`, `/partner` all exist and render
earnings. They have nothing real to show until step 5 exists.

## 11. 💰 The creator withdraws — ✅

`backend/payout-execute.ts` · `payout-approvals.ts` · `payout-identity.ts` ·
`payout-fees.ts`

Nine rails, quoted before money moves. Identity gate, approval gate, balance
check against **settled, unreversed, past-the-hold** funds. Idempotent by
`requestId`, so a retry cannot double-pay. The emergency stop reaches it.

---

## The order to build it

1. **Step 5, the conversion postback.** Nothing works without it. It is also the
   piece a brand integrates once and then forgets, so it wants to be right.
2. **Step 7's two decisions** — renewal treatment and attribution window. They
   are commercial calls and they change the creator wording.
3. **Step 4's click recording.** Small, and it is the evidence behind every
   attribution claim and the only defence against fake traffic.
4. **Step 9's custody (Stripe Connect).** The largest build. Until it lands,
   correct the public "reserved" wording.

**Sequencing note:** 1–3 can be done now and are cheap. 4 is weeks. Do not
promise a creator anything about renewals until 2 is answered.
