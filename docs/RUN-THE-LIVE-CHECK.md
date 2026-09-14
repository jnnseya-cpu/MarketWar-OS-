# Answering the last four questions, in one command

Four things cannot be proved from a development machine, because they need real
providers: **AI writing, email scraping, video rendering and Stripe.** They are
answerable in a single run against the deployment that has the keys.

```bash
git clone <this repo> && cd MarketWar-OS- && npm install

BASE_URL=https://marketwaros.com \
MW_DRIVE_EMAIL=you@marketwaros.com \
MW_DRIVE_PASSWORD='<that account's password>' \
npm run drive:live
```

That is the whole thing. It signs in the way the login page does, so **no token
has to be minted by hand** — the previous version of this asked you to dig one
out of a browser's developer tools, which is the platform asking a person to do
its job for it.

## What it will tell you

Every module, in one of three states, and the third is what makes the other two
worth reading:

- **PASS** — it did the thing, and the evidence is a value only doing it
  produces. Not "the route answered 200".
- **FAIL** — it could have done the thing and did not.
- **SKIP** — it cannot run on that deployment, naming the reason. Never counted
  as a pass.

It asks `/api/health/live` what is actually configured and skips what is not, so
a missing key is never reported as a defect.

## The account it signs in as

Any account on that Firebase project will exercise sign-in, the vault, campaign
preview, bulk send, posters, landing pages and campaign design.

For the **admin-only** steps — the inbox-placement probe — the account must be
in `PLATFORM_ADMIN_EMAILS` **and** have a verified email address. Both are
deliberate: a placement probe sends real mail from the shared sending domain.

## Sending real things

Two steps send, so both are off unless you ask:

| Step | Turn on with | What it costs |
|---|---|---|
| Bulk campaign | always runs | Sends to the contacts of a throwaway brand it creates. Nothing of yours. |
| Inbox placement probe | `MW_DRIVE_PROBE=1` | Sends to your seed mailboxes. Needs `MW_SEED_MAILBOXES` set on the deployment. |

To read the campaign back byte for byte rather than trusting the count, point
`MW_DRIVE_MAILBOX` at a JSONL file an SMTP server appends to. Against a live
deployment you will not have that, so the step reports what the route said and
says plainly that the wire was not read.

## What it still will not prove

- **Quota and latency under real load.** One run is one run.
- **That the deployed Firestore rules match this repository.** They match only
  if they were deployed from it: `firebase deploy --only firestore:rules`.
  `tests/security-rules.test.mjs` proves the files; deploying is what makes the
  files and the project the same thing.
- **Inbox placement without seed mailboxes.** `MW_SEED_MAILBOXES` on the
  deployment; see `docs/INBOX-PLACEMENT.md`.
