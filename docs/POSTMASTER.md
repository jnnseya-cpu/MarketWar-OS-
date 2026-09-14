# What Gmail thinks of the sending domain

The seed probe (`docs/INBOX-PLACEMENT.md`) measures where **one** message landed
in mailboxes we own. It works at any volume, and it measures how Gmail treats a
**stranger** — a seed mailbox has no history with us.

Postmaster Tools measures the opposite and larger thing: what Gmail concluded
about the **domain**, from everything it actually delivered to real people who
did real things with it. Reputation, complaint rate, and the authentication
percentages that are the only part entirely ours to fix.

Both are needed. Neither substitutes for the other.

## It reports nothing until there is volume

**This is the most important thing on the page.** Google publishes nothing for a
domain below roughly a few hundred authenticated messages a day. The API returns
no rows — not zeros.

`/api/postmaster` reports that as **an absence, with the reason**, never as "0%
complaints, LOW reputation". That reading would be the most alarming one
available, manufactured out of an empty response. This platform has sent one
message to a prospect, so the honest answer today is *"Google has no data for
this domain, and here is what would end that."*

Until then, placement is still answerable at any volume — that is what the seed
probe is for.

## Turning it on

Three things, once:

1. **Register the domain** at <https://postmaster.google.com/managedomains>. It
   asks for a TXT record, the same way domain verification works elsewhere.
   **There is no API for this step**, which is why a missing registration is
   reported as a missing registration rather than as bad data.
2. **Enable the Gmail Postmaster Tools API** on the Cloud project your Google
   credential belongs to.
3. **Grant the scope** `https://www.googleapis.com/auth/postmaster.readonly` to
   that credential. For a service account that is domain-wide delegation; for a
   connected Google account, reconnect it so the new scope is consented.

No new credential is needed — it reuses the one Search Console already uses.

```
GET /api/postmaster            # last 30 days
GET /api/postmaster?days=7
```

Platform admin only: it reports the **shared** sending domain, which every
brand's mail rides on.

## What it will tell you, and what it will not

| It says | Because |
|---|---|
| Complaint rate against Google's own 0.10% limit, and 0.30% as a blocker | These are Google's published thresholds, not an opinion |
| Domain and IP reputation | Follows complaints and engagement; recovers by sending **less**, to better addresses, consistently |
| DKIM, SPF and DMARC success percentages | **The only part entirely ours to fix.** A published DMARC record that never *aligns* is the commonest version of this |
| Nothing at all, with the reason | Below the reporting threshold |

It will not tell you where a message landed for one recipient, and it will not
tell you anything the day after you send your first campaign. Both of those are
the probe's job.

## Proved by breaking it

`tests/postmaster.test.mjs`. Five mutations, each failing a test:

| Mutation | What it would have done |
|---|---|
| An absent field becomes `0` | A DMARC figure Google never sent reported as a DMARC failure |
| No data reported as a real reading | An empty response rendered as a bad score |
| The last day wins, empty or not | A run of empty recent days reported as today's reputation |
| Unknown reputation defaults to `BAD` | An unparsed value reported as the worst one |
| 404 and 403 share a message | "Never registered" and "not verified under this account" have different fixes |
