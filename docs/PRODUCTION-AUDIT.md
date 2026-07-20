# MarketWar OS — Production Launch Hard-Reality Audit

Auditor role: adversarial launch authority (default verdict NO-GO until proven).
Method: evidence-based — commands executed against the real codebase and a
running production build, not screenshots or documentation trust.

- **Platform:** MarketWar OS · type: AI OS (customer-acquisition SaaS)
- **Stack:** Next.js 14 (App Router, TS strict) · Firebase (Auth/Firestore/Storage/RTDB) · Stripe · AI Gateway (Anthropic→OpenAI→Gemini) · SMTP (Brevo)
- **Release candidate:** commit `3b323ca` (+ hardening fixes this pass)
- **Tested environment:** local production build (`npm run build && npm run start`), demo mode (no live keys), commit-traceable
- **Repo access:** YES · Cloud/DB/CI/Monitoring access: NO (inferred from code + config)

---

## 1. Executive Verdict

- **Final verdict: NO-GO** for unrestricted public launch. **CONDITIONAL GO** is achievable for an **invite-only limited beta** once the items in §15 "Before limited beta" are closed.
- **Launch confidence score: 58 / 100** (evidence-based; weighted by the scoring model, capped by failed mandatory gates).
- **Overall risk level: HIGH** (financial + AI-spend exposure once live; no production observability).
- **Hard-reality conclusion:** The application layer is genuinely functional and well-structured — the build is deterministic and commit-traceable, every one of the 39 engine APIs + 19 agents executes (304/304 automated smoke assertions pass), the Stripe webhook verifies HMAC signatures with a constant-time compare and is idempotent by event id, and secrets are correctly kept out of source control. **But it is not safe for open public launch.** Before this pass, every admin/financial/AI endpoint was unauthenticated and unthrottled; this audit added a demo-safe auth guard + rate limiting + CSP, but the platform still lacks production observability, tested backups/DR, load-test evidence, a multi-instance rate-limit store, and an automated test suite beyond smoke. Those are launch-gate failures (Gates 6, 8, 4-partial) that no amount of feature completeness overrides.

---

## 2. Immediate Launch Blockers

| ID | Sev | Area | Defect | Impact | Evidence | Correction | Status |
|----|-----|------|--------|--------|----------|-----------|--------|
| D-01 | P1 | AuthZ | Admin/financial API routes had **no authentication** | Anyone could change plans, read owner economics (provider cost/margin), waive payments | `grep` showed no `middleware.ts`; `/api/admin-billing`, `/api/admin-economics` had no auth check | Added `requireAuth` guard (scope-gated, enforced when Firebase Admin configured) | **FIXED** (this pass) |
| D-02 | P1 | Denial-of-wallet | AI endpoints (`/api/agents/*`) unthrottled | Once AI keys are live, a script could burn unlimited provider spend | route had no rate limit | Added in-memory `rateLimit` (240/min/IP) on the agents route | **FIXED** (per-instance); needs shared store for multi-instance → D-08 |
| D-03 | P1 | Observability | No error monitoring, structured logging or tracing in production | Failures (payments, AI, auth) can occur **silently**; no incident detection | `grep` for sentry/otel/pino/datadog → none | Wire Sentry (or equivalent) + structured logs before beta | **OPEN** (owner infra) |
| D-04 | P1 | DR | No proven backup/restore or disaster-recovery exercise | Data loss unrecoverable; RTO/RPO unknown | no backup config in repo; Firestore backups are a console setting | Enable + **test-restore** Firestore backups; document RTO/RPO | **OPEN** (owner infra) |
| D-05 | P2 | Testing | No unit/integration/e2e suite — only the smoke suite | Regressions in business logic can ship undetected | `package.json` has no jest/vitest/playwright | Add unit tests for financial + auth logic | **OPEN** |
| D-06 | P2 | Perf | No load/stress/soak testing performed | Behaviour under launch traffic unknown; no latency SLOs proven | not run (no staging env in scope) | Run k6/Artillery against staging to defined SLOs | **NOT TESTED** |
| D-07 | P2 | Deps | `npm audit`: 1 high + 7 moderate vulnerabilities | Potential known-CVE exposure | `npm audit --omit=dev` → "8 vulnerabilities (7 moderate, 1 high)" | Triage + `npm audit fix`; re-scan | **OPEN** |
| D-08 | P2 | Rate limit | Rate-limit store is in-memory (per-instance) | On multi-instance hosting the limit is per-instance, weakening the D-02 cap | `src/backend/guard.ts` uses a `Map` | Back with Firestore/Redis counter before scaling out | **OPEN** |
| D-09 | P3 | CSP | No Content-Security-Policy header | XSS blast-radius larger than necessary | header list lacked CSP | Added a functional CSP + COOP (nonce-based script-src is the follow-up) | **FIXED** (this pass) |

---

