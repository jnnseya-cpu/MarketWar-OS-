# IP warm-up schedule & reputation checklist

A new sending IP has **no reputation**. Send too much too soon and Gmail/Outlook
throttle, spam-folder, or block you — and a burned IP is hard to recover. Ramp
volume gradually so inbox providers learn you're a legitimate sender.

## The ramp (per day, per IP)

Start with your **most engaged** recipients (people who open/reply) — early
engagement builds reputation fastest.

| Day | Max sends | Notes |
|----:|----------:|-------|
| 1 | 50 | Send to yourself + known-good, engaged contacts only |
| 2 | 100 | Watch Postmaster; keep bounce < 2%, complaints < 0.1% |
| 3 | 250 | |
| 4 | 500 | |
| 5 | 1,000 | |
| 6–7 | 2,500 | Pause the ramp if reputation dips |
| 8–10 | 5,000 | |
| 11–14 | 10,000 | |
| 15–21 | 25,000 | |
| 22–30 | 50,000+ | Steady state depends on engagement |

Rules while warming:
- **Never** double the previous day if bounce/complaint rates are rising.
- Keep sending **consistent** (daily) — big gaps reset trust.
- Prioritise engaged openers; leave cold/old addresses until reputation is solid.
- The app's hygiene pipeline + suppression ledger already stop bad addresses;
  don't override them to hit a volume number.

## Reputation monitoring (set up on day 1)

- **Google Postmaster Tools** (postmaster.google.com) — add your sending domain;
  watch IP/domain reputation, spam rate, authentication pass rates.
- **Microsoft SNDS / JMRP** (sendersupport.olc.protection.outlook.com) — register
  the IP; enrol in the Junk Mail Reporting Program (complaint feedback).
- **Blacklists** — check mxtoolbox.com/blacklists weekly for the IP.
- **Bounce/complaint feedback** — route bounces to `bounces.<domain>` and feed
  hard bounces + complaints into the app's suppression ledger (never re-send).

## Authentication must pass (already handled by the app)

Every message the app sends is DKIM-signed as the customer's authenticated
domain, with SPF aligned to this node's IP and a DMARC policy published. Confirm
in Postmaster that SPF, DKIM and DMARC all show **pass** — that plus a warmed IP
is what lands you in the inbox.
