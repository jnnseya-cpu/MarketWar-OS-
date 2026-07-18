# 11 — M-34 AI Transactional Email Engine (Agent 23, shipped core)

Adopted 2026-07-14 from the owner's instruction: *"massive AI agent
transactional email provider to send unlimited emails daily without landing
in spam, email addresses to be filtered and no bounce-back email to be
sent."* Implemented as deliverability engineering — each promise mapped to
the mechanism that actually delivers it:

| Owner requirement | Engineering delivery |
|---|---|
| **Massive / unlimited daily volume** | Horizontally scalable multi-provider pool (Resend → SendGrid failover shipped in `src/backend/email.ts`; SES + dedicated SMTP at P1). Infrastructure is effectively unlimited; the AI governs the **ramp** (warm-up + per-domain throttles) because reputation, not hardware, is the real ceiling — and the ramp is what protects sustained unlimited volume. |
| **Never landing in spam** | Earned inbox placement: SPF + DKIM (2048-bit) + DMARC (none→quarantine→reject ramp) + BIMI on an **isolated sending subdomain**; engagement-first warm-up; RFC 8058 one-click unsubscribe; consent enforced in the send path (doc 08 §B.3 — a send without granted consent is technically impossible); spam-trigger content linting by Agent 23; weekly seed-list inbox-placement tests (Gmail/Outlook/Yahoo/Apple). **No filter-evasion, ever** — consent + reputation are the mechanism; the platform never sends unsolicited bulk mail, which is precisely why its mail inboxes. |
| **Email addresses filtered** | Four-stage pre-send hygiene pipeline (shipped, live at `/api/email`): 1 syntax + domain validity → 2 disposable-domain + role-address filter → 3 consent + suppression-ledger check → 4 reputation governor. SMTP-handshake verification + MX cache at P1. |
| **No bounce-backs** | **Zero-bounce doctrine:** bounces are *prevented* (unsendable addresses blocked before any provider is contacted) and *never repeated* (hard bounce / complaint / unsub → permanent suppression ledger; soft bounce ×3 → cooldown → one retry → suppress; chronic non-openers sunset). Target bounce < 0.5% — 6× inside the Gmail/Yahoo 2% bulk-sender threshold. |

## Architecture

- **Sending facade** `src/backend/email.ts`: `validateAddress()` /
  `filterList()` (hygiene verdicts with per-check reasons), `suppress()`
  (ledger), `sendEmail()` (filter-first, then provider pool with failover).
  Env-guarded: no keys → simulated demo receipts, nothing leaves the machine.
- **API** `/api/email`: `validate` (up to 1,000 addresses/call) · `send`
  (transactional) · GET status. Campaign/bulk sends run via Cloud Functions
  workers at P1 (M-22 notification service), consuming the same facade.
- **Feedback loops (P1):** provider webhooks (delivered/bounce/complaint) →
  `email_events` topic → suppression writes + reputation dashboard; Gmail
  Postmaster Tools + Microsoft SNDS ingestion.
- **Collections:** `email_suppressions` (permanent, 7-yr retention with
  compliance logs) · `email_events` (36 mo) · `sender_domains` (auth status,
  warm-up state, per-domain throttle config).
- **Agent 23 — AI Email Deliverability Commander** (`email-commander`,
  shipped): posture audit, hygiene report, warm-up plan, spam-risk scan,
  send plan, zero-bounce enforcement, KPI contract. Surfaces in the Email
  Command Center (`/dashboard/email`) with the **live hygiene filter demo**
  wired to the real backend pipeline.

## KPIs (binding)

Delivery ≥ 99% · bounce < 0.5% · complaint < 0.1% · weekly seed-list
placement tests · warm-up auto-pause on complaint spike > 0.1%.

## ACU & margin

Email metered per 1,000 sends above plan allowance; hygiene validation
metered per 1,000 checks. Priced ≥ 2× blended provider cost (owner floor,
doc 08 §A.1a); provider-pool arbitration (cheapest healthy provider first)
is the cost base that keeps headline pricing attractive.
