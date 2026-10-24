# What only the owner can do

Prepared, then stopped — the brief's rule for anything irreversible or anything
needing a credential this container does not have. Nothing below was attempted.

## Must happen before anyone pays money for this

| # | Action | Why it is yours and not mine | What is already prepared |
|---|---|---|---|
| 1 | **Rotate the Meta Graph API token** pasted into chat earlier | It is a live credential that was exposed in a conversation. Meta Business Settings → Users → System Users → regenerate | Verified absent from every tracked file, the working tree and every commit on every branch. It was never written anywhere |
| 2 | **Set the Firebase Admin credentials** in Vercel | No deploy access from here, and the keys are yours | Every brand-scoped route already refuses with 503 until they are set — the platform fails closed, not open. `docs/DEPLOYMENT.md` lists the exact variables |
| 3 | **Set `SERPER_API_KEY` and `LEADMAGIC_API_KEY`** | Your accounts, your billing | The enrichment chain is driven and proven; it spends nothing without them and explains each step it cannot take |
| 4 | **Set the sending pool** (`MW_SENDING_POOL`, or `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` on our own domain) | Our own infrastructure, your credentials | `infra/sending-node/` is the relay; Sending Domains handles the customer's DKIM. No third-party ESP is named anywhere, and none will be |
| 5 | **Set `CRON_SECRET`** | It authorises the scheduled lanes | The 10 Vercel crons are declared; each refuses without it |
| 6 | **Run a test-mode Stripe checkout end to end** | Needs your Stripe test keys, and the brief forbids me moving real money | The checkout, the webhook receipt and the wallet credit are implemented and idempotent; none is verified |
| 7 | **Repeat the mobile walkthrough signed IN** | Needs an account | `npm run drive:crawl` does it signed out — 95 pages, 0 failures. The authenticated half is unproven |

## Should happen, but is not a launch blocker

| # | Action | Why |
|---|---|---|
| 8 | Decide the first-run vocabulary for "brand" | The novice walkthrough's first finding: "Pick a brand" assumes a word the person has not met. A copy and onboarding change across several pages — yours to decide, since it is product voice |
| 9 | Judge the 3 orphan modules | `check:orphans` names `src/components/BviCard.tsx`, `src/frontend/storage-manager.ts`, `src/frontend/locale.ts` as reachable from nothing. Deleting them is a capability removal, which under the additive-only law needs your instruction naming them |
| 10 | Add a `brandId` to the `email_sends` row | It holds a recipient address with no brand key, so a brand-scoped erasure cannot reach it. Recorded in the register as unreachable with that exact reason, and in `docs/REQUIREMENTS-COVERAGE.md` §Gaps. Changing the send path needs its own pass |
| 11 | Decide on `apphosting.yaml` | Carried over; the adopted stack is Vercel, so it may be dead weight |

## What I did NOT do, deliberately

- No deploy, no DNS change, no key rotation, no production data touched.
- No pull request opened.
- No third-party email provider named, suggested or configured — the sending law.
- No capability removed. The two dead GDPR buttons were made to WORK rather than
  deleted, which is the additive-only law applied to a defect: the claim was
  already made to customers, so the honest repair is to make it true.