## 3. Mandatory Launch-Gate Results

| Gate | Status | Evidence | Remaining risk |
|------|--------|----------|----------------|
| 1 Build integrity | **PASS** | `npm run build` exit 0; deterministic; commit-traceable; smoke 304/0 | No unit tests (D-05) |
| 2 Critical functionality | **PARTIAL** | All 39 engines + 19 agents execute (smoke); Make Anything/Strategy/Warfare/Audit wired | Real persistence untested end-to-end (demo mode) |
| 3 Security | **PARTIAL** | No committed secrets; headers incl. HSTS/CSP/X-Frame; auth guard added | D-03 open; auth guard needs live-Firebase verification; no pen-test of live env |
| 4 Data integrity | **PARTIAL/NOT PROVEN** | E2E field encryption exists; Firestore rules deny client writes to financial collections | Backup restore unproven (D-04); tenant isolation not load-tested |
| 5 Financial integrity | **PASS (code)** | Stripe HMAC verify + `timingSafeEqual` + tolerance; idempotent by event id; server-side pricing in `acu.ts`; no client price trust | Live reconciliation not exercised (no live Stripe in scope) |
| 6 Performance | **FAIL (not tested)** | No load test run | Unknown behaviour at launch traffic (D-06) |
| 7 Reliability | **PARTIAL** | Gateway failover + bounded retries + circuit breaker (ModelGate); demo fallback everywhere | No chaos/failure-injection evidence in live infra |
| 8 Observability | **FAIL** | No monitoring/alerting/tracing (D-03) | Silent failures possible → NO-GO driver |
| 9 Privacy | **PARTIAL** | Delete-account (GDPR erasure), consent gates, E2E encryption, DPA-style rules | Deletion propagation to analytics/backups/search not tested |
| 10 Operational readiness | **PARTIAL** | Runbooks (DEPLOYMENT/GO-LIVE/REAL-TESTING); roles model + seed | No monitoring/on-call; incident ownership undefined |

**Gates 6 and 8 FAIL → mandatory NO-GO for unrestricted launch.**

---

## 4. Testing Coverage

- Automated smoke assertions: **304 executed, 304 PASS, 0 FAIL** (pages, security headers, all 19 agents, all 39 engine APIs, adversarial validation cases).
- Unit/integration/e2e: **0** (no framework). Manual API adversarial probes: performed for auth/rate-limit/headers.
- Critical-journey coverage: engines/agents PASS; payment + auth live journeys BLOCKED (no live keys/Firebase in scope).
- Role coverage: role model added + seed tool (dry-run verified); live claim-enforcement NOT TESTED (needs Firebase).
- Browser/device: landing verified via headless Chromium screenshot; full matrix NOT TESTED.

---

## 5. Architecture & Dependency Findings

- **Three-layer separation** (backend/shared/frontend) enforced by `scripts/check-layers.mjs` (PASS). Backend modules carry a `window` guard.
- **Single door to AI** via `src/backend/gateway.ts` (Anthropic→OpenAI→Gemini, retries + failover). **SPOF risk:** all AI depends on the gateway, but it fails over across providers and falls back to deterministic demo — acceptable.
- **External dependencies:** Firebase, Stripe, Brevo/SMTP, AI providers — each demo-safe (unset = fallback). Connectors are platform-managed/pooled with manual fallbacks.
- **Undocumented/shadow:** none material found. No hard-coded endpoints or committed secrets.

---

## 6. Security Findings (by severity)

- **P1:** D-01 unauthenticated admin/financial routes (FIXED, demo-safe); D-02 denial-of-wallet (FIXED per-instance); D-03 no observability (OPEN).
- **P2:** D-07 dependency vulns; D-08 in-memory rate limit; auth guard requires live-Firebase validation.
- **P3:** D-09 CSP (FIXED); nonce-based script-src follow-up; COOP added, CORP not set.
- **Good:** HSTS preload, X-Frame DENY, nosniff, Referrer-Policy, Permissions-Policy; Stripe signature verification; no secrets in git; E2E field encryption.

---

## 7. Functional & UX Findings

- Every interactive surface executes against a real API (verified). "Demo intelligence" is deterministic fallback, not a stub — flips to live with provider keys.
- "Make Anything" now builds inline (was route-only). Landing page colorful/premium restored (screenshot-verified).
- Not tested: full offline/slow-network states, keyboard-only + screen-reader passes, cross-browser matrix.

## 8. Data & Database Findings
- Firestore rules deny client writes to financial collections; RTDB deny-all. E2E encryption per business. **Backup restore NOT PROVEN (D-04).** Migrations: Firestore is schemaless; no destructive migration tooling to validate.

## 9. Payment & Financial Findings
- **Strong:** server-side pricing/margin authority (`acu.ts`), webhook HMAC + constant-time compare + timestamp tolerance, idempotency by event id (no double-credit). Demo mode does NOT enforce signature — **production MUST set `STRIPE_WEBHOOK_SECRET`** (documented). Live reconciliation NOT exercised.

