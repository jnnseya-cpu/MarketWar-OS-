# MarketWar OS — Real vs Scaffold Map

**Purpose:** an honest, module-by-module audit of what is *fully real*, what is
*real but needs a provider key to produce external effects*, and what is *thin*
(deterministic/modelled/display-only). Use this to decide **where to invest
depth** before building more.

**Method:** each module was read at three layers — its dashboard page, its API
route, and the backend module(s) it calls — and classified from the **code**, not
the marketing copy. Date: 2026-07-26.

## Legend

| Tier | Meaning |
|---|---|
| 🟢 **FULLY-LIVE** | Works end-to-end on real data with **no external key**. Real persistence/compute. |
| 🟡 **LIVE-ON-KEY** | Real implementation; produces real *external* effects only when a provider key is set (else an honest demo/deterministic fallback — never fabricated data). |
| 🔴 **THIN** | Mostly deterministic/modelled/seeded estimates or a display surface. Honest, but not backed by real measured data yet. |

**Tally: 🟢 26 fully-live · 🟡 16 live-on-key · 🔴 11 thin (53 modules).**
Nothing fabricates data — thin modules label their numbers as estimates.

---

## 🟢 Fully-live (26) — real today, no key

**Customer & data**
- **customers** — stored contacts (Firestore/in-memory) scored RFM/LTV/churn/intent; honest empty state. *(email-finding is the only key-gated add-on.)*
- **segments** — ranked segments built from the brand's real vault; empty vault → honest empty.
- **recovery** — sorts real vault contacts into win-back cohorts, computes recoverable £ from LTV.
- **revenue** — real per-brand results ledger + deterministic forecast. *(checkout link Stripe-gated.)*
- **money-ledger** — reads the real results ledger + local spend, computes ROI.
- **email-templates** — per-brand template CRUD persisted, real merge-token rendering.

**Growth & conversion**
- **landing-builder** — deterministic page generator + real publish to a live `/b/{brandId}/{slug}`.
- **landing-pages** — same engine; generates, publishes and lists real hosted pages.
- **war-room** — Stop/Fix/Scale verdicts computed from the real results ledger.
- **warfare** — deterministic campaign-ecosystem + AI Campaign Score engine.
- **strategy** — deterministic 7-agent builder chain (avatar → battle plan).
- **amplify** — real K-factor virality + retargeting frequency-cap maths.

**Content & creative**
- **studio** — sharp-composites real branded PNG creatives, keyless. *(OPENAI upgrades to photoreal backgrounds.)*
- **video** — deterministic clip engine + in-browser recorder/editor, keyless. *(MP4 render needs Veo/Sora; publish needs a social key.)*
- **create** — deterministic keyword/intent router. *("Build it now" then calls the AI agents.)*
- **approvals** — real state-machine approval workflow, persisted.

**Reputation, admin & infra**
- **reputation** — trust/sentiment/response-draft/fake-review-risk genuinely computed from supplied reviews.
- **go-live** — reads the live `/api/health/*` probes of the actual deployment.
- **admin** — owner economics computes real margins over the ACU ledger (owner-gated).
- **settings** — per-brand autonomy prefs persisted with brand-access auth.
- **integrations** — connector state derived from env keys + real margin-protected ACU maths.
- **audit** — real deterministic scoring from the user's intake answers, persisted.
- **command** — WARLORD speed-of-money strike queue from the brand's real ledger.
- **influencers** — real Firestore programme/ledger/payout engine. *(recruitment advisor AI-gated.)*
- **partner-network** — real creator-engine programme/subscription/ledger.
- **sending-domains** — generates a real DKIM keypair + exact DNS records, verifies via live DNS.

---

## 🟡 Live-on-key (16) — real, switch on with a provider key

