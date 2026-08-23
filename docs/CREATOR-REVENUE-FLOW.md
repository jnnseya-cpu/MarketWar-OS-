# A to Z: product on the shelf → money in the creator's bank

Every step, who does it, what code runs, and what is still missing.

Status: ✅ built · 🟡 partial · ❌ missing · 💰 money actually moves

> **Both breaks are closed.** The chain now runs end to end in code: a click is
> recorded, the brand's checkout reports the sale, it is attributed, the
> commission accrues, it ripens through the refund window, it voids on a
> chargeback and reports what must be clawed back, and the payout engine pays it.
>
> **One thing is still red, and it is the last one: custody.** Stripe Connect
> does not exist, so no money physically moves between the brand, us and the
> creator. Everything above custody is real; the pipe underneath it is not.

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

> Where 0.5% would make the transaction commercially unsafe, the product is
> marked **ineligible** rather than the creator's rate being quietly reduced. A
> headline rate that silently becomes 0.2% is a rate nobody can trust.

## 2. The brand opens a mission or programme — ✅ policy, ❌ funding held

`backend/share2earn.ts` · `backend/creator-engine.ts`

`worstCasePence` computes the maximum a mission could ever owe and **refuses to
publish** below it. Sale rewards are excluded from that requirement because they
fund themselves from the transaction.

❌ **The budget is still only a declared number.** Nothing collects or holds it —
see step 9.

## 3. The creator joins and gets a code — ✅

`backend/share2earn-signup.ts` → `joinShare2Earn` · bands in
`shared/creator-program.ts`

Share2Earn's rate is **derived** as the minimum of its own cap and the lowest
influencer rate, so it can never overtake the influencer tiers and there is no
number to remember to update.

## 4. The creator posts; the buyer clicks — ✅

`app/r/[code]/page.tsx` → **`backend/referral-clicks.ts` → `recordClick()`** →
redirect to the brand's own destination with `?ref=CODE&mw_ref=CODE`.

Every click is now recorded: code, brand, time, referring **host**.

- A refresh is **not** a second click (30-minute dedupe) — paying per click for a
  page reload is paying for nothing.
- **No raw IP and no user agent are ever stored**, only a salted hash, and the
  salt changes **per code and per day** so the hashes cannot be joined into a
  trail across codes or days even by us. The visitor is a member of the public
  who clicked a link and has consented to nothing.
- Recording never blocks the redirect. Losing a click costs far less than losing
  the customer.

## 5. The brand's checkout reports the sale — ✅ *(was BREAK ONE)*

**`app/api/conversions/route.ts`** · `backend/conversion-postback.ts`

```
POST /api/conversions
X-MW-Signature: sha256=<HMAC-SHA256 of the raw body, per-brand secret>
{ brandId, ref, orderId, currency, checkoutTotalPence,
  lines: { productPence, taxPence, deliveryPence, tipPence, giftCardPence,
           refundedPence, cancelled },
  paymentNumber, recurring, paidAtISO }
```

`GET /api/conversions` returns the integration guide, readable without a login.

Three things it gets right, because all three are about money:

1. **Signed per brand.** The secret is an HMAC of the brand id under
   `POSTBACK_ROOT_SECRET` — no table of secrets to leak, rotating the root
   rotates everyone, and **one brand cannot sign another brand's orders**. With
   no secret configured it **refuses**: this endpoint mints money owed.
2. **Idempotent by order id.** Checkouts retry and webhooks retry; a second
   accrual pays twice for one sale. A repeat returns the *first* result.
3. **Lines broken out, or refused.** A total on its own would force a guess, and
   a guessed commission is a wrong payment — so `lines.productPence` is required
   and the refusal says why.

## 6. What the sale is worth — ✅

`backend/share2earn.ts` → `netEligibleValue` → `saleCommissionPence`

Product value **net of refunds only**. Tax, delivery, tips and gift cards are
excluded: *the merchant never keeps them, so they cannot fund a commission.*

## 7. One-off vs subscription — ✅ *(was BREAK TWO)*

**`shared/referral-attribution.ts`**

- **Renewals: the first 12 payments.** Bounded and knowable, so ProfitGuard can
  cap it. `forever` returns `null` from `maxLiabilityPence` deliberately — an
  unbounded liability has **no** maximum, and returning a big number instead
  would let a caller treat a guess as a limit.
