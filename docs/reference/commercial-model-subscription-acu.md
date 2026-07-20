# SOURCE IMPORT (verbatim) — Subscription, ACU & Commercial Profitability Model

> **Immutable source record** (repo law: verbatim imports in `docs/reference/`
> are not edited except credential redaction — none present here). Provided by
> the owner 2026-07-20. Truncated by the source at §14 ("Customer Value by
> Segment"); later sections to be appended when supplied.
>
> **Terminology correction (owner, authoritative):** charging £4 for every £1 of
> provider cost is a **300% markup**, producing a **75% gross margin** before
> fees/infra/support/storage/taxes. A "400% margin" is mathematically impossible
> — margin cannot exceed 100%. Correct target: **100%–400% markup, recommended
> minimum 300% markup** on AI provider costs. Implemented in `src/backend/acu.ts`
> (`marginPct` = markup, `grossMarginPct` = margin) and `subscription.ts`.

---

## 1. Commercial Positioning

Customer Promise: "One account. One subscription. One bill. Multiple brands,
teams, campaigns, channels and AI marketing tools."

MarketWar OS should remove the need to subscribe separately to: video editing,
social scheduling, AI copywriting, image generation, social listening,
competitor intelligence, email marketing, campaign planning, influencer
management, analytics, landing-page builders, brand management, AI SEO/GEO tools.

The customer pays one subscription for access to the MarketWar operating system
and consumes ACUs only when AI or computationally expensive services are used.

## 2. Commercial Model

Revenue from five sources: (1) monthly/annual subscriptions, (2) ACU top-ups,
(3) additional brands/users/workspaces, (4) premium modules + data connectors,
(5) enterprise implementation/support/private infrastructure.

Subscription pays for: platform access, user seats, brand workspaces, storage,
standard automations, publishing connections, dashboards, governance, reporting,
support, maintenance.

ACUs pay for: AI generation, AI analysis, video processing, transcription,
translation, AI research, image/video/voice generation, AI campaign
optimisation, premium data enrichment, high-compute automations.

## 3. ACU Economics

£1 = 100 ACUs (£5=500, £10=1,000, £25=2,500, £50=5,000, £100=10,000,
£500=50,000, £1,000=100,000).

Provider-Cost Rule: for every £1 of customer ACU value, MarketWar may spend a
maximum of **£0.25** with providers. → 100 ACUs sold for £1; max provider cost
£0.25; gross profit £0.75; **gross margin 75%; provider-cost markup 300%; price
= 4× provider cost.**

Mandatory formula: **Customer ACU Charge = Actual Provider Cost × 4**; **Required
ACUs = Actual Provider Cost × 4 × 100**. Examples: £0.10→40 ACUs; £0.75→300 ACUs;
£3→1,200 ACUs.

No AI action launches before: provider cost estimated → required ACUs calculated
→ customer balance checked → minimum margin validated → maximum-cost protection.

## 4. Subscription Principles

Every paid plan includes: OS access, ≥1 brand workspace, user seats, campaign
management, content calendar, brand asset management, reporting, standard
integrations, a monthly ACU allocation, ability to buy top-ups.

Automatic ACU allocation: **exactly 20% of the subscription amount paid** becomes
ACUs. `Monthly ACUs = Monthly Subscription Price × 20% × 100`. £49 → £9.80 →
**980 ACUs**; remaining £39.20 pays platform/infra/support/profit.

## 5–6. Plans (summary)

| Plan | Monthly | Annual (30% off) | Monthly ACUs | Brands | Users |
|---|---|---|---|---|---|
| Free | £0 | £0 | 100 / 12 months | 1 | 1 |
| Starter | £19 | £159.60 | 380 | 1 | 2 |
| Growth | £49 | £411.60 | 980 | 3 | 5 |
| Scale | £149 | £1,251.60 | 2,980 | 10 | 15 |
| Business | £399 | £3,351.60 | 7,980 | 30 | 40 |
| Enterprise | £999 | £8,391.60 | 19,980 | 100 | 100 |
| Corporate | £2,499 | £20,991.60 | 49,980 | 300 | 300 |
| Global | from £7,499 | from £62,991.60 | 149,980 | Custom | Custom |

Free: 100 ACUs once per approved 12-month eligibility (not renewed monthly;
30-day expiry; no rollover). Full per-plan inclusions/restrictions per source.

## 7. Annual Rule

30% subscription discount. The 20% ACU allocation is calculated on the amount
**actually paid** (not list). Annual ACUs released **monthly**, not all at once
(protects against immediate consumption, refund/fraud, sharing, unused-credit
liability). Monthly release: Starter 266, Growth 686, Scale 2,086, Business
5,586, Enterprise 13,986, Corporate 34,986, Global 104,986.

## 8. Top-Ups

Default one-click top-up = **20% of current monthly price** (= one month's
allocation): Starter £3.80/380, Growth £9.80/980, Scale £29.80/2,980, Business
£79.80/7,980, Enterprise £199.80/19,980, Corporate £499.80/49,980, Global
£1,499.80/149,980. Flexible: £5=500 … £5,000=500,000, plus custom. **No discount
on ordinary top-ups** — the 4× provider-cost recovery must stay protected.

## 9. Expiry & Rollover

Free ACUs: expire 30 days, non-transferable, no rollover. Monthly subscription
ACUs: roll over max 90 days; max balance 3 months of included ACUs; oldest
consumed first. Annual: released monthly, each allocation rolls 90 days, unused
expire at contract end. Top-up ACUs: valid 12 months; consumed after promo but
before expiry; non-refundable once partially used; transferable only between
workspaces in the same org.

## 10. One Account, Many Brands

Organisation → Business Unit → Brand → Workspace → Campaign → Asset. Organisation
holds central subscription/bill/ACU wallet, brand wallets, users, permissions,
channels, analytics, security, audit, cost allocation. Brand workspace holds
brand kit, products, sites, audiences, socials, campaigns, templates, calendar,
history, Creative Genome, brand + compliance rules.

## 11. Central ACU Wallet

Shared Wallet (startups/SMEs/small agencies) · Allocated Wallets (agencies/
multi-brand/enterprises) · Controlled Wallets (large enterprise/gov/franchise/
global — monthly allowance, daily limit, per-action limit, approval threshold,
automatic stop, authorised top-up limit).

## 12. Add-Ons

Additional brand: Starter £10, Growth £15, Scale £20, Business £25, Enterprise+
negotiated (no ACUs included). Additional user: £5/£8/£12/£15/negotiated.
Additional social: £2/£2/£1.50/£1/volume. Storage: 100GB £10, 500GB £35, 1TB
£60, 5TB £250, custom quoted. White-label: Scale £99, Business £149, Enterprise
included. Advanced API: Growth £49, Scale £99, Business included, Enterprise+
negotiated.

## 13. Premium Modules

Social Listening from £49/mo (Growth+, data passed through via ACU); Competitor
Intelligence from £39/mo (Growth+); Influencer Marketplace (Scale+, platform
commission); Advanced Revenue Attribution from £99/mo (included Business+); Live
Video Intelligence from £149/mo (livestream in ACUs); Private AI Provider
Connection (Enterprise+, setup + monthly management); Dedicated AI Model
(Corporate/Global, custom implementation + hosting).

## 14. Customer Value by Segment

*(source truncated here — to be appended when supplied.)*
