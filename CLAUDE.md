# MarketWar OS — Working Rules

## The Additive-Only Law (owner directive — overrides everything else)

**Everything added builds on top of, or upgrades, what already exists.
NEVER delete and NEVER downgrade previously delivered content, features,
specifications, or source material.** In practice:

- New requirements/extractions/specs are folded in as additions or upgrades;
  existing modules, agents, pages, docs and imported source text stay.
- When new content conflicts with old content, keep both: implement the
  upgrade, and record the conflict + recommended resolution in
  `docs/REQUIREMENTS-COVERAGE.md` §Gaps — do not silently overwrite.
- Verbatim source imports in `docs/reference/` are immutable records
  (except credential redaction, which is mandatory).
- Refactors must preserve behaviour and feature surface; removing a
  capability requires the owner's explicit instruction naming it.

## Repo map

- `src/` — the shipped Next.js platform (landing page, onboarding,
  15+ dashboard modules, 19 AI agents, AI Gateway, chart kit, Firebase
  scaffolding). Zero-config demo mode MUST always keep working.
- `docs/PRODUCTION-ARCHITECTURE.md` — adopted stack: Hostinger (domain) →
  Cloudflare (edge) → Vercel (frontend) → Firebase (backend), Stripe, AI
  Gateway. `docs/DEPLOYMENT.md` is the go-live runbook.
- `docs/ai-os/01–09` — the engineering blueprint (vision, command centres,
  agents, modules, BitriPay/connectors, architecture, DB+API, monetisation/
  security/roadmap, Video War Room).
- `docs/reference/` — verbatim imports of both source documents + the nine
  extraction inventories.
- `docs/REQUIREMENTS-COVERAGE.md` — master traceability register (every
  requirement → ✅ code / 📘 blueprint / 📦 backlog). Update it whenever
  requirements are added or shipped.

## Owner pricing law

Profit margin on AI actions is **never below 100%** (price ≥ 2× provider
cost) while remaining **extremely competitive and attractive** — win on a
lower cost base (caching, reuse, cheap-model routing, ACU recycling), never
by breaching the floor. Detail: docs/ai-os/08 §A.1a.

## Conventions

- Never commit credentials; any key that appears in source material gets
  redacted and flagged for rotation.
- Push to `claude/marketwar-os-platform-xrgg5r` AND mirror to `main`.
- Verify before shipping: `npm run typecheck` + `npm run build`, and
  exercise changed routes/agents against the running server.
- AI calls go through the gateway (`src/backend/gateway.ts`) — never call a
  provider directly from feature code.
- Charts use the validated palette (`src/shared/palette.ts`) and chart kit
  (`src/components/charts.tsx`).
