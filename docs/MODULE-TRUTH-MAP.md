# MarketWar OS — Module Truth Map

**What is MEASURED, what is ESTIMATED, what is GENERATED.**
Use this to decide what a customer sees. The rule for the pilot: **only show
🟢 MEASURED and ✍️ GENERATED-that-ships-a-real-artifact.** Hide or gate the rest
until it measures something.

Definitions:
- 🟢 **MEASURED** — the number comes from a real fetch/count/API. Checkable. Safe to show.
- 🟡 **ESTIMATED** — computed by a formula from assumptions. Legitimate, but must be
  labelled, and must never sit next to a measured figure for the same thing.
- ✍️ **GENERATED** — an LLM wrote it. Value depends on whether it ends in a real
  artifact (a published page, a sent email, a downloadable image) or just text.
- 🔴 **INVENTED** — presents made-up figures as fact. Never show a customer. Fix or hide.

---

## 🟢 SHOW THESE TOMORROW — real work, checkable output

| Module | Why it's real |
|---|---|
| **Customer Vault** | Real contacts imported and stored; LTV/churn/intent scored from the actual rows. Counts are true (now uncapped — no 5,000 limit). |
| **Landing Builder** | Publishes a **real hosted page** at `/b/…`; form submissions land in the Vault as consented leads. A URL you can open is not a claim. |
| **Studio (VisualStrike)** | Renders **real PNGs** with the brand's logo/colours; downloadable and postable. (Best with a real product screenshot uploaded.) |
| **Email Center** | Really sends through your own SMTP/Brevo, filters non-consented/invalid. |
| **Sending Domains** | Real DNS lookups (`resolveTxt`/`resolveCname`) for SPF/DKIM/DMARC. |
| **Prospecting / LeadWar Room** | Real companies via live Serper (Google). |
| **Organic / OMNIRANK** | Real Search Console clicks/impressions/position — your own property. |
| **Website Intel (crawler)** | Really fetches the site and measures title/meta/H1/schema/robots/sitemap/alt. |
| **GEO Audit** *(rebuilt this session)* | Now fetches the live site: parses JSON-LD, fetches `llms.txt`/`robots.txt`, parses per-bot crawler rules, reads H1/meta/hreflang/FAQ, freshness from sitemap `lastmod`. Says **"unknown"** where it can't measure. Replaces the 9 standalone checkers in one run. |
| **Citation Radar** *(rebuilt this session)* | Now actually sends the prompt battery to your configured models and counts who is named, quoting the answer as evidence. **No key → no numbers.** |
| **Billing / ACU wallet** | Real Stripe checkout; wallet credited by verified webhook, debited on use. |
| **Revenue / Money Ledger** | Only real captured conversions. Never invents money. |

---

## ✍️ GENERATED — useful, but say so

These are LLM output. Fine to show **as drafts the user edits**, never as fact.

| Module | Caveat |
|---|---|
| Strategy, Campaign Builder, Marketing Warfare, Content Factory | Good starting drafts. Value = the user edits and ships them. |
| Offer Forge | Sound offer structures; the £ figures are the user's own inputs. |
| Outreach / First Customer messages | Real, sendable copy — the sprint ends in a real Stripe link. |
| **Brand Visual Creation Agent** | Now ends in **real rendered images** (fixed this session). Previously returned only a design brief — worthless as a deliverable. |
| **Deliverability Commander** | Advice is sound best practice, but its list-hygiene percentages are **invented** — see 🔴 below. |

---

## 🟡 ESTIMATED — label clearly, keep away from measured figures

| Module | What's modelled |
|---|---|
| **Autopilot "projected pipeline"** | £ projections from formulas, not bookings. The wording already says "estimate — not booked" — keep that prominent. |
| **ROI Planner / Budget Protection** | Modelled CAC/ROAS until Meta/Google Ads read-OAuth is connected. |
| **YouTube Intelligence** | Already labelled "deterministic ESTIMATE — not live YouTube data". Honest, but reads as guesswork to a customer. |
| **Opportunity Radar, Intent Radar, Buyer Psychology** | Scores from transparent formulas over supplied inputs. |

> **Rule:** never show an estimated score for the same thing a measured engine also
> scores. That is exactly how the GEO page showed **51/100** and **18/100** for one
> business on one screen.

---

## 🔴 FIX OR HIDE — do not put in front of a customer

| Issue | Where | Status |
|---|---|---|
| Invented citation shares ("ChatGPT 22% / Gemini 12%") | Citation Radar | **FIXED** — now measured, or no numbers at all. |
| Two contradictory scores for one business | GEO page (51 vs 18) | **FIXED** — measured path wins whenever a URL is given. |
| Agent inventing the customer's industry ("Assumed: VeryX = UK DTC e-commerce store", then "vape brand") | GEO Recon, Deliverability | **PARTLY FIXED** — brand context (product/industry/audience/logo/colours) is now sent to agents. Clear leftover placeholder text from forms. |
| Invented list-hygiene stats ("Est. 6% invalid, 4% role, 12% dormant") | Deliverability Commander | **NOT FIXED** — the vault holds the real contacts; these should be counted, not guessed. Next task. |
| Local-services template on a B2B software brand ("Postcode", "How urgent?", "Get your quote") | Landing Builder sections | **NOT FIXED** — needs business-type-aware templates. |
| Engine index reads as a developer API console (`/api/modelgate` + Run buttons) | Unified command index | **NOT FIXED** — should be admin-only, renamed "API console (operator)". |

---

## The pilot script (what to actually demo)

1. **Add their brand** — name, website, logo, colours, product, audience.
2. **Import their contacts** → Vault scores them (real counts).
3. **Website Intel crawl** + **GEO audit** → measured findings, with fixes.
4. **Publish a landing page** → real URL, real lead capture.
5. **Studio creatives** → download (upload their real product screenshot first).
6. **Prospecting** → real companies.
7. **Search Console** → their true rankings.
8. **Send one email campaign** to a consented segment.

Everything in that list produces something they can **open, download, send or
check**. That is the demo. Leave the estimate-based modules for later
conversations, once they trust the measured ones.

---

## Owner-only surfaces (never in a customer demo)
ModelGate · ACU Economics · Owner Economics · ProfitGuard · Admin Billing ·
Go-Live board · Unified engine index. These expose pricing, routing and margin.
