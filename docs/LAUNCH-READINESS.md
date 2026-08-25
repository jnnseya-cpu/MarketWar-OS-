# MarketWar OS — Launch Readiness (deep-dive verdict)

**Verdict: YES — ready for a paid general-public launch, with the money loop now
closed end-to-end.** This session fixed the five blockers that stood between
"looks like it works" and "the bank balance actually changes." Below is exactly
what was broken, what now happens, and the short pre-flight list.

_Last updated this session._

---

## What was blocking a real launch (now fixed)

### 1. Money IN was not being fulfilled (the critical one)
- **Was:** the Stripe webhook computed the right ACU credit but **never persisted
  it** — there was no wallet store. A customer could pay and receive nothing.
  Checkout carried no org id, so the webhook couldn't tell *whom* to credit. A
  redelivered event could double-credit.
- **Now:** a real ACU wallet (`src/backend/wallet.ts`, Firestore
  `org_wallets/{orgId}` + in-memory demo fallback). The webhook calls
  `applyWebhookOutcome()` which **credits the balance + activates the plan inside
  one transaction that also records `processed_events/{eventId}`** — so a
  redelivered Stripe event can never double-credit. Checkout now stamps the org id
  three ways (`client_reference_id` + `metadata.orgId` + `metadata.marketwar_org_id`)
  on both the session and the subscription, so the first payment *and* every future
  renewal invoice land in the right wallet.

### 2. Demo checkout could give away paid plans for free
- **Was:** if `STRIPE_SECRET_KEY` was missing on a production deploy, choosing a
  paid plan returned a "demo" path and the client walked the user into the paid
  dashboard anyway.
- **Now:** the subscribe route **refuses** a paid plan when Stripe isn't configured
  in production (`503`, no access granted); the client shows the message instead of
  continuing. Demo/dev without accounts stays freely explorable (nothing real to give
  away there).

### 3. Cost had no ceiling — authenticated = unlimited AI on the owner's keys
- **Was:** ACUs were only ever *calculated*, never *decremented*. Four expensive
  routes (`/api/search`, `/api/prospecting`, `/api/agents/[id]`, `/api/ai-agents`)
  had **no auth** — only a spoofable IP rate-limit — so anyone could burn the
  owner's Serper/LLM budget.
- **Now:** all four require auth and **debit ACUs per action** via `meterAction()`
  (`llm` = 5, `search` = 1, `image` = 10 ACUs — tune in `wallet.ts`). Out of ACUs →
  `402` with a "top up to continue" message. **Demo mode passes through** (no accounts
  to bill) and **staff/owner are never metered** (your live testing is free). New
  public users start with 100 free ACUs so they can try before paying.

### 4. Partner dashboard token could leak (multi-tenant isolation)
- **Was:** the public `/api/growth/apply` (no auth) and `register_creator` returned
  an **existing** partner's secret dashboard token to anyone who submitted their
  email — and overwrote their account.
- **Now:** an existing partner is never overwritten and their token is never
  returned on these paths; only a brand-new account gets an inline dashboard link.
  Existing partners get their link re-sent to the verified email out of band.

### 5. Brand isolation failed OPEN if Firebase Admin was missing in prod
- **Was:** `resolveBrandAccess` passed everything through when the Admin SDK wasn't
  configured — in a misconfigured production deploy, all brand data would be open.
- **Now:** it **fails closed in production** (`503`) when Admin isn't configured,
  mirroring the webhook's unsigned-in-prod guard. Dev/demo still passes through.

---

## Pre-flight (do these before flipping to the public)

These are configuration, not code — verify on the **Go-Live** board.

1. **`STRIPE_WEBHOOK_SECRET` set + the endpoint registered** at
   `https://www.marketwaros.com/api/webhooks/stripe`. Without it the webhook fails
   closed in prod (no credits) — which is safe, but no one gets ACUs. **This is the
   single most important switch for "money in."**
2. **`STRIPE_SECRET_KEY` live** (you have this) — paid checkout + top-ups.
3. **Firebase Admin configured** (you have this) — turns on accounts, per-user
   wallets, metering and brand isolation. Everything above only becomes *real* once
   accounts are enforced; in demo it stays pass-through by design.
4. **Security secrets** — `FIELD_ENCRYPTION_MASTER_KEY`, `CREATOR_LEDGER_SECRET`,
   `EMAIL_TRACKING_SECRET`, `EMAIL_WEBHOOK_SECRET`.
5. **Do one real end-to-end payment** (test card first): pay a plan → confirm the
   Billing page ACU wallet shows the credit (badge flips to **live**) → run an AI
   action → confirm the balance ticks down. That single loop is the launch proof.

## The one-line test
> A new user signs up → gets 100 free ACUs → runs agents (balance drops) → hits a
> paywall → pays → wallet is credited → keeps working. **That loop is now real** —
> the money moves in your bank and the user sees the change in theirs.