| Module | What's real | Key that lights it up |
|---|---|---|
| **billing** | plan/wallet display | **STRIPE** (top-up = real checkout) |
| **inbox** | real per-brand inbound store | **SMTP/RESEND/SENDGRID** (send replies) |
| **email** | hygiene filter + vault sends + event ledger | **SMTP/RESEND/SENDGRID** (delivery) |
| **prospecting** | ICP + deal-scoring | **SERPER** (real companies) |
| **first-customer** | chained flow | **AI + SERPER + STRIPE** |
| **discover** | opportunity/leads | **SERPER** (live Google) |
| **campaigns** | copy generator | **AI provider** (ANTHROPIC/OPENAI/GEMINI) |
| **offers** | offer generator | **AI provider** |
| **autopilot** | cycle on real vault counts | **email key + CRON_SECRET** (nightly digest) |
| **content** | content-factory | **AI provider** |
| **blog** | blog generator + real store | **AI provider** |
| **publish** | cross-post + manual path | **ZERNIO or Meta** (native FB/IG) |
| **product-engine** | copy/hooks/scoring | **AI + image/video/Zernio** |
| **ai-agents** | 7 chained strategy agents | **AI provider** |
| **organic-dominance** | onboarding + metrics | **AI; SERPER/Search Console** for live metrics |
| **briefing** | real ledger panel | **AI** (strategist advisor) |

These are the **highest-leverage keys**: with your live Stripe + Serper already
on, most of this column is already producing real effects. Adding an **AI
provider key** flips the whole content/agent set from deterministic demo to real
generation.

---

## 🔴 Thin (11) — deterministic/modelled, invest here for depth

| Module | What it is now | What "real" would need |
|---|---|---|
| **roi** | hardcoded channel CAC/conversion baselines + jitter | connect real ad-platform spend/results |
| **budget** | seeded modelled campaign estimates | Meta/Google Ads spend integration |
| **comms** | static 137-event catalogue + demo deliveries | wire to the real send engines |
| **whatsapp** | deterministic demo funnel (no send UI) | **WHATSAPP_TOKEN** + a real send/receive UI |
| **engines** | display index of engines | it's a launcher — fine as-is, or make cards run live |
| **omnirank** | static registries + deterministic scores | real rank data (Search Console/SERP) |
| **search-dominance** | rosters + heuristic scores | real keyword/rank data |
| **organic** | deterministic geo audit + seeded citations | live GBP/citation feeds |
| **local** | seed-based local estimates | live Google Business Profile/map data |
| **competitors** | seeded estimate board ("never measured") | real competitor ad/SEO data feeds |
| **website-intel** | deterministic DNA/audit (seeded) | a live site crawler |

**Common thread:** the thin modules are the ones that need **third-party
measured data** (ad spend, rank tracking, local listings, site crawls, WhatsApp).
They're honest scaffolds — the logic and UI are real; the data source isn't wired.

---

## Recommended order of depth investment

1. **AI provider key** (one env var) — instantly upgrades 8 live-on-key modules
   (campaigns, offers, content, blog, ai-agents, product-engine, briefing,
   first-customer) from deterministic to real generation. Highest ROI per effort.
2. **WhatsApp** (`WHATSAPP_TOKEN` + a send/receive UI) — turns the thin WhatsApp
   funnel into a real channel; high commercial value for local businesses.
3. **Rank/local data** (Search Console + Google Business Profile, or a SERP
   provider) — lights up omnirank / search-dominance / organic / local at once,
   since they share the "needs measured data" gap.
4. **Ads data** (Meta/Google Ads read) — makes roi + budget real (measured CAC,
   not modelled).
5. **Site crawler** — makes website-intel a real audit.

Each is a *data-source wiring* job on top of logic that already exists — not a
rebuild. That's the difference between the platform's current breadth-first
state and a deep, fully-measured system.

---

## How to read this vs. what you experienced

The frustration ("feels like a prototype in places") maps exactly to the 🔴
column: those modules present a polished surface over modelled data. The 🟢 and
🟡 columns — the money path, the vault, publishing, landing pages, creatives,
email, domains — are genuinely real. The platform is **real infrastructure with
uneven depth**, and this table is the map of that unevenness so you invest where
it matters.
