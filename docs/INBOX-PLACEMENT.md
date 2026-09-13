# Where our mail actually lands

Everything this platform knew about deliverability was about the **shape** of a
message: authentication, the stream it belongs to, the headers it carries, the
plain-text alternative it offers. Shape is most of the signal and it is not the
answer, and the review that shipped it said so in as many words — *"the platform
can say what shape a message has, and cannot yet tell you which tab it reached."*

This is the part that tells you. It sends a real message to mailboxes we own,
then goes and looks where each one put it.

## Turning it on

One environment variable, `MW_SEED_MAILBOXES`: a JSON array of mailboxes you
control, one per receiver you care about.

```json
[
  {"address":"seed@gmail.com","host":"imap.gmail.com","port":993,
   "user":"seed@gmail.com","pass":"<app password>"},
  {"address":"seed@outlook.com","host":"outlook.office365.com","port":993,
   "user":"seed@outlook.com","pass":"<app password>"}
]
```

Create a free mailbox per receiver and generate an **app password** for each —
never the account password. Gmail matters most, because its Promotions tab is
the question customers actually ask about.

With nothing set, `GET /api/placement` says so and every report refuses to quote
a figure. **A deployment that has measured nothing does not have a 0% inbox
rate; it has no rate.**

## Running one

`POST /api/placement` — platform admin only, at most two an hour.

Both limits are deliberate. A probe sends real mail from the shared sending
domain, and a sender that mails its own seeds all day looks to a receiver like a
sender nobody engages with. **Measure too often and the measuring changes the
thing measured.**

`npm run drive:modules` reads the status on every run, and sends a probe only
when you pass `MW_DRIVE_PROBE=1`.

## What it does

1. Mints a token and puts it in the subject, so the message can be found again
   among everything else in a seed mailbox.
2. Sends **through the ordinary bulk path** — the same builder, the same From,
   the same DKIM key, the same headers a campaign gets. A probe that took a
   shortcut would measure the shortcut.
3. Waits, then reads each seed over IMAP with `BODY.PEEK` and **no `STORE`** — a
   seed that gets marked read by the act of measuring it is a seed whose next
   measurement is different because we looked.
4. Turns the folder and Gmail's labels into a placement, and reports it.

## The two things it gets right that are easy to get wrong

**Gmail's tab is a label, not a folder.** A promoted message is still in
`\Inbox`; what distinguishes it is `CATEGORY_PROMOTIONS` in `X-GM-LABELS`. A
reader that looked only at the folder would call every Promotions message an
inbox hit — the flattering answer, and the exact lie this feature exists to
refuse.

**The spam folder beats any label it still carries.** Gmail keeps `CATEGORY_*`
on a message it has also junked. Reading the label first would report a
spam-foldered message as "promotions", which is the single most damaging
direction for this number to be wrong in.

## What a report will not do

- **Quote a rate when any seed did not report.** A seed that did not answer is
  `missing` — not an inbox, not a spam folder. A rate computed over the seeds
  that happened to answer flatters exactly the runs that went worst.
- **Treat Promotions as a fault.** A marketing campaign carries a one-click
  unsubscribe, which is required of bulk mail and is the clearest signal a
  classifier has. Promotions is the correct place for it, and the advice says so
  rather than telling you to fight it. Reaching Primary means sending one-to-one
  mail from the vault.
- **Blame the content when mail is being junked.** The first advice on any spam
  result is authentication and complaint rate. Nothing about the words matters
  while a receiver is rejecting the sender.

## What it is not

Seeds are a **sample of receivers, not a verdict about every recipient**.
Gmail's classifier is per-recipient and takes account of what that person has
done with your mail before. A seed mailbox has no history, so this measures how
a receiver treats mail from this domain **to a stranger** — the number that
matters for cold outreach, and the pessimistic end for an engaged list.

Google Postmaster Tools would add the other half: domain reputation, spam-rate
and authentication percentages across your real volume. That is not built.

## Proved by breaking it

`tests/placement.test.mjs` runs the reader against a real TLS IMAP server —
because the bugs live in the protocol, specifically in IMAP literals, where a
payload is announced as `{123}` and may contain text that looks exactly like a
tagged completion line. Six mutations were applied and each failed a test:

| Mutation | What it would have done |
|---|---|
| Read the label before the folder | A junked message reported as "promotions" |
| An unknown folder counts as the inbox | An archived or filtered message reported as delivered |
| Quote rates despite a missing seed | The worst runs flattered by the seeds that answered |
| Zero seeds reports 0% | A deployment that never measured reported as universally rejected |
| Mark the seed mailbox read | Every later measurement changed by the earlier one |
| Take the first match, not the newest | A stale copy's verdict reported as today's |

The fourth was a real defect in the first version of this code, caught by its
own test.
