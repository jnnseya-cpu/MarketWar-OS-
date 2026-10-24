# Defects found, and what was done about each

Severity is about the person using the platform, not about how hard the fix was.
**BLOCKER** means do not launch. **MAJOR** means launch is defensible only with
the limitation stated to the customer. **MINOR** means fix it when nearby.

Every row says how it was FOUND, because the method is the transferable part: all
five of the blockers below were invisible to `npm test` and to `next build`, and
four of the five were found by driving something rather than reading it.

---

## BLOCKER 1 — GDPR data-subject rights were a claim with no implementation

**Where:** `src/app/dashboard/settings/page.tsx` (the "Your data, your rights" card)

**What was wrong.** Two buttons, "Export my data" and "Request erasure", with no
`onClick`, no `type="submit"` and no form. Under them, this copy:

> "Export or erase everything the OS holds about your business. Erasure
> propagates everywhere — including analytics — under the GDPR erasure API."

There was no erasure API. There was no export. There was no code anywhere that
enumerated what the platform holds. A person exercising a right the law gives
them pressed a control that did nothing, received no feedback, and was told by
the page that the propagation had happened.

**Why it is the most serious finding in this audit.** An unfinished feature is a
gap. A false statement about a legal guarantee, on the surface where the person
exercises that right, is a misrepresentation — and under UK GDPR Art. 12(3) the
controller owes a response within one month, which nothing in the codebase could
have produced.

**How it was found.** `npm run check:controls` — a detector written for this
audit that asks, for every one of 88 components and 97 pages, whether a control
has anywhere to go. It was never going to be found by reading: the page looks
finished, and the copy is more confident than the code.

**Fixed:**
- `src/backend/privacy.ts` — a register of all 91 stores: what each holds, how it
  is keyed from a brand, and what erasure may do to it (delete / pseudonymise /
  retain on a stated legal basis). Export and erasure both walk it.
- `src/app/api/privacy/route.ts` — `GET` (the register, public and tenant-free),
  `GET ?brandId` (the Art. 15/20 export, ownership-gated, served as a download),
  `POST preview` (counts without changing anything), `POST erase` + `confirm:
  "ERASE"` (runs it, returns a receipt).
- `scripts/check-data-register.mjs` — a gate: the register must name every
  collection the backend writes, and may not name one nothing writes.
- `src/components/DataRights.tsx` — the card, with a preview before the
  confirmation and the receipt afterwards.
- `tests/privacy.test.mjs` (14 tests) + `npm run drive:privacy` (26 proven / 0 broken).

**Verified:** the driver stores two contacts through the contacts API, exports
them, previews an erasure and proves nothing moved, has an unconfirmed erasure
refused, runs the confirmed one, and proves the contacts are gone and the
unsubscribe record is not.

---

## BLOCKER 2 — the erasure's "anonymised" line was true of nothing

**Where:** `src/backend/privacy.ts` → `email_events`

**What was wrong.** The register said: keep the delivery events, strip the
recipient's address. The generic implementation deleted the named field. Two
things were wrong with that, and the receipt reported success for both:

1. **The address is in the document id.** `email_events` keys its rows
   `brandId::type::email::at`. Clearing the field leaves the address sitting in
   the primary key. That is a rename, not an anonymisation.
2. **It would have broken the numbers the store is kept for.** `eventStats`
   counts *recipients*, not pixel loads: `sentUnique` is the size of a set of
   addresses. Blank them all and every recipient collapses into one, so every
   open rate on the platform reads as impossible and is withheld — for every
   brand, because the ledger is shared.

**How it was found.** `drive:privacy` asserted that the address was gone from a
fresh export after erasure. It wasn't. The receipt said "anonymised".

**Fixed:** `pseudonymiseBrandEvents` in `src/backend/email-events.ts` replaces
the address with a stable hash of itself and MOVES the document to a new id.
Unique counts survive, the address does not, and running it twice rewrites
nothing. Wired as a module override in `privacy.ts` because the generic
field-delete is wrong for any store whose key carries the identifier.

---

## BLOCKER 2b — my own erasure reported success over data it never touched

**Where:** `src/backend/privacy.ts` (the first version written in this audit)

**What was wrong.** The erasure swept Firestore generically. With no database
configured — which is the zero-config demo mode this platform promises always
works — it removed **nothing**, reported `erased, 0 documents`, and the data was
still readable afterwards. Zero was a true count of what a Firestore sweep
deleted and a false account of what happened to the data.

