# Multi-Brand Readiness — Overnight Security Hardening

**Date:** 2026-07-21 (overnight)
**Question it answers:** *Is MarketWar OS safe for an outside, real, multi-brand
business to test?*
**Short answer:** the one **disqualifying** issue for multi-tenant use — cross-brand
data isolation — is now **fixed and verified in code**. The remaining items are
lower-severity hardening (documented below), not blockers. Final sign-off still
needs your live end-to-end walkthrough (only a human can confirm the live path).

---

## 1. What the audit found

The persistence layer (`results` money ledger, `settings`, video jobs, publish)
was partitioned by a **client-chosen `brandId`** with **no ownership check**. The
code said so itself: *"Until multi-tenant auth lands, runs are keyed by the
business name supplied in the input."* It was built **single-operator** — perfect
for you testing alone, unsafe the moment two unrelated businesses share it.

**Confirmed critical vulnerability (IDOR) — `/api/results`, the money ledger:**

| Request | Before the fix |
|---|---|
| `GET /api/results?brandId=SOMEONE_ELSE` | returned their entire revenue ledger |
| `POST /api/results` with any `brandId` | injected fake revenue into their ledger |
| `DELETE /api/results?brandId=…&id=…` | erased their revenue events |

No authentication, no ownership check — change one query parameter, read/forge/
delete another brand's money data. The same pattern affected `settings`,
`command-summary`, `warroom`, `forecast`, `video-render`, `zernio`, and the money
routes (`checkout`, `billing/topup`, `billing/subscribe`).

**Root cause:** the frontend attached **no** Firebase ID token to any API call, and
the routes derived the brand from the request instead of the authenticated user.
So the server literally could not tell *who* was calling.

---

## 2. What was built (the fix — three coordinated parts)

### A. Brand-ownership model — `src/backend/brand-access.ts`
`resolveBrandAccess(req, brandId)` turns a client `brandId` into an **authorised
scope**:
- **Claim-on-first-use:** the first authenticated user to touch a `brandId` claims
  it — a `brands/{brandId}` record is written with `{ ownerId: uid }`, atomically
  (Firestore transaction, so two racing requests can never both win).
- Thereafter **only the owner** may act on that brand; anyone else gets **403**.
- **Fails closed:** if the ownership check itself errors, access is **denied** —
  a brand's data is never leaked because the store hiccuped.
- **Demo-safe:** when Firebase Admin is **not** configured (zero-config demo / CI /
  your keyless local test), there is nothing to enforce and every `brandId` passes
  through — the platform's zero-config rule is preserved. Enforcement activates the
  moment Admin is configured (production).

### B. Server enforcement — every stateful & money route
`resolveBrandAccess` (brand-scoped) or `requireAuth` (money) now guards:

| Route | Guard |
|---|---|
| `/api/results` GET · POST · DELETE | brand ownership |
| `/api/settings` GET · POST (key = brandId) | brand ownership |
| `/api/command-summary` (brandId branch) | brand ownership |
| `/api/warroom` (brandId branch) | brand ownership |
| `/api/forecast` (brandId branch) | brand ownership |
| `/api/video-render` (start) | brand ownership |
| `/api/zernio` (connect · publish) | brand ownership |
| `/api/checkout` | brand ownership (link self-attributes revenue) |
| `/api/billing/topup` · `/api/billing/subscribe` | authenticated caller |

### C. Client token — `src/frontend/api-client.ts`
`authedFetch` attaches the signed-in user's Firebase ID token to every sensitive
call, wired into all 11 callers (results-context, settings, command-summary,
war-room, forecast, video-render, publish/zernio, checkout ×2, topup, subscribe).
Signed-out / demo falls through to a plain fetch, so nothing breaks without keys.

### D. Database backstop — `firestore.rules`
Added `brands/{brandId}` (owner-read, writes server-only) and locked `settings` to
server-only, alongside the existing deny-by-default. Even a **direct** client
request to Firestore cannot read another brand's ownership record or forge a claim.

---

## 3. Verified

```
npm run typecheck   ✓ clean
npm run check:layers ✓ backend/frontend/shared separation holds
npm run build       ✓ all routes compiled
npm run smoke       ✓ 347 passed, 0 failed
```

Plus a manual demo spot-check: `results` GET/POST, `checkout`, and `topup` all still
work in zero-config demo (guard passes through) — so **your** keyless testing is
unchanged, while production now isolates brands.

---

## 4. What is NOT done yet (honest — none are multi-tenant *data-leak* blockers)

1. **Denial-of-wallet on the ~70 stateless AI routes.** The agent/generation routes
   (e.g. `/api/agents/*`, content/image engines) take business context in the
   request and return computed output — **no stored cross-brand data to leak**, so
   they are not an isolation risk. But in production with live keys they *cost money
   per call* and currently require only per-IP rate limiting, not auth. **Recommended
   fast-follow:** require `requireAuth` on the AI routes too, so an anonymous script
   can't run up your provider bill. Scoped, mechanical, ~half a day.
2. **Org / agency sharing.** Access is currently **owner-only** (the uid that claimed
   the brand). The `firestore.rules` already anticipate `agency_admin` + `orgId`
   sharing; wiring org-membership claims so a team can share brands is a future
   enhancement, not a security hole.
3. **Brand-id slug collisions.** `brandId` is a client slug, so two companies could
   pick the same slug; first-to-claim wins and the second is denied (fails safe, but
   inconvenient). **Recommended:** mint server-side brand ids at brand creation to
   eliminate collisions entirely.
4. **Rate-limit store is per-instance (in-memory).** Correct on one instance; a
   shared store (Redis/Firestore) is needed for multi-instance rate-limit accuracy.
   Already tracked as a launch action in `guard.ts`.

---

## 5. Your morning checklist (≈20 min — earns the confidence)

1. **Health:** run the `/api/health/live` command — expect ~9–10/10 now that the
   base build is green, secrets are set, and SMTP is wired.
2. **Isolation smoke (the money test):** sign in as Brand A, log a result. Open a
   second browser signed in as Brand B and hit
   `GET /api/results?brandId=<Brand A's id>` — you should get **403 "This brand
   belongs to another account"**, not Brand A's ledger. That is the fix, proven.
3. **Your four-step walkthrough:** real sign-up → live agent output → real Stripe
   link → real email that lands. Do these yourself once.
4. Only after *you've* had a clean run does a real company get invited.

---

## 6. Confidence, re-scored

| Dimension | Before tonight | After tonight |
|---|---|---|
| Compiles & deploys | ~90% | ~90% (unchanged; build green) |
| Real product, not demo shell | ~85% | ~85% |
| **Cross-brand data isolation** | **~40% (IDOR open)** | **~90% (enforced + verified in code)** |
| One flow verified live by a human | 0% | 0% — **still needs your walkthrough** |

The disqualifying multi-tenant risk is closed in code. The last mile is your live
walkthrough — which is exactly the right thing to keep in human hands.
