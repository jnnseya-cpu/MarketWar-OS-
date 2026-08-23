# A to Z: product on the shelf → money in the creator's bank

Every step, who does it, and what code runs.

Status: ✅ built · 💰 money actually moves · 🔑 needs one key set

> **The chain is complete.** Every step is built and tested. Three steps need a
> key before money physically moves — marked 🔑 and listed at the end.
>
> **What "green" means here, precisely:** the code exists, is tested, and refuses
> honestly when a key is absent. It does **not** mean money has moved in
> production — nothing has, because no key is set and there are still no
> customers. Green is "built and verified", not "battle-tested".

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

`backend/promotable.ts` → `marginAllows()` · `backend/profit-guard-economics.ts`
→ `economicsFor()`

Every future order is split into a **growth pool** and a **protected margin that
is never reachable**.

> Where 0.5% would make the transaction commercially unsafe the product is marked
> **ineligible**, rather than the creator's rate being quietly reduced. A headline
> rate that silently becomes 0.2% is a rate nobody can trust.

## 2. 💰 The brand funds the float — ✅ 🔑

`shared/float-ledger.ts` · `backend/brand-float.ts` → `startTopUp` /
`creditTopUp` / `holdForMission`

**This is custody, and it is why the money is real.** The brand pays into a
commission float via Stripe Checkout. A mission reserves against it and
**cannot promise money that is not there** — the refusal states the exact
shortfall.

> **Why a float rather than a cut of the checkout.** The obvious design is for
> the buyer's money to flow through us so the commission can be taken on the way
> past. It cannot: the buyer pays on the **brand's own site**, in their Shopify
> or Stripe checkout, and **the brand is the merchant of record**. Sitting in
> that flow would mean replacing their till — which no working shop will do — and
> would move the VAT liability onto us. Collecting from the brand up front works
> whoever owns the checkout, and means MarketWar never fronts a commission from
> its own balance sheet.

**The law, checked on every single operation:**

```
available + held + paidOut === toppedUp − refunded
```

Append-only, and the balance is **derived** every time — a stored total and a
list of entries are two sources of truth about one pile of money, and they drift
on the first retry. Entry ids are a hash of brand + kind + ref, so a retried
webhook is one row, not two. Only the **webhook** credits, never the browser
returning from checkout: a customer reaching a success page has not necessarily
paid.

A hold is a **promise** — the brand cannot refund money reserved against a live
mission while it runs.

## 3. The creator joins and gets a code — ✅

`backend/share2earn-signup.ts` → `joinShare2Earn` · bands in
`shared/creator-program.ts`

Share2Earn's rate is **derived** as the minimum of its own cap and the lowest
influencer rate, so it can never overtake the influencer tiers and there is no
number to remember to update.

## 4. The creator posts; the buyer clicks — ✅

`app/r/[code]/page.tsx` → `backend/referral-clicks.ts` → `recordClick()` →
redirect to the brand's own destination with `?ref=CODE&mw_ref=CODE`.

- A refresh is **not** a second click (30-minute dedupe).
- **No raw IP and no user agent are ever stored** — only a salted hash, and the
  salt changes **per code and per day**, so hashes cannot be joined into a trail
  across codes or days even by us. The visitor clicked a link; they have consented
  to nothing.
- Recording never blocks the redirect. Losing a click costs less than losing the
  customer.

## 5. The brand's checkout reports the sale — ✅

`app/api/conversions/route.ts` · `backend/conversion-postback.ts`

```
POST /api/conversions
X-MW-Signature: sha256=<HMAC-SHA256 of the raw body, per-brand secret>
{ brandId, ref, orderId, currency, checkoutTotalPence,
  lines: { productPence, taxPence, deliveryPence, tipPence, giftCardPence,
           refundedPence, cancelled },
  paymentNumber, recurring, paidAtISO }
```

`GET /api/conversions` returns the integration guide, readable without a login.

This endpoint **mints money owed**, so it is the strictest in the platform:

1. **Signed per brand.** The secret is an HMAC of the brand id under one root —
   no table of secrets to leak, rotating the root rotates everyone, and **one
   brand cannot sign another's orders**. With no secret it **refuses**.
2. **Idempotent by order id.** Checkouts and webhooks retry; a second accrual
   pays twice for one sale. A repeat returns the *first* result.
3. **Lines broken out, or refused.** A bare total forces a guess, and a guessed
   commission is a wrong payment.

## 6. What the sale is worth — ✅

`backend/share2earn.ts` → `netEligibleValue` → `saleCommissionPence`

