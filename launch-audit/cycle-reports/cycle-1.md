# Cycle 1 — the first pass with instruments that work

**Date:** 2026-10-24
**Branch:** `claude/marketwar-os-platform-xrgg5r`
**Scope:** every mandatory gate the container can run; three dead controls fixed
at the root; five instruments corrected.

## Cycle 0 — the access matrix

Measured before anything else, because the brief's own words are that with no
access the only honest verdict is NO-GO (UNTESTED). Every credential **absent**,
DNS **blocked**, no deploy access. A real browser and a real production build
**present**. Full matrix in `../evidence-ledger.md`.

That matrix sets the ceiling on this cycle: payments, sending, AI generation,
persistence and deployment **cannot be verified here**, and nothing in this
report claims they were.

## What was fixed, at the root rather than at the symptom

| # | Severity | What | Root fix |
|---|---|---|---|
| 1 | BLOCKER | GDPR export and erasure were a claim with no implementation — two buttons with no handler under copy promising a "GDPR erasure API" | A register of all 91 stores, a gate that keeps it complete, a working export, a preview, a confirmed erasure, a receipt |
| 2 | BLOCKER | The erasure's "anonymised" line was true of nothing: the address was in the document id, and blanking the field would have withheld every open rate on the platform | `pseudonymiseBrandEvents` — stable hash, document moved, counts preserved |
| 3 | BLOCKER | Account deletion removed the sign-in and left every brand's data behind, citing a Cloud Function that does not exist | Data erased first, brand by brand, while the session still authorises it; a failed brand blocks the deletion |
| 4 | MAJOR | A live-looking "Connect" button with no handler, unreachable only because a `Set` was empty | Liveness is a path now, carried across the boundary, rendered as an anchor |
| 5 | MINOR | One page in 95 rendered with no `<h1>` — the state every new customer sees first | The empty state keeps its header |

## Gate results

| Gate | Result |
|---|---|
| `typecheck` | pass |
| `build` | pass |
| `test` | 2,206 tests — 2,187 pass, **12 fail, all requiring DNS this container does not have** (the crawler and audit set, named individually in STATE.md) |
| `check:layers` | pass |
| `check:casts` | pass — **153, unchanged**, after it refused three unverified casts in this work and all three were replaced by functions that check |
| `check:orphans` | pass — 0 broken imports, 3 orphans reported for a human |
| `check:exposure` | pass — 193 routes, 136 guarded, **0 of the 57 open routes writes, sends or spends** |
| `check:register` | pass — 90 collections written, all 91 declared |
| `check:controls` | pass — no dead button, no hollow handler, no form posting nowhere |
| `drive:privacy` | **26 proven / 0 broken** |
| `drive:crawl` | 95 pages: 0 failed loads, 0 exceptions, 0 hydration errors, 0 blank, 0 overflow at 360px, **0 pages with no `<h1>`**, **0 broken requests to our own origin**. 77 blocked outbound requests, all of them one URL — the Meta Pixel — and 3 refusals our own API issued correctly |

## The instruments were wrong five times, and that is the cycle's real lesson

An audit whose tools over-report sends somebody to fix working code, and the
recorded consequence in this repository is that the tool gets deleted and a real
guard is lost with it. So each is written down:

1. `check-dead-controls.mjs` read `<button>` **inside a comment** as code —
   including the comment describing the repair. Comments blanked, strings
   tracked. Re-killed by a planted mutant with all four patterns.
2. `drive-route-crawl.mjs` reported 79 pages with "Failed to load resource" and
   **could not say what failed** — Chromium strips the URL. It reads the network
   now.
3. That same fix then called two things defects that were not: `/diagnose`
   deliberately POSTs empty bodies and **documents 400 and 403 as correct**, and
   `ERR_ABORTED` on an `?_rsc=` prefetch was **this crawler closing the page**.
   Four buckets now: broken / refused / cancelled / outbound-blocked.
4. `drive-privacy.mjs` reported three assertions **PROVEN while the route was
   answering 503**. Every assertion is now gated on the response being what it
   claims to describe.
5. The crawler read an uncatalogued `GIT_SHA` env var; it reads
   `git rev-parse HEAD` now, which is better evidence anyway.

One mutant also survived a test of mine: a per-row random hash destroys unique
recipient counts, but with one send each two random hashes still look like two
recipients. Three sends to two people kills it.

## What this cycle did NOT establish

- Nothing behind a credential: payments, sending, AI actions, Firestore writes.
- The authenticated dashboard. The crawl is a signed-out visitor.
- The brand-ownership refusal, because there are no accounts to be a stranger
  with. What **is** proven: with no credentials in production, both the export
  and the erasure **refuse with 503 rather than serving**.

## Verdict for this cycle

**NO-GO (UNTESTED)** on the launch question, and that is the only honest answer
from this container: payments, sending and persistence are unexercised because
no credential for them exists here. See `../final-report.md` for the full
reasoning — the verdict is about what could be measured, not about what was
found, and what was found was fixed.
