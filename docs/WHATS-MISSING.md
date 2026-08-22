# MarketWar OS — What's Missing (keys, connectors, gaps)

**Current, honest status of every external dependency.**

> **Reviewed 2026-08-22.** The KEY table below is still accurate. The ❌ build
> list in §5 was not: several of those modules now exist. `docs/STATE.md` §5 is
> the current outstanding list and this file is the env-var reference.
✅ = live/confirmed · ⚙️ = set but needs one finishing step · ❌ = not wired yet.
The platform runs and sells in demo mode without the ⚙️/❌ items; this list is what
unlocks each layer's *real* effect. Set keys in **Vercel → Project → Settings →
Environment Variables**, then redeploy and press **Re-check** on the **Go-Live**
board (`/dashboard/go-live`).

---

## 1. Money path — required to charge (all ✅)

| Capability | Env var(s) | Status |
|---|---|---|
| Take payments / subscriptions | `STRIPE_SECRET_KEY` | ✅ live |
| Auto-activate on payment | `STRIPE_WEBHOOK_SECRET` | ✅ live |
| Accounts / sign-up | `FIREBASE_*` + `NEXT_PUBLIC_FIREBASE_*` | ✅ live |
| Admin surfaces | `PLATFORM_ADMIN_EMAILS` + `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` | ✅ set |
| Browser Stripe elements (optional) | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ⚙️ optional — checkout links work without it |

**Money path is fully live — you can take real payments today.**

## 2. Content & intelligence (live)

| Capability | Env var(s) | Status |
|---|---|---|
| AI generation (copy, agents, blog, offers…) | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | ✅ all 3 live |
| Real prospect/market data (Google/Places) | `SERPER_API_KEY` | ✅ live |
| Media hosting (creatives/video) | `FIREBASE_*` (Storage) | ✅ live |
| Email sending (own Brevo/SMTP infra) | `SMTP_*` + `EMAIL_FROM` (or `RESEND_API_KEY`/`SENDGRID_API_KEY`) | ✅ live |
| Verified business emails ("Find emails") | `APOLLO_API_KEY` | ⚙️ key held — set it in Vercel |

## 3. Search / local data (measured)

| Capability | Env var(s) | Status |
|---|---|---|
| Real rankings (OMNIRANK / Search Dominance / Organic) | `GOOGLE_SERVICE_ACCOUNT_JSON` (Search Console) | ✅ live |
| Local listing + reviews (Local Domination) | `GOOGLE_OAUTH_CLIENT_ID` + `_SECRET` → **Connect Google** | ⚙️ add redirect URI `…/api/google/callback`, click Connect Google on Go-Live |
| Site audit (Website Intel) | none — built-in crawler | ✅ live |

## 4. Social publishing

| Capability | Env var(s) | Status |
|---|---|---|
| Facebook + Instagram (native, best margin) | `FB_APP_ID` + `FB_APP_SECRET` → connect in Publish Center | ⚙️ optional — Page-token connect works with no app review |
| 15-channel aggregator (TikTok/YouTube/X/Pinterest…) | `ZERNIO_API_KEY` | ⚙️ set — connect each brand's socials in Publish Center |
| Publish/account event sink | `ZERNIO_WEBHOOK_SECRET` | ⚙️ set — register `…/api/webhooks/zernio` in Zernio |
| Manual "post it yourself" | none | ✅ always works |

## 5. Not wired yet (❌ — remaining thin modules)

| Module(s) | What it needs | Effort |
|---|---|---|
| **WhatsApp Center** | `WHATSAPP_TOKEN` (free from Meta) **+ a send/receive UI to build** | token = you; UI = build |
| **ROI Planner / Budget Protection** | Meta Ads + Google Ads **read** OAuth (measured CAC) | build (OAuth like the Google connector) |
| **Comms catalogue** | wire the static catalogue to the live send engines | build |
| Optional SEO accelerators | `BACKLINK_API_KEY`, `LISTENING_API_KEY`, `AI_ANSWER_MONITOR_KEY`, `GOOGLE_ANALYTICS_TOKEN` | keys optional |
| Optional premium media | `OPENAI_IMAGE_MODEL`/`BFL_API_KEY` (photoreal), `OPENAI_VIDEO_MODEL`/`GEMINI_VIDEO_MODEL` (Veo/Sora MP4) | keys optional — Studio + editor work without |

## 6. Security env (set before real traffic)

`FIELD_ENCRYPTION_MASTER_KEY`, `CREATOR_LEDGER_SECRET`, `EMAIL_TRACKING_SECRET`,
`EMAIL_WEBHOOK_SECRET` — protect PII, the partner ledger and email tracking.
Generate strong random values.

---

## Bottom line

- **Sell today:** money path 100% live (Stripe + Auth), plus AI, Serper, Search
  Console, email, and the built-in crawler.
- **Finish next (⚙️, minutes each):** Apollo key · Connect Google (Business
  Profile) · Zernio social connect · Meta connect.
- **Build next (❌):** WhatsApp send/receive UI · Meta/Google Ads read for
  roi/budget.

See `docs/REAL-VS-SCAFFOLD.md` for the module-by-module depth map, and
`docs/GO-TO-MARKET-CHECKLIST.md` for the launch sequence.