Product value **net of refunds only**. Tax, delivery, tips and gift cards are
excluded: *the merchant never keeps them, so they cannot fund a commission.*

## 7. One-off vs subscription — ✅

`shared/referral-attribution.ts`

- **Renewals: the first 12 payments.** Bounded and knowable, so ProfitGuard can
  cap it. `forever` returns `null` from `maxLiabilityPence` deliberately — an
  unbounded liability has **no** maximum, and returning a big number would let a
  caller treat a guess as a limit.
- **Attribution window: 30 days, last click wins.** Clamped to 1–180. A click
  **after** a sale can never claim it.

> **The limitation, stated rather than hidden:** the click is on our domain, the
> purchase is on the brand's. There is no shared cookie and no way to build one,
> so we cannot match an individual visitor across that boundary. **The brand's
> own cookie is the attribution.** Our window is a *sanity check* that catches a
> stale or guessed code posted back months later; it cannot prove this buyer is
> that clicker, and the code does not pretend to.

## 8. It becomes payable — ✅

`backend/commission-ledger.ts` → `accrue` / `ripen` / `voidAccrual` ·
`settlementState`

**Append-only.** A refund writes a **void onto the row** rather than deleting it,
so the history still shows a sale that reversed.

| State | Meaning |
|---|---|
| `unfunded` | Revenue-locked, customer has not paid. Nothing accrues. |
| `pending` | Paid, inside the refund window. Held. |
| `part_settled` | Half on payment, half on window close. |
| `settled` | Window closed. Fully payable. |
| `void` | Refunded or charged back — never becomes payable. |

`voidAccrual` reports **`clawbackPence`**: what was *already released* and must
be recovered. A status change cannot un-pay somebody, so it is surfaced rather
than forgotten. `ripen` never moves money backwards.

## 9. 💰 The money is split — ✅

`shared/settlement-split.ts` → `splitOrder`

**creator + platform + brand === gross, exactly, always.** Whole pence, remainder
to the brand in one named place — rounding each share separately creates or
destroys a penny per order, and across a million orders that is a reconciliation
failure nobody can find. Money inside the refund window stays in the brand's
remittance: holding a buyer's money on their behalf is a separate regulated
activity. Refuses outright if commission + fee exceed what was paid.

## 10. The creator sees it — ✅

`backend/commission-ledger.ts` → `balanceFor(code)` returns released, held,
voided and order count. `backend/referral-clicks.ts` → `clickStats` returns
clicks, unique visitors and top referring hosts.

Surfaces: `/dashboard/partner-network`, `/share2earn`, `/partner`.

> The public mission card now says **"£X held for this mission"** only when the
> float actually holds it, and **"£X budgeted — not yet funded"** when it does
> not. It previously said "reserved" for every mission, to anybody who visited,
> while nothing held the money. Somebody decides whether to do work on the
> strength of that line.

## 11. 💰 The creator withdraws — ✅ 🔑

`backend/payout-execute.ts` · `payout-approvals.ts` · `payout-identity.ts` ·
`payout-fees.ts` · funded by `backend/brand-float.ts` → `payoutFromHold`

Nine rails, quoted before money moves. Stripe Connect transfers are real
(`api.stripe.com/v1/transfers`) with an `Idempotency-Key` carrying the same
reference as our own claim, so a retry is safe at both layers. Identity and
approval gates, balance checked against **settled, unreversed, past-the-hold**
funds, and the emergency stop reaches it.

A payout **consumes the hold**, never the spendable balance — otherwise paying a
creator would silently free the reservation that was protecting them.

---

## 🔑 To make money actually move

| Variable | Without it |
|---|---|
| `POSTBACK_ROOT_SECRET` | `/api/conversions` **refuses every order** — unsigned it would let anyone mint commission. |
| `STRIPE_SECRET_KEY` | No float can be topped up, so no mission can be funded and no creator can be paid. |
| `STRIPE_WEBHOOK_SECRET` | Top-ups are never credited — only the webhook credits a float. |

Then point the brand's checkout at `POST /api/conversions` on a completed order.

## Still wanted, and honestly not built

- **A Shopify / WooCommerce / Stripe adaptor.** A small business will not write a
  postback by hand. The endpoint is done; the plugin that calls it is not.
- **Chargeback clawback execution.** Step 8 *computes* `clawbackPence`; recovering
  it from a creator who has already withdrawn needs a rail-level reversal.
- **Brand-facing float top-up screen.** `startTopUp` returns a Checkout URL;
  nothing renders a button yet.
