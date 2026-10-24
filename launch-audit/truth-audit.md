# Truth audit — does the platform say anything that is not so?

The brief's rule: never fake a GO, never claim "100% bug-free", "fully secure"
or "fully compliant". This file is the inverse exercise — every place the
PLATFORM makes a claim to a customer, checked against what the code does.

A claim is only a defect when a customer could act on it and be wrong. "Demo
data" labelled as demo data is not a lie. "Erasure propagates everywhere" with
no erasure API is.

## Claims that were FALSE and are now true

| Claim, where it appears | What was actually there | Now |
|---|---|---|
| "Erasure propagates everywhere — including analytics — under the GDPR erasure API" (Settings) | No erasure API, no export, two buttons with no handler | A register of 91 stores, a working export, a preview, a confirmed erasure and a receipt. The copy now names what is KEPT and why, because "everywhere" was never true of a lawful erasure |
| "server-side purge of Firestore/Storage data runs via the account.deletion webhook/Cloud Function" (DeleteAccount comment) | No Cloud Functions exist in the repository at all | Data is erased through `/api/privacy` first, while the session still authorises it; the auth user is deleted last |
| An erasure receipt reporting rows "anonymised" | The field delete left the address in the document id and would have collapsed every unique-recipient count | Pseudonymised to a stable hash, document moved to a new id, counts preserved |
| A blue "Connect" button in the Integration Hub | No handler; unreachable only because a `Set` happened to be empty | Rendered from the connect start path, so no path means no button |

## Claims checked and found TRUE

| Claim | How it was checked |
|---|---|
| "Zero-config demo mode works with no keys" | 95 pages crawled on a production build with no credentials: 0 failed loads, 0 uncaught exceptions, 0 blank pages |
| "MarketWar OS is the email service provider" | No third-party ESP named anywhere in `src/`; the sending path is `MW_SENDING_POOL` / our own SMTP, with `infra/sending-node/` as the relay |
| "Tenant isolation is enforced server-side" | `resolveBrandAccess` fails CLOSED when Admin is unconfigured in production — asserted by `drive:privacy`, which proves the export and the erasure both refuse with 503 rather than serving |
| "No open route writes, sends or spends" | `check:exposure` over all 193 routes: 136 guarded, and none of the remaining 57 takes an irreversible action |
| "Suppression survives everything" | `drive:privacy` erases a brand and proves the unsubscribe record is still there |
| "Every AI call goes through the gateway" | no direct provider call in feature code (`check:layers` plus the gateway's own registry) |
| "Charts use the validated palette" | the chart kit is the only renderer; palette imported from `src/shared/palette.ts` |
| The Meta Pixel does not track before consent | The crawl showed `connect.facebook.net/en_US/fbevents.js` requested on every page, which looked like a PECR problem. Reading `src/components/CookieConsent.tsx` settles it: the script initialises with `fbq('consent','revoke')` and grants only when stored consent reads `granted`, which is Meta's own consent-mode API. The script loads; no event is sent until the visitor agrees |

## Claims that are still UNVERIFIABLE here, and must not be presented as verified

These are the honest limits of an audit run in a container with no credentials.
Each needs a keyed environment before anybody may say it works.

| Claim | Why it cannot be checked here | What would check it |
|---|---|---|
| Payments take money correctly | No Stripe keys, live or test | A test-mode checkout, a webhook delivery, a wallet credit, and the idempotency replay |
| Mail actually leaves | No sending pool, no SMTP, no DNS | One real send to a seed mailbox, then the bounce and complaint paths |
| AI actions produce results and bill once | No provider keys | One action end to end, with the ACU debit counted against the provider call |
| Firestore writes behave as the code expects | No Admin credentials | The batch delete, the documentId range query and the pseudonymiser's document move |
| The brand-ownership refusal rejects a stranger | No accounts exist to be a stranger with | Two accounts, one brand, one 403 |
| Anything about production DNS, TLS or the edge | No DNS, no deploy access | The go-live runbook in `docs/DEPLOYMENT.md` |

## The standing honesty rule this audit did not relax

No number in this audit is an estimate presented as a measurement. Where a
thing was not measured, the row says so. Three assertions in the privacy driver
originally reported PROVEN while the route was answering 503 — a check that
passes because the request failed — and they were rewritten rather than
explained away.
