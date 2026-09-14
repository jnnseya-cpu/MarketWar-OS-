# Everything left, and exactly how to do it

Every item here needs a person, because every one needs a credential, a decision
or a machine that can reach the live site. Nothing in the code can substitute for
them, and pretending otherwise is how a month goes missing.

They are in the order that unblocks the most.

---

## 0. First: a machine that can reach the site

Not the session that writes this code — its network policy refuses to connect to
marketwaros.com. **Your own laptop.** Once, then it is there for good:

```bash
# Node 22.12 or newer. Below that, firebase-admin dies at module load.
node -v

git clone https://github.com/jnnseya-cpu/MarketWar-OS-.git
cd MarketWar-OS-
npm install
```

If `node -v` is below 22.12, install the current Node 22 first — nothing below it
will run this, for the reason in STATE.md §5.0.

---

## 1. Answer the four open questions — one run, five minutes

This is the one that tells you whether **AI writing, email scraping, video
rendering and Stripe** actually work on the live deployment.

**macOS or Linux:**

```bash
BASE_URL=https://marketwaros.com \
MW_DRIVE_EMAIL=you@marketwaros.com \
npm run drive:live
```

It asks for the password, with the typing hidden. **Do not put the password on
the command line** — it would be written into your shell history and visible to
anything reading the process list.

**Windows PowerShell** — the `VAR=value command` form is Unix-only and silently
does nothing here:

```powershell
$env:BASE_URL="https://marketwaros.com"
$env:MW_DRIVE_EMAIL="you@marketwaros.com"
npm run drive:live
```

**Windows Command Prompt:**

```cmd
set BASE_URL=https://marketwaros.com
set MW_DRIVE_EMAIL=you@marketwaros.com
npm run drive:live
```

### The account it signs in as

Any real account on that Firebase project. It must already exist — this signs in,
it does not register.

For the admin-only step (the placement probe) that account must be in
`PLATFORM_ADMIN_EMAILS` **and** have a verified email address.

### Reading the result

Three states, and the third is what makes the other two worth anything:

- **PASS** — it did the thing. The evidence is a value only doing it produces.
- **FAIL** — it could have done the thing and did not. This is the only kind of
  line worth acting on.
- **SKIP** — it cannot run on that deployment, naming why. Never a pass, and
  never a defect either.

A run ending `0 broken` with several skips is a healthy deployment that is
missing keys. A run with even one FAIL is something to send back.

---

## 2. Make the live database rules the ones in this repository — one command

The rules are tested here (`docs/SECURITY-RULES-TESTING.md`), but testing a file
proves nothing about a project running a different one.

```bash
npx firebase login          # once
npm run deploy:rules
```

That pushes `firestore.rules` and `storage.rules`. Until it is run, the tested
rules and the live rules are two different things.

---

## 3. Turn on inbox placement — the Promotions question

The feature is built (`docs/INBOX-PLACEMENT.md`); it needs mailboxes to measure.

1. Create one free mailbox per receiver you care about. **Gmail first** — its
   Promotions tab is the question customers actually ask about. Then Outlook,
   then Yahoo.
2. For each, generate an **app password** (Gmail: Account → Security →
   2-Step Verification → App passwords). Never the account password.
3. Set `MW_SEED_MAILBOXES` on the deployment to a JSON array:

```json
[{"address":"seed1@gmail.com","host":"imap.gmail.com","port":993,
  "user":"seed1@gmail.com","pass":"abcd efgh ijkl mnop"}]
```

4. Then, from your laptop:

```bash
BASE_URL=https://marketwaros.com MW_DRIVE_EMAIL=you@marketwaros.com \
MW_DRIVE_PROBE=1 npm run drive:live
```

It sends a real message and tells you which folder — and which Gmail tab — each
receiver put it in. **If every seed reports Promotions, that is correct for a
campaign and not a fault.** Primary is reached by one-to-one mail from the vault,
not by dressing marketing up as a personal note.

---

## 4. The environment variables nothing in code can set

Each is one value, set once, on the deployment. After each, open
`/api/health/live` and check `envPresent` and `build.commit` — that is the only
proof the running build actually received it.

| Variable | What it turns on | Where it comes from |
|---|---|---|
| `PLATFORM_ADMIN_EMAILS` | Makes you `executive` and never metered. **Do this first** — without it every `/api/health/*` report is redacted, which is how a diagnostic becomes useless. | Your own address. |
| `CRON_SECRET` | Every scheduled job. All of them are dark, including bounce collection. | Generate one: `openssl rand -hex 32` |
| `MW_BOUNCE_IMAP_HOST` | The platform reads its own delivery failures instead of a person opening a mailbox. User and password default to the SMTP ones. | Your mail host's IMAP server. |
| `MW_SENDING_POOL` | One sending node per domain, so SPF authenticates the domain the mail claims to come from. Closes the alignment half of outstanding item 1. | Your own relay. See `infra/sending-node/`. |
| `SERPER_API_KEY` | **The cheap half of email finding.** Currently rejected 401/403. Without it every row buys its domain from Apollo at four times the cost. | serper.dev — replace the rejected key. |
| `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_REGISTERED_ADDRESS` | **A UK launch blocker** for a site selling to the public. | Your own company details. I will not invent these — a fabricated company number on a page that sells is worse than a blank one. |

---

## 5. The Stripe webhook

Stripe recorded 73 deliveries with **"other errors"** — its category for an
exchange that produced no HTTP status at all. DNS, TLS or a refused connection,
before any code runs. Nothing reasoning from inside the process can see it.

1. Open `/api/health/stripe` and read `selfDelivery`. It delivers to our own
   endpoints the way Stripe does — signed, identifying as Stripe, redirects
   unfollowed, because Stripe does not follow them.
2. Point the Stripe endpoint at whichever address answers 2xx. `www` and the
   apex are not interchangeable here; that is the likely cause.
3. Send one test delivery from the Stripe dashboard.

A live key with no verified receipt is a launch blocker, and the health report
says so.

---

## 6. What genuinely cannot be finished by anyone yet

Said plainly, because a list that quietly omits these is a list that lies.

- **Google Postmaster Tools ingestion** — domain reputation and spam rate across
  your real volume. It is the other half of inbox placement and it is **not
  built**. It also needs volume before it reports anything at all.
- **Quota and latency under real load.** One run is one run. These only exist in
  production, under customers.
- **The commercial loop end to end with a buyer.** `npm run drive:loop` proves
  every part it can and reports the rest as not exercisable rather than passing
  it. Closing it needs §5 above, then a real checkout.

---

## The shortest path

If you do three things, do these:

1. `PLATFORM_ADMIN_EMAILS` — everything else becomes readable.
2. `npm run drive:live` — four open questions answered in one run.
3. `npm run deploy:rules` — the tested rules become the live rules.
