# MarketWar OS as an ESP — send from your own domain, no third party

**Goal (owner directive):** users don't depend on our shared Brevo/Resend/
SendGrid account. Each user authenticates **their own domain**, campaigns send
**as them** (From + Reply-To on their address, so replies land in their own
inbox), the mail is **DKIM-signed** so inboxes trust it, and users manage their
own DNS/DMARC. MarketWar OS becomes the sending platform itself.

## What is built (software — shipped)

The **ESP control plane** is real and working today:

| Piece | Where | What it does |
|---|---|---|
| Per-domain DKIM keys | `src/backend/sending-domains.ts` | Generates a unique RSA-2048 keypair per domain; private key server-only. |
| DNS record generator | same | Produces the exact DKIM / SPF / DMARC (+ bounce & tracking CNAME) records the user must publish. |
| Live DNS verification | same (`verifyDomain`) | Real `resolveTxt`/`resolveCname` lookups; a domain only flips to **verified** when the required records actually resolve. |
| DKIM signing | `src/backend/dkim.ts` | RFC 6376 relaxed/relaxed, rsa-sha256. Signs every message as the sending domain. Self-verified (`signRoundTrips`). |
| Authenticated send | `src/backend/email.ts` | From/Reply-To on the user's address, `Date`/`Message-ID` headers, DKIM-Signature prepended when the domain is authenticated. |
| Console | `/dashboard/sending-domains` | Add domain → copy DNS records → Verify → green. Exactly the Brevo domain-setup flow, but ours. |
| API | `/api/sending-domains` | add / verify / list / delete, ownership-enforced, private keys never returned. |

**User flow:** Sending Domains → add `yourbusiness.com` → publish the shown DNS
records at your registrar → **Verify DNS** → once required records resolve, the
domain is **Authenticated**. Then in Email Center set the campaign From to an
address on that domain; every send is signed as you.

## What must be provisioned (infrastructure — the one non-software piece)

Authentication earns **trust**, but something with a **reputable IP** must still
hand the mail to Gmail/Outlook on port 25. This is the one part that is *not*
serverless and must be stood up to be a full, independent ESP:

1. **A mail-sending node (MTA)** — e.g. our own Postfix or Haraka relay on a VPS/
   bare-metal, or a dedicated outbound SMTP relay. `SMTP_HOST`/`SMTP_USER`/
   `SMTP_PASS` point the app at it. This is what physically delivers.
2. **A dedicated IP with reverse DNS (PTR)** on that node, **warmed** over ~2–4
   weeks (ramp volume gradually) so inbox providers build trust.
3. **Feedback loops + Postmaster** — register with Google Postmaster Tools and
   Yahoo/Microsoft FBLs so complaints/bounces flow back into the suppression
   ledger (the hooks already exist in `email.ts`).
4. **DNS for the infra hostnames** in `.env` (`MW_SENDING_HOST`, `MW_SPF_INCLUDE`,
   `MW_BOUNCE_HOST`, `MW_TRACK_HOST`): the `_spf.marketwaros.com` include must
   list the sending node's IP; the bounce/track hosts resolve to it.

Until a dedicated warmed IP is in place, sending can still run through **any SMTP
relay** set in `SMTP_HOST` (including a self-hosted one) — the DKIM signing and
per-domain From/Reply-To all work regardless of which node relays. Owning the IP
is what removes the *last* external dependency and unlocks high volume.

## Honest status

- ✅ Per-user domain authentication, DKIM signing, DNS verification, send-as-you.
- ✅ Provider-agnostic: point `SMTP_HOST` at our own relay = zero third party.
- 🧱 Dedicated warmed IP + reverse DNS + FBL registration = infrastructure to
  provision (ops, not code). Documented above; the software is ready to use it.

## Next software increments (backlog)

- Reusable **templates** (Brevo-style) with variables + per-brand storage.
- **Open/click tracking** via the tracking CNAME (pixel + link rewrite).
- **Bounce/complaint webhook intake** → suppression ledger auto-population.
- Per-domain **warm-up scheduler** (ramp caps) in the reputation governor.
