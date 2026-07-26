# MarketWar OS — Go-To-Market Checklist

A sequenced launch checklist: get money-ready, prove value, then sell. Each item
is a real, checkable action. Verify the technical ones on the **Go-Live** board
(`/dashboard/go-live`) — green means done.

---

## Phase 0 — Money-ready (must be green before you charge)

- [x] **Stripe live key** set + valid (`STRIPE_SECRET_KEY`) — Go-Live green
- [x] **Stripe webhook** set (`STRIPE_WEBHOOK_SECRET`) — subscriptions auto-activate
- [x] **Auth** live (Firebase) — customers can sign up
- [x] **Media hosting** live (Firebase Storage)
- [x] **Admin emails** set (`PLATFORM_ADMIN_EMAILS`) — you can reach operator surfaces
- [ ] **Security secrets** set (`FIELD_ENCRYPTION_MASTER_KEY`, `CREATOR_LEDGER_SECRET`, `EMAIL_TRACKING_SECRET`, `EMAIL_WEBHOOK_SECRET`)
- [ ] **Pricing reviewed** — plans + ACU margins confirm the ≥100% floor (`docs/ai-os/08`)
- [ ] **Legal pages** live — /terms, /privacy, /policies reflect your entity

## Phase 1 — Prove the core value works (do a real dry run)

- [ ] **Create a test brand** in the switcher (name, logo, colours, website)
- [ ] **Import contacts** → Customer Vault → confirm scoring populates
- [ ] **Find emails** on a company list (needs `APOLLO_API_KEY`) → one-click Email/WhatsApp appears
- [ ] **Generate a creative** in Studio → Download + "Post it yourself" works
- [ ] **Publish a landing page** (Landing Builder) → real `/b/…` URL, form → Vault
- [ ] **Send a test email campaign** to a consented segment → deliverability OK
- [ ] **Run the AI agents** (campaigns/offers/strategy) → real generated output
- [ ] **Log a first sale** → Revenue + Money Ledger reflect it

## Phase 2 — Turn on the data connectors (measured, not modelled)

- [x] **Serper** (`SERPER_API_KEY`) — real prospect/market data
- [x] **AI providers** (Claude/OpenAI/Gemini) — real generation
- [x] **Search Console** (`GOOGLE_SERVICE_ACCOUNT_JSON`) — real rankings in OMNIRANK/Organic
- [ ] **Business Profile** — add redirect URI to your OAuth client, click **Connect Google** on Go-Live → Local goes live
- [ ] **Zernio socials** — set `ZERNIO_API_KEY` + `ZERNIO_WEBHOOK_SECRET`; connect each brand's socials in Publish Center; register the webhook
- [ ] **Meta native** (optional, best margin) — `FB_APP_ID`/`FB_APP_SECRET` or Page-token connect in Publish Center
- [ ] **Sending domain** authenticated — DKIM/SPF/DMARC via Sending Domains page (deliverability)

## Phase 3 — Storefront & funnel

- [ ] **Landing page** (marketing site) messaging final — /how-it-works, /industries, /growth, /pricing
- [ ] **Choose-plan → Stripe checkout** tested end-to-end with a real card (or test mode first)
- [ ] **Onboarding flow** walked as a brand-new user — no dead ends
- [ ] **Guide Wizard** content reviewed on each module (the floating "Guide" button)
- [ ] **GTM / analytics** (`NEXT_PUBLIC_GTM_ID`) firing on key pages

## Phase 4 — First customers (offense)

- [ ] **First Customer flow** run for a real prospect (leads → outreach → checkout)
- [ ] **Prospecting (LeadWar Room)** list exported / pushed to Vault
- [ ] **Outreach** sent (email + WhatsApp manual path or connected)
- [ ] **Referral / partner** programme configured (Partner Network) if using it
- [ ] **Support channel** (inbox) monitored

## Phase 5 — Scale & defend

- [ ] **Autopilot** autonomy level set (Settings) once you trust the outputs
- [ ] **Go-Live board** all money-path green + providers as needed
- [ ] **Backups / data export** verified (per-brand export works)
- [ ] **Rank/reputation monitoring** cadence set (Reputation, Organic)
- [ ] **Pricing/margin review** scheduled (monthly)

---

### The one-sentence launch test
> Can a brand-new user **sign up → add their brand → import contacts → generate a
> creative or landing page → and pay you** — with no dead ends and no fabricated
> data? When yes, you're launch-ready. Everything else is optimisation.
