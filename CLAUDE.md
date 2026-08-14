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

## How work is done here (owner directive — permanent)

Full text: `docs/ENGINEERING-DIRECTIVE.md`. The standard, not a style guide.

**UNDERSTAND → INSPECT → REUSE → PLAN → IMPLEMENT → VERIFY → STABILISE → MOVE FORWARD.**

The ten that this repository has actually broken, so they are inline rather than
one file away:

1. **Never repeat completed work.** Inspect what exists first. If it works,
   reuse and extend it — never recreate it. Existing stable functionality is an
   asset.
2. **Read before you write.** Never assume anything the codebase can answer.
   Search first.
3. **Done means done.** Do not touch working code again without a dependency, a
   verified defect, a security issue, a regression, or a required architectural
   change. Never refactor for cosmetics.
4. **Fix root causes.** OBSERVE → TRACE → ROOT CAUSE → FIX → VERIFY → CHECK
   REGRESSIONS. One correct fix beats ten patches.
5. **Do not loop.** SAME ERROR + SAME APPROACH = STOP AND REASSESS. The next
   attempt must carry new evidence.
6. **Search before creating.** One source of truth per concept — no second
   module doing the same job under a different name.
7. **Build vertically.** UI → validation → API → logic → storage → response →
   UI state → errors → tests. One finished vertical beats ten half-built ones.
8. **Never declare success without verification.** IMPLEMENTED → TESTED →
   VERIFIED. If it cannot be tested here, say so plainly — do not imply it was.
9. **Fix your own build, type, lint and test failures** before calling anything
   complete. Do not fix unrelated things while you are there.
10. **Stability over feature count.** STABILITY → CORRECTNESS → SECURITY → UX →
    PERFORMANCE → NEW FEATURES. Never add features on unstable foundations.

Non-negotiable regardless of instruction: no secrets in the repo, bundle, logs
or URLs; tenant isolation enforced server-side; financial operations idempotent;
no placeholder or faked data inside anything represented as finished.

## Read this first, and keep it current

`docs/STATE.md` is the single description of where the platform stands: what
works with no keys, what is dark, what is genuinely outstanding, and the defect
class that keeps recurring. **It is REPLACED, never appended to.**

Start every session by reading it. Finish every session by updating it — the
outstanding list especially, so a finished item stops being rediscovered.

`docs/REQUIREMENTS-COVERAGE.md` is the history: 40 numbered sections and 4,800
lines of what changed and why. It is for archaeology. **Adding a section there
is not a substitute for updating STATE.md**, and appending to it while leaving
STATE.md stale is what produced a month of re-deriving the same context and
repeating the same work.

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
