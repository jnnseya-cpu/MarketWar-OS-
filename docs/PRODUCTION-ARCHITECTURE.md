# MarketWar OS — Production Architecture & Deployment Strategy

**Status: ADOPTED — official long-term production standard.**
This document is the baseline architecture for all engineering and technical
design work. The AI-OS blueprint in `docs/ai-os/` (notably
`06-architecture.md`) is implemented **on top of** this stack; where the two
documents overlap, this one governs infrastructure decisions.

## Objective

A highly scalable, secure, cost-efficient, globally distributed architecture
supporting millions of users, billions of API requests, AI workloads, large
document storage, real-time collaboration and enterprise-grade security —
with minimal operational complexity and maximum flexibility for expansion.

## Overall architecture

```
                         Users
                           │
                           ▼
                  Hostinger (Domain & DNS registration)
                           │
                           ▼
             Cloudflare (DNS, CDN, WAF, DDoS, edge cache)
                           │
                           ▼
                Vercel (Next.js frontend + light API routes)
                           │
                           ▼
────────────────────────────────────────────────────────────
                 Firebase Platform (Backend)
────────────────────────────────────────────────────────────
  Authentication · Firestore · Storage · Cloud Functions
  Cloud Run (heavy services) · Cloud Messaging (FCM)
  Remote Config · App Check · Analytics · Crashlytics
────────────────────────────────────────────────────────────
                           │
                           ▼
  External services: Stripe · AI Gateway (Claude/OpenAI/Gemini)
  Email · SMS · WhatsApp Business API · Maps · Payment gateways
```

## 1. Domain & DNS — Hostinger

**Responsibilities:** domain registration, DNS management, DNS records,
subdomain routing, SSL configuration where applicable.

**Hostinger SHALL NOT host:** frontend, backend, APIs, database, or storage.
Its sole purpose is domain ownership and DNS management. In practice, the
domain's nameservers are delegated to Cloudflare (§2) and Hostinger retains
registration only.

## 2. CDN & security layer — Cloudflare

Cloudflare sits between the domain and Vercel.

**Responsibilities:** global CDN, DDoS protection, Web Application Firewall,
rate limiting, bot protection, edge caching, image optimisation, DNS
redundancy, SSL termination.

**Operating rule:** proxy (orange-cloud) the marketing/public hostnames;
keep SSL mode *Full (strict)*. Vercel remains the origin.

## 3. Frontend platform — Vercel

**Technology:** Next.js, React, TypeScript, Tailwind CSS, Server Components,
Edge Middleware, ISR, SSR, SSG — the shipped codebase in `src/`.

**Responsibilities:** landing pages, marketing website, SEO pages, all
dashboards (admin, user, business, and future role dashboards), AI
interfaces, settings, analytics UI, billing UI, reports, charts,
authentication screens, onboarding, profile management, notifications UI,
support UI, documentation, knowledge base, developer portal, help centre.

**Vercel platform duties:** fast global delivery, edge rendering, preview
deployments, automatic deployments, SEO/image optimisation, SSR/SSG.

**Vercel API usage — light routes only:** contact forms, feature flags,
lightweight validation, webhook forwarding, preview endpoints, and thin
proxies to the backend (the shipped `/api/agents`, `/api/audit`,
`/api/gateway` routes qualify while they remain thin).

**Vercel MUST NOT contain:** business logic engines, the billing engine, AI
queue processing, ACU calculations, database processing, the permissions
engine, document processing, email queues, large file upload logic,
background jobs, heavy APIs. These belong in Firebase (§7–§8).

## 4. Authentication — Firebase Authentication

Single authentication provider for the entire OS.

**Methods:** email/password, Google, Microsoft, Apple, Facebook, GitHub,
LinkedIn, phone OTP, MFA, passkeys (future).

**Responsibilities:** user authentication, session management, role
assignment (custom claims: `tenantId`, `role`), token generation, account
verification, password reset, account recovery, security rules identity,
enterprise authentication.

Client wiring lives in `src/frontend/firebase-client.ts`; server-side token
verification in `src/backend/firebase-admin.ts`.

## 5. Database — Cloud Firestore

Everything stored as scalable document collections: users, profiles,
businesses, projects, orders, invoices, subscriptions, payments, AI history,
ACU wallet, transactions, analytics, CRM, messages, notifications, audit
logs, permissions, reports, lead data, marketing campaigns, reviews,
bookings, quotes, support tickets, and future vertical modules (education,
travel, construction, healthcare, government).

Rules of record: `firestore.rules` (deny-by-default, tenant-scoped).
Indexes: `firestore.indexes.json`. The relational/financial contract in
`docs/ai-os/07-database-and-api.md` maps onto these collections until the
Phase-2 PostgreSQL migration described there.

