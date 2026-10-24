# MarketWar OS — launch audit, final report

**Audited:** 2026-10-24 · branch `claude/marketwar-os-platform-xrgg5r`
**Brief:** MASTER PROMPT v2 — FULL-STACK LAUNCH AUTHORITY, two minds, mandatory
gates, default verdict NO-GO.

---

## 1. Verdict

# NO-GO (UNTESTED)

Not because of what was found. Because of what could not be reached.

The brief states the rule itself: *"Do not run it in a chat with no access and
expect a real verdict, because with no access the only honest verdict is NO-GO
(UNTESTED)."* This container holds **no Firebase credentials, no Stripe keys, no
AI provider keys, no sending pool and no outbound DNS**, and has no deploy
access. Payments, mail, AI generation, persistence and deployment are therefore
**unexercised**. A GO would be a fabrication, and the brief forbids one in those
words.

What the container *could* reach was audited properly, and five defects were
fixed at the root — three of them blockers that no test and no build would ever
have caught.

**What changes this verdict:** the seven items in `human-actions.md`, in order.
With Firebase, Stripe test keys and the sending pool in place, the same gates
re-run signed in would produce a real verdict in one cycle.

---

## 2. What was audited, and with what

95 routes in a real Chromium on a real production build at 360×800 with CPU
throttled 4×. 193 API routes read for authorisation. 90 Firestore collections
enumerated from the source. 2,206 tests. Nine gates, five of which are new or
were repaired during this audit. Full command list and output in
`evidence-ledger.md`.

---

## 3. The headline finding

**The platform claimed a legal guarantee it had no implementation for.**

The Settings page carried two buttons — "Export my data" and "Request erasure" —
with no `onClick`, no `type="submit"` and no form, under this copy:

> *"Export or erase everything the OS holds about your business. Erasure
> propagates everywhere — including analytics — under the GDPR erasure API."*

There was no erasure API. There was no export. Nothing in 269 backend modules
could enumerate what the platform holds. A person exercising a statutory right
pressed a control that did nothing, received no feedback, and was told by the
page that the propagation had happened. UK GDPR Art. 12(3) gives the controller
one month to answer; the codebase could not have produced an answer at all.

It is now implemented, gated and driven. Details in §6.

---

## 4. Defects by severity

| Severity | Count | Fixed |
|---|---|---|
| BLOCKER | 3 | 3 |
| MAJOR | 1 | 1 |
| MINOR | 1 | 1 |

Every one is in `defects.md` with how it was found and what was changed. Four of
the five were found by **driving** something — a browser, a route handler, a
socket — and not by reading it.

### Score, and why most of the weight is unscored

The brief asks for 0–100 weighted. Its anti-gaming rule is the more important
instruction: an area that could not be measured gets **no number**, because a
score invented for an unmeasured area is the fabrication the brief forbids.

| Area | Weight | Score | Basis |
|---|---|---|---|
| Correctness of what runs | 15 | **14** | 95/95 pages render, 0 exceptions, 0 hydration errors; 2,187 of 2,206 tests pass with the 12 named |
| Security & tenant isolation | 15 | **13** | 0 of 57 open routes writes/sends/spends; fails closed with no credentials; 57 compute routes ceilinged rather than throttled |
| Data protection | 10 | **8** | register complete and gated, export and erasure driven; `email_sends` gap and no account-level erasure endpoint |
| Honesty of claims | 10 | **9** | four false claims made true; six unverifiable ones labelled |
| Mobile & novice experience | 10 | **8** | 0 overflow, 0 blank, headings everywhere; first-run vocabulary still assumes "brand" |
| Accessibility | 5 | **2** | headings fixed; no WCAG pass run, so most of this weight is unearned rather than failed |
| Payments | 10 | **not scored** | no Stripe keys, not even test |
| Sending | 10 | **not scored** | no sending pool, no DNS |
| AI actions & billing | 10 | **not scored** | no provider keys |
| Deployment & edge | 5 | **not scored** | no deploy access, no DNS |
| **Measurable subtotal** | **65** | **54 / 65** | |
| **Unmeasurable** | **35** | **—** | this is the verdict |

Eighty-three per cent of what could be measured, and **thirty-five points of the
launch question untouched.** That ratio is the verdict in one line: the parts
nobody could check are not the small parts.

---

## 5. Architecture, discovered rather than assumed

Next.js 15.5.28 / React 19.2.8 / TypeScript 5.7.2 strict / Node 22. **Seven
production dependencies.** Stripe over REST with **no SDK**. Firestore +
Firebase Auth + Firebase Storage. Vercel with ten crons. npm, one lock file.
269 backend modules, 193 API routes, 97 pages, 89 components, 110 shared.
Three layers, enforced by `check:layers` — no backend module can reach the
browser bundle.

No second database, no second auth system, no competing hosting config in use
(`apphosting.yaml` is a documented duplicate the owner has already ruled on).

---

## 6. Data protection — the vertical built in this audit

- **`src/backend/privacy.ts`** — the register: all 91 stores, what each holds in
  plain English, how it is reachable from a brand, and what erasure may do.
  **53 brand-scoped, 38 unreachable (each with its reason), 56 erased,
  1 pseudonymised, 34 retained on a stated legal basis.**
- **`scripts/check-data-register.mjs`** (in `verify`) — fails if the backend
  writes a collection the register does not declare, if the register names one
  nothing writes, or if a collection name is built from a runtime value it
  cannot resolve. **90 found, 91 declared. Both mutants killed.**
- **`/api/privacy`** — the public register, the ownership-gated export served as
  a download, a preview that counts without changing anything, and a confirmed
  erasure that returns a receipt.
