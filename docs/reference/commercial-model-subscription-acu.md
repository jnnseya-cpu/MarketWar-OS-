# SOURCE IMPORT (verbatim) — Subscription, ACU & Commercial Profitability Model

> **Immutable source record** (repo law: verbatim imports in `docs/reference/`
> are not edited except credential redaction — none present here). Provided by
> the owner 2026-07-20. Complete (§1–22).
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

- **Freelancer/microbusiness** (from £19): brand workspace, campaign creation, social content, scheduling, AI generation, basic analytics.
- **Small business** (from £49): one OS for several brands, team collaboration, content generation, video repurposing, social publishing, campaign analytics, website + product marketing.
- **Growing agency** (from £149): multiple client brands, client approvals, bulk content, white-label reports, campaign automation, profitability tracking, centralised billing.
- **Large business** (from £399): multi-brand governance, department budgets, approval workflows, advanced attribution, campaign automation, revenue optimisation.
- **Enterprise** (from £999): central governance, advanced permissions, business units, security controls, API access, audit logs, dedicated support, central ACU management.
- **Global organisation** (from £7,499): global control with local execution, centralised procurement, one contract, one bill, regional brands + teams, data + security controls, custom infrastructure, executive governance.

## 15. Upgrade Triggers

Recommend an upgrade when a customer repeatedly reaches structural limits. Signals:
ACU top-ups exceed 50% of subscription price for three months; user-seat limit
reached; brand limit reached; social-connection limit reached; storage >80%;
campaign limit reached; API limits repeatedly reached; needs advanced approval;
needs white labelling; needs centralised business units; needs enterprise
security. The recommendation must show: current monthly spend, current add-on
spend, proposed plan, additional capabilities, expected monthly saving,
additional included ACUs, operational benefits.

## 16. Downgrade Protection

On downgrade: existing assets remain accessible; excess brands become read-only;
excess users lose editing access; active automations paused; premium
integrations disconnected after notice; purchased top-up ACUs remain valid;
included subscription ACUs follow the new plan; data not immediately deleted.

## 17. Profitability Controls

Hard margin floor: no AI action sold for less than **4× underlying provider
cost** unless expressly approved as promotional credit, customer-acquisition
incentive, contracted enterprise discount, or service-recovery credit. Provider
routing selects by: quality requirement, cost, speed, failure rate, customer
plan, customer-selected mode, commercial rights, geographic availability.
ProfitGuard: **Net AI Contribution = ACU Revenue − Provider − Processing −
Payment**. Each action stores: customer ACUs charged, revenue, provider cost,
rendering cost, storage cost, gross contribution, gross margin, provider used,
retry cost, failure cost. Margin alerts: **Green ≥75%, Amber 65–74.99%, Red
<65%, Blocked below configured minimum.**

## 18. Discount Governance

The annual 30% discount is the main standard subscription discount. Additional
discounts must NOT auto-apply to: ACU top-ups, provider pass-through fees,
implementation, custom development, premium data, dedicated infrastructure,
creator payments, advertising spend, third-party licences. Max discount
authority: sales rep ≤5%, sales manager ≤10%, commercial director ≤20%,
executive >20%, annual standard 30%. Discounts must not reduce ACU charges below
the 4× provider-cost rule.

## 19. Enterprise Commercial Fees

Enterprise onboarding from £2,500; corporate onboarding from £10,000; global
implementation £25,000–£250,000+; custom integration from £1,500 per integration;
data migration quoted by volume/complexity. Training: remote team from £750,
department from £2,500, enterprise programme custom, on-site expenses +
professional fees. Premium support: enhanced 10% of ACV; 24/7 critical 15–20% of
ACV; dedicated embedded specialist separately contracted.

## 20. Commercial Protection

Every subscription includes: automatic renewal, payment-method validation,
failed-payment retries, grace period, service restriction after non-payment, ACU
hard stop, spend limits, fraud monitoring, account-sharing controls, fair-use
policy, storage limits, export limits, provider-cost adjustment clause, currency
adjustment clause, tax treatment, refund policy, data-retention policy. MarketWar
reserves the right to adjust ACU consumption rates when provider costs change —
the customer's purchased ACU quantity stays unchanged, but future actions may
require different ACU amounts based on current provider costs.

## 21. Customer-Facing Pricing Message

Headline: **"One Marketing OS. Every Brand. Every Campaign. One Predictable
Bill."** Supporting: stop paying separately for disconnected content, video,
social, campaign, analytics and AI tools; one account for all brands, users,
channels and campaigns; every paid plan includes platform access + an automatic
AI credit allowance; add ACUs for more AI power without changing your
subscription. Promise: start free · upgrade as you grow · manage several brands
under one account · pay only for the AI you use · keep control of budgets · see
where every ACU is spent · connect marketing to revenue · save 30% annually.

## 22. Recommended Commercial Decision

Free £0 · Starter £19 · Growth £49 · Scale £149 · Business £399 · Enterprise
£999 · Corporate £2,499 · Global from £7,499. Protects MarketWar via: recurring
platform revenue, 20% controlled ACU inclusion, 4× provider-cost recovery, paid
top-ups, brand/user add-ons, enterprise implementation fees, premium support,
module revenue, data/integration revenue.

**Final commercial formula:** Subscription pays for access + operating capacity.
ACUs pay for AI consumption. Add-ons pay for structural expansion. Enterprise
fees pay for complexity. Annual plans release ACUs monthly (not all at once) —
preserving the 30% discount while protecting cash flow, provider exposure and
consumption risk.