## 6. File storage — Firebase Storage

Images, videos, documents (PDF/Word/PowerPoint/Excel), CAD/BIM files,
invoices, receipts, certificates, identity/visa/medical documents,
construction drawings, media assets, audio, generated AI content, backups,
exports.

**Storage rules:** role-based, encrypted, versioned, auditable —
`storage.rules` is the deny-by-default baseline.

## 7. Backend compute — Cloud Functions

Authentication hooks, billing, Stripe webhooks, ACU calculations, payment
processing, AI request routing, notifications, email/SMS/WhatsApp sending,
role changes, permission validation, background processing, database
triggers, scheduled jobs, queue workers, compliance checks, fraud detection,
reporting, audit logs.

## 8. Heavy compute — Cloud Run

Large AI processing, media rendering, image/video generation and processing,
large imports, bulk email jobs, bulk data extraction, large report
generation, document OCR, machine learning, long-running jobs, large queue
processing, future enterprise modules.

## 9. AI infrastructure — the provider layer

External providers: **Anthropic Claude, OpenAI, Google Gemini**, future
providers. AI routing is abstracted behind a provider layer so providers can
be switched without touching application logic — **implemented as the AI
Gateway** (`src/backend/gateway.ts`): configurable routing order, per-provider
retry/backoff, automatic cross-provider failover, `GET /api/gateway` health.
Long-running AI jobs execute from Cloud Functions/Cloud Run (§7–§8), calling
the same gateway contract.

## 10. Payments — Stripe

Subscriptions, one-off payments, ACU purchases, invoices, refunds, taxes,
coupons, trials, enterprise billing, usage billing, webhooks (received by a
Cloud Function, never by Vercel). The BitriPay gateway
(`docs/ai-os/05-bitripay-and-connectors.md`) composes alongside Stripe as
the OS-native rail on its own roadmap phase.

## 11. Communication layer

- **Email:** transactional, marketing, bulk campaigns
- **SMS:** OTP, notifications, marketing, alerts
- **WhatsApp Business API:** support, marketing, automation, booking updates
  (the WhatsApp Sales Center's live channel)
- **Push:** Firebase Cloud Messaging

All sends flow through Cloud Functions with the consent checks defined in
the AI-OS blueprint (consent is enforced in the send path).

## 12. Security (mandatory)

App Check · Firestore security rules · Storage security rules · Cloud
Functions authentication · rate limiting · role-based access control ·
encrypted data · audit logs · token rotation · Secrets Manager · environment
isolation · least-privilege principle. Threat model detail:
`docs/ai-os/08-monetisation-security-roadmap.md` §B.

## 13. Monitoring

Firebase Analytics, Crashlytics, Performance Monitoring, Cloud Logging,
Cloud Monitoring, Error Reporting, usage analytics, API monitoring, billing
monitoring, security monitoring.

## 14. CI/CD

```
GitHub → Vercel (frontend, automatic + preview deployments)
       → Firebase (rules/functions via GitHub Actions + firebase-tools)
```

Environment separation: development → testing → staging → production, with
feature previews and rollback support. One Firebase project per environment.

## 15. Scalability strategy

Designed for millions of users and businesses, billions of records,
petabytes of storage, large AI workloads, global CDN delivery, real-time
collaboration, enterprise customers and government-scale deployments —
horizontal scaling with minimal architectural change (Firestore and
Cloud Run scale horizontally by default; cell-based partitioning at extreme
scale per `docs/ai-os/06-architecture.md` §10).

## Final technical decision

| Layer | Provider | Scope |
|---|---|---|
| Domain | **Hostinger** | Registration and DNS ownership only |
| Edge | **Cloudflare** | DNS acceleration, CDN, DDoS, WAF, caching, SSL, edge optimisation |
| Frontend | **Vercel** | Next.js frontend, dashboards, marketing, global delivery |
| Backend | **Firebase** | Auth, Firestore, Storage, Cloud Functions, Cloud Run, FCM, security, business logic |
| Billing | **Stripe** | Subscriptions, ACU purchases, invoicing, refunds, payments |
| Comms | **External APIs** | Email, SMS, WhatsApp, voice, notifications |
| AI | **AI Gateway** | Multi-provider abstraction: Claude, OpenAI, Gemini, future providers |

Adopted as the long-term production standard for the optimal balance of
performance, scalability, security, cost efficiency, operational simplicity,
maintainability and future extensibility.

**Go-live runbook:** [`DEPLOYMENT.md`](DEPLOYMENT.md)
