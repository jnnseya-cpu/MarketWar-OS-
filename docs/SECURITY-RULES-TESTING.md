# Proving the security rules, and the indexes, before they reach production

Two things in this platform are deployed as files and were never executed by
anything: `firestore.rules` / `storage.rules`, and `firestore.indexes.json`.
Both fail in ways that are invisible locally and expensive live. This is how
each is now proved.

---

## 1. The rules — run by Google's own engine

`tests/security-rules.test.mjs` loads the ACTUAL rules files and runs them
through the Firestore emulator's rules engine, as three different callers: a
signed-out visitor, the owner, and a second signed-in tenant who is a perfectly
legitimate customer of the platform and simply not this one.

That last caller is the realistic attacker, and it is the one a server-side test
cannot cover. Every isolation test before this proved the API guard —
`resolveBrandAccess` refuses, the route answers 403. The rules are what stand
between a token and the database **when the API is not in the path at all**: a
browser talking to Firestore directly, a leaked web config, a client feature
somebody wires up next year.

### Run them

```bash
npm i -D @firebase/rules-unit-testing        # once
npx firebase emulators:start --project demo-marketwar --only firestore,auth,storage

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
NODE_ENV=test node --import tsx --test tests/security-rules.test.mjs
```

The emulator needs Java. `firebase.json` in this repo is not required — the test
supplies the rules itself, so the files under test are exactly the files that
get deployed.

**With no emulator running the tests SKIP, loudly, naming what is missing.**
They never quietly pass. A security suite that reports green because it never
ran is worse than no suite, and this repository has already been bitten by a
harness that could not tell a correct refusal from a breakage.

### What they cover

| Check | Why it is there |
|---|---|
| A signed-out visitor can read nothing | The baseline. Deny-by-default, demonstrated rather than asserted in a comment. |
| A second signed-in tenant cannot read the first's brand or contacts | The realistic attacker: a valid token, the wrong tenant. |
| Ownership cannot be re-written from a client | A client that could write `brands/{id}.ownerId` could hand itself any brand on the platform. |
| Server-only ledgers are unreachable | `settings`, `audits`, `agent_runs` hold spend and delivery history. |
| A collection nobody wrote a rule for is denied | Deny-by-default holds for the collection somebody adds next year. |
| A tenant's storage file is readable by that tenant and nobody else | **This is a regression test.** The read was broken by a write-size condition applied across `read, write`, where `request.resource` is null on a read. It was found by reading the file and fixed before anything executed it; now it is executed. |

### Proved by breaking them

Three mutations were applied to the rules and each failed a test:

- `brands` readable by any signed-in user → the second-tenant test fails.
- the `tenantId` scope dropped from the tenant match → the second-tenant test fails.
- the storage size check put back on the READ → the owner's own download fails.

---

## 2. The indexes — `npm run check:indexes`, part of `npm run verify`

**A missing composite index is invisible everywhere except production.** The
Firestore emulator does not require indexes at all: it answers any query you
give it. So a query that will 500 live passes every local run, every CI run and
every emulator-backed test. The first anybody hears of it is a customer.

`scripts/check-firestore-indexes.mjs` reads the queries out of `src/` and
decides, per query, whether Firestore needs a composite index for it — then
checks `firestore.indexes.json`. It knows the cases that do NOT need one, which
matters as much as the cases that do, or it cries wolf and gets ignored:

- equality filters alone, however many, need nothing;
- one field with an inequality needs nothing;
- `orderBy` on the same field as the inequality needs nothing;
- `orderBy(__name__)` beside equality filters needs nothing — the document id is
  already the tiebreaker on every automatic single-field index.

It fails the build on a filter plus an order on a different field, inequalities
across two fields, an order across two fields, or `array-contains` combined with
anything else.

**Its edge is stated rather than implied:** it reads chained
`.collection(...).where(...).orderBy(...)` expressions out of the source. A query
assembled across several statements is not seen. It narrows the hole; it does not
close it.

### Today's answer

```
check:indexes passed — 26 multi-clause queries read, 0 need a composite index, all declared.
  note: 1 declared index(es) no query uses — agent_runs::agentId,generatedAt
```

That note is a real finding: the only declared index is a fossil of a query that
no longer exists. `agent_runs` is written to (`src/backend/db.ts`) and never read
with that shape. It costs a little write latency and nothing else, so it is
reported and not removed — removing a deployed index is an owner's call, not a
side effect of a review.

---

## 3. What this still does not prove

- **The rules DEPLOYED to the live project.** These prove the files in this
  repository. If the deployed rules have drifted from the repository, only
  `firebase deploy --only firestore:rules` reconciles them. Deploy from this repo
  and the two are the same thing.
- **Real indexes, real quota, real latency.** The emulator has none of these.
- **Inbox placement.** A real SMTP server accepting the bytes is not Gmail
  filing them. Nothing in this repository can answer that; it needs seeded
  mailboxes on the real receivers and Google Postmaster Tools on a domain with
  volume.