## 10. AI & Agent Findings
- Reliability: failover + bounded retries + circuit breaker + ACU reserve/reconcile (provider failure → no charge). Autonomy dial caps high-risk actions; honesty/compliance gates block unsubstantiated claims. **Denial-of-wallet** was the key gap (D-02, fixed per-instance). No formal eval-set metrics yet (hallucination/tool-accuracy) — required before critical-AI public launch.

## 11. Performance Findings
- **NOT TESTED** (no staging/load harness in scope). No latency SLOs proven. Denial-of-wallet + unbounded-AI-cost were the main exposures; rate limiting now bounds per-instance.

## 12. Observability & Incident-Response Findings
- **Currently cannot detect** production failures: no error monitoring, no alerting, no tracing, no uptime/cost alerts. Audit logging exists in-app (`src/backend/audit.ts`) but is not shipped to a monitored sink. This is a NO-GO driver until addressed.

---

## 13. Fixes Implemented (this pass)

| ID | Root cause | Change | Retest | Status |
|----|-----------|--------|--------|--------|
| D-01 | No auth layer on API routes | `src/backend/guard.ts` `requireAuth` (scope-gated, enforced when Firebase Admin configured); wired into `/api/admin-billing` (`admin_billing`), `/api/admin-economics` (`platform_admin`, POST+GET) | smoke 304/0 (demo-safe: open when unconfigured) | FIXED |
| D-02 | Unthrottled AI endpoint | `rateLimit` token bucket + `clientKey`; wired into `/api/agents/[id]` at 240/min/IP → 429 + Retry-After | smoke 304/0 (under cap) | FIXED (per-instance) |
| D-09 | No CSP | `next.config.mjs`: CSP + Cross-Origin-Opener-Policy | header present (curl) | FIXED |

All fixes verified: `typecheck` + `check:layers` + `build` (exit 0) + `smoke` **304/0**.

---

## 14. Unresolved Risks

- **Accepted (demo):** auth not enforced when Firebase unconfigured — intentional for zero-config demo; enforced in production.
- **Deferred:** nonce-based CSP; shared rate-limit store (D-08); unit/e2e suite (D-05).
- **Blocked (out of scope here):** live Stripe reconciliation, load testing, backup-restore drill, live-Firebase auth-enforcement test, cross-browser/a11y matrix — all need infra/console access.
- **External dependency risks:** AI provider outage (mitigated by failover + demo fallback); Stripe/Brevo outages (mitigated by idempotency + manual fallbacks).

---

## 15. Required Pre-Launch Action Plan

**Before any launch**
- Set `STRIPE_WEBHOOK_SECRET` in prod (else signatures unenforced). [owner, P0]
- Verify the new auth guard against a live Firebase project (seed a role account, confirm 401/403 on admin routes without/with wrong role). [eng, P1]

**Before limited beta (invite-only)**
- D-03 wire error monitoring + alerting + structured logs. [SRE, P1]
- D-04 enable + **test-restore** Firestore backups; document RTO/RPO. [DBRE, P1]
- D-07 `npm audit fix` + re-scan to zero high. [eng, P2]
- Define + verify rollback (App Hosting previous release) and a kill-switch (unset `ANTHROPIC_API_KEY` → demo). [release, P2]

**Before full public launch**
- D-06 load/stress/soak to defined SLOs on staging. [perf, P2]
- D-08 shared rate-limit store; D-05 unit tests for financial + auth. [eng, P2]
- AI eval-set metrics (hallucination/tool-accuracy/unsafe-action). [AI, P2]
- Cross-browser + accessibility (keyboard/screen-reader) pass. [QA, P3]

**Within 7 / 30 days after launch**
- Cost dashboards + anomaly alerts; DR game-day; pen-test of live env.

---

## 16. Launch Configuration (recommended for CONDITIONAL GO)

- **Enabled:** all engines/agents in demo OR live; auth enforced (Firebase configured); rate limits on.
- **Limits:** invite-only sign-up; per-account AI rate cap; low Stripe volume; single region (UK/EU, matches Firestore europe-west1).
- **Kill-switch:** unset `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY` → whole platform reverts to safe deterministic demo instantly.
- **Rollback trigger:** error-rate spike or failed post-deploy smoke → redeploy previous App Hosting release.

---

## 17. Final Launch Decision

**This release is NOT approved for unrestricted public launch.**
It is approvable for a **restricted, invite-only beta** once the "Before any launch" and "Before limited beta" items in §15 are closed and retested — specifically live-Firebase auth enforcement, `STRIPE_WEBHOOK_SECRET`, error monitoring, and a proven backup restore. The application and financial-control layers are strong; the gaps are operational (observability, DR, load evidence), and those are the reason for the hold.
