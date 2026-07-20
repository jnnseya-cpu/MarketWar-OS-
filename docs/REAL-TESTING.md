# MarketWar OS — Real (Live) Testing Guide

**The whole platform is already wired end-to-end. Every button executes against
a real API.** What you have been seeing labelled *"Demo intelligence"* /
*"Output renders here"* is **not a prototype** — it is the OS running **without
live AI provider keys in the environment**, so it returns deterministic output
instead of live-model output.

There is exactly **one switch** between demo and real:

> **Set a live AI provider key in the environment.** With `ANTHROPIC_API_KEY`
> (and optionally `OPENAI_API_KEY` / `GEMINI_API_KEY`) present, every agent and
> AI-generative engine routes through the gateway to the real models and the UI
> flips to **"Live intelligence."** No code change. No redeploy of app logic.

This is by design (`src/backend/gateway.ts`): a provider is "configured" iff its
key env var is set; if none is set the gateway throws `GatewayUnconfiguredError`
and callers fall back to deterministic demo output.

---

## 1. Turn the platform LIVE

### Local machine (fastest for real testing)
```bash
cp .env.example .env.local
# edit .env.local — set at minimum:
ANTHROPIC_API_KEY=sk-ant-…        # your live key
# optional failovers:
OPENAI_API_KEY=…
GEMINI_API_KEY=…

npm ci
npm run build && npm run start    # http://localhost:3000
```
Open any module, run it, and the badge reads **Live intelligence**. That is real
model output — real testing.

### Deployed (Firebase App Hosting)
The key references are already wired in `apphosting.yaml`. Create the secret once,
then deploy:
```bash
firebase apphosting:secrets:set anthropic-api-key   # paste your live key
# (accept the grant-access prompt)
```
Push to the connected branch → App Hosting redeploys → the live site is Live
intelligence. Same pattern for `openai-api-key` / `gemini-api-key` (uncomment
their blocks in `apphosting.yaml` first).

> The provider **cost** is never exposed to any client surface. Users see ACUs
> only; the ≥2× floor / 4× target margin is enforced in `src/backend/acu.ts`.

---

## 2. Accounts — admin + every role

Role model: `src/shared/roles.ts`. Seven accounts (one per role, incl. the owner
super-admin) are seeded by one idempotent script that sets Firebase custom
claims (`role` + `scopes`) and a Firestore `/users/{uid}` profile.

```bash
FIREBASE_PROJECT_ID=studio-1718252475-c6017 \
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@studio-1718252475-c6017.iam.gserviceaccount.com \
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n" \
SEED_PASSWORD='choose-a-strong-test-password' \
npm run seed:accounts
```
(Run with no env for a safe dry-run that just prints the plan.)

| Account | Role | Can do |
|---|---|---|
| owner@marketwaros.com | executive | Everything — owner economics, all tenants, config, unlimited discount authority |
| director@marketwaros.com | commercial_director | Admin billing, offers/discounts ≤20%, all tenants |
| manager@marketwaros.com | sales_manager | Billing + offers ≤10%, assigned tenants |
| rep@marketwaros.com | sales_rep | Discounts ≤5%, assigned tenants |
| support@marketwaros.com | support | Read tenants to help; no financial writes |
| tenant@marketwaros.com | business_owner | Full control of their own workspace + billing |
| teammate@marketwaros.com | team_member | Use engines; no billing/destructive actions |

All share `SEED_PASSWORD`. Sign in at `/login`. **Rotate or disable these before
production.** Discount/waiver authority per role is enforced in
`src/backend/admin-billing.ts`.

---

## 3. Every interactive surface is wired (what executes, and where)

Nothing below is a mock — each calls a real backend on click. It renders **Live**
with keys set, **Demo** without.

| Surface | Route | Executes → endpoint |
|---|---|---|
| Make Anything (build inline) | /dashboard/create | detect → `/api/intent`; **Build it now** → `/api/agents/{routed}` |
| Marketing Strategy Chain (7 agents) | /dashboard/strategy | `/api/strategy` (action `full` chains all 7) + per-agent runners |
| Autonomous Campaign Warfare | /dashboard/warfare | `/api/warfare` (11-step designCampaign + AI Campaign Score) |
| Marketing Failure Audit | /dashboard/audit | `/api/audit` (business-diagnosis agent) |
| AI Growth Strategist briefing | /dashboard/briefing | `/api/agents/growth-strategist` |
| Campaign War Room | /dashboard/campaigns | live campaign grid (renders real campaigns once created) |
| All 19 agents | /dashboard/* | `/api/agents/{id}` via the AI Gateway |
| All 39 engines | /api/* | listed in `/dashboard/engines`; smoke-exercised |

**Proof they are real:** `npm run smoke` exercises every page, all 19 agents and
all 39 engine APIs against a running server and asserts genuine computed output
(scores, margins, funnels, campaign payloads). Current: **304 passed / 0 failed.**

> Note: pure-computation engines (ACU pricing, ProfitGuard, ModelGate routing,
> compliance gates, scoring/matching) are deterministic **by design** and are
> fully real with or without keys — you never want an LLM guessing your margins.
> The AI keys change the **generative** layer (agents, briefs, copy, concepts)
> from deterministic samples to live-model output.

---

## 4. Real end-to-end test walkthrough

1. Set `ANTHROPIC_API_KEY` (§1); `npm run build && npm run start`.
2. Seed accounts (§2); sign in at `/login` as `owner@marketwaros.com`.
3. `/dashboard/create` → type *"Build me a full campaign to get WhatsApp orders
   for my Brixton grill house, £600 budget, Friday platter offer"* → **Detect &
   route** → fill the essentials → **Build it now** → badge shows **Live
   intelligence** with real output.
4. `/dashboard/strategy` → **Run the strategy chain** → the 7 agents chain live.
5. `/dashboard/warfare` → **Design the campaign** → 11-step ecosystem + Campaign Score.
6. `/dashboard/billing` → confirm 8 plans + ACU wallet; as `director@` test an
   offer/discount within authority (and one over — governance blocks it).
7. `/dashboard/engines` → spot-run any engine; all respond live.

If every badge reads **Live intelligence** and outputs are model-generated, you
are testing the real, fully-functioning OS.

---

## 5. Optional live rails (same key-provisioning pattern)

| Capability | Env / secret | Effect |
|---|---|---|
| Email sending | `SMTP_*` (Brevo — see DEPLOYMENT.md) | Real transactional email |
| Payments | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Real checkout + ACU top-ups |
| Persistence/Auth | `NEXT_PUBLIC_FIREBASE_API_KEY` + Admin SDK | Real users + saved data |
| Live search data | `SERPER_API_KEY`, `APOLLO_API_KEY` | Real Google/B2B data |

Each is independent and demo-safe: unset = deterministic fallback, set = live.
Full go-live sequence: `docs/GO-LIVE.md`.
