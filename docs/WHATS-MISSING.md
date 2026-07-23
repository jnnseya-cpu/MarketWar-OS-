# MarketWar OS — What's MISSING to make every part work

Only the gaps. Nothing already built is listed. Each row is something **not yet
present** that a part needs to work correctly, and the action to supply it.

Three kinds of missing:
- **KEY** — an external account/key the owner must obtain + set (code is ready).
- **BUILD** — code that does not exist yet and must be built (a key alone won't work).
- **OPS** — an infra/console setup that isn't done.

---

## 1. Keys the owner must supply (code ready, key missing)

| Part that needs it | Missing key(s) | Without it |
|---|---|---|
| Persistence, accounts, auth, ownership | `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (+ `FIREBASE_PROJECT_ID`) | Nothing saves; runs demo-only |
| Real AI (all agents/copy/strategy) | `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GEMINI_API_KEY`) | Agents return scaffolds, not real output |
| Any admin at all | `PLATFORM_ADMIN_EMAILS` (+ `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS`) | No admin access |
| Media hosting for social publishing | `FIREBASE_STORAGE_BUCKET` | Can't publish images/video to channels |
| Billing (subscriptions/ACU) + safe webhook | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | No billing; webhook runs unsafe demo mode |
| Partner payouts — rest of world | `STRIPE_SECRET_KEY` | Payout computed but no money sent |
| Partner payouts — Africa (M-Pesa/Orange/Airtel/Africell) | `BITRIPAY_API_KEY` | Payout computed but no money sent |
| Billing → ledger conversion posting | `CREATOR_LEDGER_SECRET` | Conversions can't be posted server-to-server |
| Transactional email sending | `SMTP_HOST`+`SMTP_USER`+`SMTP_PASS` (or `RESEND_API_KEY`/`SENDGRID_API_KEY`) | No email leaves the app |
| At-rest field encryption | `FIELD_ENCRYPTION_MASTER_KEY` | Sensitive fields stored unencrypted |
| Social publishing (15 channels) | `ZERNIO_API_KEY` **+ a paid Zernio account** (payment method for >2 channels) | Publishing stays demo; "free tier reached" error |
| Photoreal image backgrounds | `OPENAI_API_KEY` (+ `OPENAI_IMAGE_MODEL`) | Brand Studio uses brand-safe composer only |
| Video render (Sora/Veo) | `OPENAI_VIDEO_MODEL` / `GEMINI_VIDEO_MODEL` (+ provider key) | No AI video render |
| WhatsApp Sales Center live | `WHATSAPP_TOKEN` | Funnel is demo, no real send |
| Search Intelligence + prospect discovery | `SERPER_API_KEY` | Demo search data only |
| LeadWar Room real prospects | `APOLLO_API_KEY` | Non-contactable samples only |

## 2. Connectors that must be BUILT (a key alone will NOT work)

These modules are "coming soon" because the integration code doesn't exist yet.

| Part | Needs building | Also needs (key) |
|---|---|---|
| Organic Dominance — real search + click data | Google Search Console connector | `GOOGLE_SEARCH_CONSOLE_TOKEN` |
| Revenue attribution — traffic/organic | Google Analytics connector | `GOOGLE_ANALYTICS_TOKEN` |
| Market Listening — share-of-voice, sentiment, crisis | Social-listening connector | `LISTENING_API_KEY` (licensed data) |
| AI Visibility — mentions in ChatGPT/Perplexity/Gemini | AI-answer-monitor connector | `AI_ANSWER_MONITOR_KEY` |
| Authority Engine — backlink gaps / toxic links | Backlink-index connector | `BACKLINK_API_KEY` |
| Reliable partner follower counts | Social OAuth / licensed social-data connector | (today: AI reads public profile, or human verifies) |
| Avatar Studio — talking-head render | Avatar-render connector | avatar API key |
| Audio Studio / Dubbing — voice | TTS / voice-clone connector | audio API key |

## 3. In-house features not built yet (no external key needed)

| Part | Needs building |
|---|---|
| Screen & Presentation Recorder | browser `MediaRecorder` capture |
| Video Editor timeline | in-browser edit engine |
| Collaboration & Approvals | workflow state machine |

## 4. Operational setup not done (infra/console)

| Part | Missing | Why it matters |
|---|---|---|
| Incident detection | Error monitoring + alerting + tracing (e.g. Sentry) | Failures are silent today |
| Data safety | Firestore backups **enabled + a real test-restore** | No proven recovery; RTO/RPO unknown |
| Auth proof | Verify the auth guard on a **live Firebase** project (401/403 test) | Auth is demo-open until Firebase is live |
| Partner money proof | One live **conversion→cap→payout reconciliation** | £20k cap + idempotency only code-proven |
| Traffic safety | Load / stress / soak test | Behaviour at real traffic unknown |
| Multi-instance safety | Shared rate-limit store (Firestore/Redis) | Current limiter is per-instance |
| Security proof | Live penetration test | Live attack surface unproven |
| Regression safety | Automated unit/integration/e2e tests | Only smoke tests exist |
| Dependencies | `npm audit fix` to zero-high | Known-CVE exposure |
| AI quality | Eval set (hallucination / tool-accuracy / unsafe-action) | AI quality unmeasured |
| Email inbox placement | SPF + DKIM + DMARC on the sending subdomain | Mail may hit spam |
| Reach | Cross-browser + accessibility (keyboard/screen-reader) pass | Non-Chromium + a11y unverified |

---

### Shortest path to "all parts work"

1. **Set §1 keys** — Firebase Admin, one AI key, `PLATFORM_ADMIN_EMAILS`, Storage, Stripe (+webhook secret), email, encryption. That makes the core + billing + email + media work.
2. **Add money keys** — a payout rail (`STRIPE_SECRET_KEY`/`BITRIPAY_API_KEY`) + `CREATOR_LEDGER_SECRET`, then do the §4 reconciliation.
3. **Do §4 ops** — monitoring + tested backups + live-Firebase auth check are the launch-critical three.
4. **Build §2/§3** only when you want those specific "coming soon" modules live.

Verify each key live with `GET /api/health/live` (safe, no-spend; names the exact missing var).
