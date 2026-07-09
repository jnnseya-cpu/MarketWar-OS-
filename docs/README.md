# MarketWar OS — Engineering Documentation

This directory contains the complete production-grade specification for transforming
MarketWar OS from an agentic marketing platform into a full **AI Infrastructure
Operating System (AI-OS)**.

## Documents

| # | Document | Covers |
|---|---|---|
| ★ | [`PRODUCTION-ARCHITECTURE.md`](PRODUCTION-ARCHITECTURE.md) | **ADOPTED production standard**: Hostinger → Cloudflare → Vercel → Firebase (+ Stripe, comms APIs, AI Gateway) |
| ★ | [`DEPLOYMENT.md`](DEPLOYMENT.md) | Go-live runbook for that architecture, step by step |
| 0 | [`reference/ai-os-specification-v3-imported.md`](reference/ai-os-specification-v3-imported.md) | The original v3.0 transformation specification (imported source document — nothing removed) |
| 1 | [`ai-os/01-executive-vision-and-market.md`](ai-os/01-executive-vision-and-market.md) | Executive product vision, forensic market-gap review, competitive advantage |
| 2 | [`ai-os/02-users-and-command-centres.md`](ai-os/02-users-and-command-centres.md) | Complete user ecosystem; the AI Command Centre for every user type |
| 3 | [`ai-os/03-agent-ecosystem.md`](ai-os/03-agent-ecosystem.md) | Full agent workforce: core, executive, engineering, security, revenue, compliance and self-managing platform agents — with I/O, permissions, triggers, escalation |
| 4 | [`ai-os/04-platform-modules.md`](ai-os/04-platform-modules.md) | Module-by-module product spec + Admin Super Control Centre |
| 5 | [`ai-os/05-bitripay-and-connectors.md`](ai-os/05-bitripay-and-connectors.md) | BitriPay payment gateway API door; the full third-party connector ecosystem |
| 6 | [`ai-os/06-architecture.md`](ai-os/06-architecture.md) | Production system architecture: frontend, backend, AI orchestration, data intelligence layer, events, observability, DR |
| 7 | [`ai-os/07-database-and-api.md`](ai-os/07-database-and-api.md) | Developer-ready database schema + ERD + REST/webhook API specification |
| 8 | [`ai-os/08-monetisation-security-roadmap.md`](ai-os/08-monetisation-security-roadmap.md) | Monetisation model, security & compliance architecture, phased build roadmap |

## Reading order

Engineers start at **06 → 07 → 03**. Product starts at **01 → 02 → 04**.
Commercial/investors start at **01 → 08**. Integrators start at **05 → 07**.

## Governing principles

1. **Nothing is removed.** Every module, agent, journey and revenue stream from the
   source concept documents is preserved and upgraded — the shipped Next.js platform
   in `src/` is Phase 0 of this blueprint.
2. **Proven patterns only.** Every architectural recommendation maps to a pattern in
   production at named companies (Stripe, Salesforce, Palantir, ServiceNow, Uber,
   Cloudflare, OpenAI, Anthropic). No speculative infrastructure.
3. **AI-primary, human-escalated.** Agents act autonomously inside policy
   guardrails; humans hold escalation gates, kill-switches and audit visibility.
4. **Developer-ready.** A senior engineering organisation can build from these
   documents without further business clarification.