**How it was found.** Not by reasoning. A probe: store one revenue event and one
inbound reply, erase the brand, read the receipt, then read the store again.
Receipt said erased. `listEvents` returned the event.

**Why it is a blocker and not a demo-mode quirk.** It is the defect this entire
file exists to prevent — a reported success that never happened — reintroduced
by me, in the module that answers a statutory request, within an hour of fixing
the same class elsewhere.

**Fixed, in both directions:**
- The four stores holding the platform's plainest personal data each own a
  brand-scoped eraser that works with or without a database: `clearContacts`,
  `clearEvents` (new), `clearInbound` (new — there was no way to delete a
  customer's replies at all), `clearPages` (new).
- Any other store, with no eraser and no database, is reported **skipped with
  the reason** — never erased.
- `hasModuleEraser` is exported so the invariant is testable from outside.

**Verified:** two tests. One asserts the general property — **no store the
export can still read may be reported as erased**. The other asserts the half
that test cannot see — with no database, a store without an in-memory eraser
must be reported skipped. **Both mutants killed**: reverting to the Firestore
sweep, and relabelling skipped stores as erased. The second one *survived the
first test*, which is why the second test exists.

---

## BLOCKER 3 — account deletion left every brand's data behind

**Where:** `src/components/DeleteAccount.tsx`

**What was wrong.** It deleted the Firebase Auth user, and said in a comment that
"server-side purge of Firestore/Storage data runs via the account.deletion
webhook/Cloud Function". **No such function exists** — `firebase.json` declares
rules and indexes only, and there are no Cloud Functions anywhere in the
repository. So the account vanished and all of its brands' data stayed, now
unreachable, because the only credential that could authorise its deletion had
just been destroyed.

**How it was found.** Reading the claim and then looking for the thing it named.

**Fixed:** the data goes **first**, through `/api/privacy`, brand by brand, while
the session still exists to authorise it. A brand whose erasure fails is named
and **the account is not deleted** — leaving orphaned data is the failure the
reordering exists to prevent. The copy now says what is kept and why.

---

## MAJOR 4 — a live-looking "Connect" button with nowhere to go

**Where:** `src/app/dashboard/integrations/page.tsx` + `src/backend/integrations.ts`

**What was wrong.** The Hub renders a blue "Connect" button when
`connectIsLive(provider)` is true. That button had no handler. It was unreachable
only because `LIVE_CONNECT` happened to be an empty `Set` — so adding one
provider name to it, which reads like turning a connector on, would have shipped
a dead Connect button to every tenant's Integration Hub.

**How it was found.** `check:controls` flagged the branch even though no data
reaches it today.

**Fixed:** liveness is no longer a claim about a provider, it is a path.
`CONNECT_START` maps a provider to the route that begins its flow,
`connectIsLive` is derived from it, `connectStart` is carried across the API
boundary, and the UI renders an anchor to that path. No path, no control — the
dead state is now unrepresentable.

---

## MINOR 5 — one page in 95 rendered with no heading

**Where:** `src/app/dashboard/acquisition/page.tsx`

**What was wrong.** Before a brand is selected the page returned a bare `<p>`.
No `<h1>`, no landmark for a screen reader, nothing for a crawler to title it
by — and that empty state is what **every new customer sees first**.

**How it was found.** `drive:crawl`, counting `<h1>` elements on all 95 routes in
a real browser. 94 pages had one.

**Fixed:** the empty state keeps the page header above the message.

---

## Not defects, recorded so they are not re-filed

| Observation | Why it is correct behaviour |
|---|---|
| Every brand-scoped route answers **503** under a production build here | `resolveBrandAccess` fails CLOSED when Firebase Admin is unconfigured. Without verified identities a pass-through would serve one customer's data to another. Asserted as a test, not worked around. |
| `/dashboard/admin` logs a 403 from its own API | The crawl is a signed-out visitor. An admin endpoint that answered would be the defect. |
| 79 pages log a failed request | Outbound DNS is blocked in this container. The crawler now separates **our** broken requests from blocked egress, and reports zero of the former. |
| 3 orphan modules in `src/` | Reported for a human to judge, not deleted. An unreachable module is a question, not a verdict. |
| Suppression lists survive erasure | Deleting an unsubscribe record removes the evidence of the objection and permits contact again. Tested as a required behaviour. |
