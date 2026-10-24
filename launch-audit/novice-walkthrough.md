# Mind 2 — the novice, on a mid-range Android, over a slow connection

The brief's second mind: someone who has never seen this product, on a phone,
with no patience and no technical vocabulary. A feature that works for the
engineer and defeats this person is a FAIL, not a UX note.

**How this was measured, not imagined.** Chromium at 360×800 with `isMobile`,
touch, a mid-range Android user agent and CPU throttled 4× — every one of the 95
routes, on a real production build. The numbers below come from
`launch-audit/evidence/route-crawl.json`, not from a reading of the CSS.

## What the phone actually got

| Measure | Result |
|---|---|
| Pages that loaded | 95 of 95 |
| Pages that threw an uncaught exception | 0 |
| Pages with a React hydration mismatch | 0 |
| Pages that rendered blank (under 40 visible characters) | 0 |
| Pages that scrolled sideways at 360px | 0 |
| Pages with no `<h1>` | 1 → **0** (fixed: `/dashboard/acquisition`'s empty state) |
| Requests to our own origin that failed | 0 |
| Requests our own API refused (correctly) | 3 — two from `/diagnose`, which POSTs empty bodies on purpose, and one 403 from the admin API to a signed-out visitor |
| Outbound requests blocked by this container | 77, every one of them `connect.facebook.net/en_US/fbevents.js` |

Horizontal overflow at zero across 95 pages is the single most reassuring
number here: the usual mobile failure is a table or a wide card pushing the
whole page sideways, and nothing does.

## Where the novice still gets stuck, in order of how early they hit it

### 1. "Pick a brand" means nothing on the first visit
Several dashboard pages answer a signed-out or brand-less visitor with "Pick a
brand to run X for." The novice has not been told what a brand IS in this
product, or that creating one is the first step. The acquisition page's empty
state now at least keeps its heading, so the page says what it is — but the
instruction still assumes a vocabulary the person does not have yet.

**Not fixed in this pass.** It is a copy and onboarding change across several
pages, and the brief's rule is to finish one thing properly rather than start
ten. Recorded as the first item in `human-actions.md`.

### 2. Nothing visibly happens without keys, and the reason is honest but quiet
With no credentials, the AI actions, the sending and the payments are dark. The
platform says so — this is the "nothing is faked" rule working — but a novice
reads "Managed · activates when enabled" as "broken". The sentence is accurate
and the feeling is still failure.

### 3. The data-rights card now explains itself, which it did not before
Before: two buttons that did nothing. Now, in the novice's own order —
press "Request erasure" → see exactly what would be destroyed, counted →
type ERASE → get a receipt naming what went, what was kept and why. A person
who cannot read a privacy policy can read "2 records deleted, 8 stores kept
because the law requires it".

### 4. Account deletion tells the novice what it is doing
It used to delete the sign-in and silently leave the data. It now says
"Erasing <brand> (1 of 3)…" and refuses to delete the account if any brand's
erasure failed, with the reason. A novice who closes the tab halfway does not
end up with an account they can no longer reach and data they can no longer
ask about.

## What a phone could NOT be tested on here

Everything that needs a credential: signing up, signing in, paying, receiving
mail, running an AI action. The crawl saw what a signed-out visitor sees. The
first keyed run must repeat this walkthrough signed IN, because the authenticated
dashboard is where the novice spends their time and none of it is proven yet.