- **`DataRights.tsx`** — preview, typed confirmation, receipt.
- **Three things the law keeps**, recorded against the store and not decided in
  the moment: suppression lists (deleting an unsubscribe destroys the evidence of
  the objection and permits contact again — Art. 21), six-year financial records
  (Art. 17(3)(b)), and the audit trail. Plus `likeness_consents`, where **the
  person depicted is not the person asking.**

**Verified:** 16 tests naming each legal invariant explicitly, and
`drive:privacy` at **27 proven / 0 broken** through the real handlers.

---

## 7. Security

| Check | Result |
|---|---|
| Open routes that write, send or spend | **0** of 57 (`check:exposure`) |
| Routes guarded by credential, throttle, scheduler secret or signature | 136 of 193 |
| Tenant isolation with no credentials in production | **fails closed** — export and erasure both answer 503 rather than serving |
| Security headers | HSTS (2y, preload), nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, CSP |
| Secrets in the repo, bundle, logs or URLs | none; tracking tokens are AES-256-GCM sealed, not base64 |
| Dependency advisories | clean but for two recorded unfixable moderates |
| Unverified type assertions | 153, unchanged — the gate refused three new ones in this work and all three were replaced by checking functions |

Residual risk, stated: **unmetered compute** on 57 open deterministic routes,
held at a ceiling that only comes down. Not data, not money, not mail.

---

## 8. The novice on a phone (Mind 2)

95 of 95 pages loaded. **0 uncaught exceptions, 0 hydration errors, 0 blank
pages, 0 horizontal overflow at 360px, 0 pages without an `<h1>`** (one was
fixed during the audit — the empty state every new customer sees first).

Where the novice still gets stuck: "Pick a brand" assumes a word they have not
met. Recorded in `novice-walkthrough.md` and as item 8 for the owner, because it
is product voice and not mine to decide.

---

## 9. What is honest and what was false

`truth-audit.md` checks every customer-facing claim against the code. Four were
false and are now true; seven were checked and hold; six **cannot be verified
here** and are listed as such rather than presented as working.

---

## 10. The instruments were wrong five times

An audit whose tools over-report sends somebody to fix working code, and in this
repository the recorded consequence is that the tool gets deleted and a real
guard goes with it. So: a detector that read `<button>` inside a comment; a
crawler that could not name what had failed; the same crawler then calling a
diagnostic page's deliberate 400s defects; a driver that reported three
assertions PROVEN while the route answered 503; an uncatalogued env var. All
five fixed, each with a mutant proving the fix. One test of mine also had a
mutant survive, and it was rewritten rather than explained.

---

## 11. Test suite

2,206 tests: **2,187 pass, 12 fail**. All 12 need outbound DNS this container
does not have, and each is named in `docs/STATE.md`. 7 skip loudly for want of
an emulator or a key — never quietly. 16 tests were added by this audit.

---

## 12. Performance

Not measured. No Lighthouse run, no field data, no deployed origin to measure.
The crawl throttled CPU 4× and every page still rendered inside its 45-second
budget with no blank frames, which is a floor and not a performance report.

---

## 13. Accessibility

Headings now present on all 95 pages. Focus states, reduced-motion handling and
safe-area insets are in the component layer. **A full WCAG pass was not run** —
no axe audit, no screen-reader walkthrough. Stated rather than implied.

---

## 14. Money paths

Implemented and idempotent by construction: checkout, webhook receipt, wallet
credit, ACU debit at 4× provider cost through `debitAcus`, once per provider
call that actually happens. **None verified** — no Stripe keys, not even test
ones, and the brief forbids moving real money. Item 6 for the owner.

---

## 15. Sending

MarketWar OS is the provider: `MW_SENDING_POOL` or our own SMTP, the customer's
domain authenticated through Sending Domains, the relay in
`infra/sending-node/`. **No third-party ESP is named anywhere in the codebase,
and none was added.** Unverified here: nothing can send without the pool
credentials.

---

## 16. Compliance posture

Data register complete and gated. Export and erasure implemented with receipts.
Suppression, financial and audit retention each on a stated basis. Consent mode
on the Meta Pixel verified (`fbq('consent','revoke')` until stored consent
grants). **This is not a claim of "fully compliant"** — the brief forbids that
phrase and it would be wrong: a DPIA, a retention schedule signed off by the
owner, and a processor register are documents, not code, and none exists yet.

---

## 17. What was deliberately not done

No deployment. No DNS change. No key rotation. No production data touched. No
pull request. No capability removed — the two dead GDPR buttons were made to
**work** rather than deleted, which is the additive-only law applied to a defect:
the claim had already been made to customers, so the honest repair is to make it
true.

---

## 18. Gaps recorded rather than silently resolved

- `email_sends` holds a recipient address with no brand id, so a brand-scoped
  erasure cannot reach it. In the register, in every receipt, and in
  `REQUIREMENTS-COVERAGE.md` §Gaps.
- Account-scoped stores are erased with the account, not with a brand; there is
  no account-level erasure endpoint yet.
- `likeness_consents` — the brand's erasure right and the depicted person's
  evidence point opposite ways. Kept, with the reasoning written down and the
  decision flagged as the owner's to overrule.

---

## 19. The one number that still matters

**Customers acquired: 0. Messages sent to prospects: 1.**

Nothing in this audit changes that, and no amount of gate-green does. The
platform is in better shape than it was this morning; it has still not been
paid for.

---

## 20. Next cycle, in order

1. Owner sets Firebase Admin, Stripe test keys and the sending pool (items 2–5).
2. Re-run every gate **signed in**, which is where the novice actually lives.
3. Drive one payment, one send and one AI action end to end, including the
   idempotency replay and the ACU debit.
4. Exercise the Firestore write paths the erasure cannot prove here — batch
   delete, documentId range query, the pseudonymiser's document move.
5. Then, and only then, a verdict that is not UNTESTED.