- **Attribution window: 30 days, last click wins.** Clamped to 1–180. A click
  **after** the sale can never claim it.

> **The limitation, stated rather than hidden:** the click is on our domain, the
> purchase is on the brand's. There is no shared cookie and no way to build one,
> so we cannot match an individual visitor across that boundary. **The brand's
> own cookie is the attribution.** Our window is a *sanity check* — a sale
> claiming a code must have a click on that code inside it. It catches a stale or
> guessed code posted back months later; it cannot prove this buyer is that
> clicker, and the code does not pretend to.

## 8. It becomes payable — ✅

`backend/commission-ledger.ts` → `accrue` / `ripen` / `voidAccrual` ·
`settlementState`

**Append-only.** An accrual is never edited away and never deleted; a refund
writes a **void onto the row**, so the history still shows a sale that reversed.
The first time somebody asks why a creator was paid £40 in March, the answer has
to survive.

| State | Meaning |
|---|---|
| `unfunded` | Revenue-locked, customer has not paid. Nothing accrues. |
| `pending` | Paid, inside the refund window. Held. |
| `part_settled` | Half on payment, half on window close. |
| `settled` | Window closed. Fully payable. |
| `void` | Refunded or charged back — never becomes payable. |

`voidAccrual` reports **`clawbackPence`**: what was *already released* and must
be recovered through the payout rail. A status change cannot un-pay somebody, so
it is surfaced rather than quietly forgotten. `ripen` never moves money
backwards.

## 9. 💰 The money is split — ✅ arithmetic, ❌ **CUSTODY — THE LAST RED**

`shared/settlement-split.ts` → `splitOrder`

**creator + platform + brand === gross, exactly, always.** Whole pence, remainder
to the brand in one named place. Money inside the refund window stays in the
brand's remittance — holding a buyer's money on their behalf is a separate,
regulated activity. Refuses outright if commission + fee exceed what was paid.

> ❌ **No Stripe Connect. No collection. No transfers. No money moves.**
>
> Every number above is correct and nothing acts on them. Also still true:
> `/share2earn` is a **public page** telling creators "£X reserved" and "money
> that already exists" — **that wording must be corrected in the same change
> that adds custody**, and until then it overstates what is held.

**What Connect must add:** brand onboarding, `application_fee`, transfers to
creators, **who is merchant of record** (it decides who owes the VAT), and
executing the clawback step 8 already computes.

## 10. The creator sees it — ✅ engine, 🟡 surface

`backend/commission-ledger.ts` → `balanceFor(code)` returns released, held,
voided and order count. `backend/referral-clicks.ts` → `clickStats` returns
clicks, unique visitors and top referring hosts.

🟡 `/dashboard/partner-network`, `/share2earn` and `/partner` exist but are not
yet reading these — a small wiring job, not a build.

## 11. 💰 The creator withdraws — ✅

`backend/payout-execute.ts` · `payout-approvals.ts` · `payout-identity.ts` ·
`payout-fees.ts`

Nine rails, quoted before money moves. Identity and approval gates, balance
checked against **settled, unreversed, past-the-hold** funds, idempotent by
`requestId` so a retry cannot double-pay, and the emergency stop reaches it.

---

## What is still red, in order

1. **💰 Custody (Stripe Connect)** — step 9. The only thing between a correct
   ledger and money actually moving. Needs Stripe credentials, brand onboarding
   and a merchant-of-record decision. **Weeks, and it is the whole remaining
   risk.**
2. **The public "reserved" wording** — must be corrected with, or before, the
   above. It is a funding claim to members of the public.
3. **Mission budget actually held** — step 2. Falls out of custody.
4. **Dashboard wiring** — step 10. Hours, once someone wants to look at it.

## Setting it live

| Variable | What it does |
|---|---|
| `POSTBACK_ROOT_SECRET` | Derives every brand's postback secret. **Until it is set, `/api/conversions` refuses every order** — deliberately, because unsigned it would mint commission for anyone. |

Then the brand's checkout posts on a completed order. A Shopify / WooCommerce /
Stripe adaptor is still wanted, because a small business will not write a
postback by hand.
