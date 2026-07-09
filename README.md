# MarketWar OS

**The AI-powered growth & commerce operating system.** MarketWar OS enables anyone to discover
opportunities, create and market products, acquire customers, automate operations, optimise
revenue, and scale a business — from a single unified platform.

> Stop guessing. Launch, test, kill, improve, and convert automatically.

Most tools create content. MarketWar OS diagnoses the business, rebuilds the offer, creates
campaigns, launches experiments, tracks leads, protects the budget and tells the user exactly
what to do next.

## Platform modules

| Module | What it does |
|---|---|
| **Marketing Failure Audit** | Scores conversion risk, offer weakness, audience mismatch, trust and funnel leaks — the "why you got 0 customers" report |
| **Executive Command Center** | Live metrics bar, AI priority panel ranked by £ impact, campaign and conversation feeds |
| **Campaign War Room** | Every campaign carries a blunt SCALE / FIX / STOP verdict with the exact next action |
| **One-Click Campaign Builder** | Pick a goal → objective, audience, budget split, kill criteria and 7-day battle plan |
| **Offer Builder** | Volume, margin and recovery offers engineered with urgency and margin-safety checks |
| **Content Factory** | Strike plans where every post routes attention into channels you own |
| **Landing Page Generator** | Conversion pages + WhatsApp flow + 48-hour follow-up sequence designed as one system |
| **WhatsApp Sales Center** | Ad → WhatsApp → AI qualification → order pipeline with intent scoring |
| **Customer Intelligence Vault** | Contacts scored for engagement, intent, churn risk and recoverable revenue |
| **Lead Recovery Engine** | AI Revenue Recovery Score™ — reactivates the money sleeping in your database |
| **Budget Protection** | Pauses spend that produces no leads and reroutes it to winners, with a receipt |
| **Competitor Spy** | Threat board, exploitable gaps and ready-to-launch counter-campaigns |
| **Local Domination** | Google Business attack plans, community distribution, geo-offer grids |
| **Revenue Intelligence** | Attribution by campaign/channel, leak detection and 30-day forecasts |
| **Daily Briefing** | The AI Growth Strategist issues max five ranked orders per day |

## The agent corps

Business Diagnosis · Customer Pain · Offer Builder · Ad Creative · Campaign Commander ·
Budget Protection · Lead Capture · Competitor Spy · Local Growth · Revenue Intelligence ·
Content Factory · AI Growth Strategist

Every agent runs under the **Master Directive**: zero generic info, money first, blunt
SCALE / FIX / STOP verdicts, local fidelity, structured output.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The platform boots in **Demo Intelligence mode** — every module works with zero configuration
using deterministic simulated agent output and a demo business (Brixton Grill House).

### Going live

Copy `.env.example` to `.env.local` and add your Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5   # optional
```

With a key present, every agent call goes to the live model with the agent's system prompt.
**Never commit `.env.local` or real keys** — `.gitignore` already excludes env files.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Marketing landing page
│   ├── how-it-works/             # 7-phase mission protocol
│   ├── onboarding/               # Business Brain intake (4 steps)
│   ├── dashboard/                # The operating system
│   │   ├── page.tsx              # Executive Command Center
│   │   ├── audit/                # Marketing Failure Audit report
│   │   ├── war-room/             # Live campaign grid + verdicts
│   │   ├── campaigns/            # One-Click Campaign Builder
│   │   ├── offers/ content/ landing-pages/
│   │   ├── whatsapp/ customers/ recovery/
│   │   └── revenue/ budget/ competitors/ local/ briefing/
│   └── api/
│       ├── agents/[agentId]/     # Agent execution endpoint (live or demo)
│       └── audit/                # Deterministic failure-audit scoring engine
├── components/                   # UI kit, sidebar, AgentRunner harness
└── lib/
    ├── ai/agents.ts              # Agent registry: prompts + demo outputs
    ├── ai/provider.ts            # Anthropic client with retry/backoff + demo fallback
    ├── ai/audit.ts               # Failure-audit scoring engine
    ├── data/demo.ts              # Demo Intelligence dataset
    └── types.ts                  # Domain types
```

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run typecheck` — TypeScript check
