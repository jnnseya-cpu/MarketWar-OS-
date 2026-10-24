# Evidence ledger

Every claim in this audit points at a command that was run in this container and
the output it produced. A claim with no row here is not a finding — it is an
opinion, and the brief's own words are that with no access the only honest
verdict is NO-GO (UNTESTED).

**Commit audited:** see `git rev-parse HEAD` at the bottom of each cycle report.
**Container:** Linux 6.18, Node 22.22.0, no DNS (UDP 53 blocked), Chromium at
`/opt/pw-browsers/chromium`, Playwright 1.56.1 at `/opt/node-tools`.

## The access matrix — measured, not assumed

| Thing the audit needs | Present? | How that was established |
|---|---|---|
| Firebase Admin credentials | **absent** | `adminConfigured` is false; every brand-scoped route answers 503 under a production build |
| Stripe keys (test or live) | **absent** | `/api/health/live` reports the key catalogue; Stripe entries unset |
| AI provider keys | **absent** | `/api/gateway` reports no configured provider |
| SMTP / sending pool | **absent** | `MW_SENDING_POOL`, `SMTP_HOST` unset |
| Outbound DNS | **blocked** | every crawled page logs a failed request to a non-local host; `getaddrinfo` fails |
| Vercel token / deploy access | **absent** | no token in the environment |
| A real browser | **present** | Chromium launched, 95 pages crawled at 360×800 |
| A real production build | **present** | `npm run build` succeeds; `next start` serves |

**What that matrix means for the verdict.** Payments, sending, AI generation,
persistence and deployment cannot be exercised here. Anything this audit says
about them is a reading of code, not a measurement, and is labelled as such.

## Commands run, and what each one proved

| Command | Result | What it establishes |
|---|---|---|
| `npm run typecheck` | pass | TypeScript strict, no errors |
| `npm run build` | pass | the production bundle compiles |
| `npm test` | see cycle report | unit suite; 12 failures are environmental (no DNS) and are named individually |
| `npm run check:layers` | pass | no backend module reachable from the browser bundle |
| `npm run check:casts` | pass | cast count at or below its recorded ceiling |
| `npm run check:orphans` | pass (3 orphans reported) | 0 broken imports; 3 unreachable modules named for a human to judge |
| `npm run check:exposure` | pass | of 193 API routes, 136 guarded; **none** of the 57 open routes writes, sends or spends |
| `npm run check:register` | pass | all 90 Firestore collections the backend writes are declared in the data register |
| `npm run check:controls` | pass | no button without a handler, no empty handler, no form posting nowhere, no `href="#"` |
| `npm run drive:crawl` | see `evidence/route-crawl.json` | 95 pages in a real browser on a real build at phone size |
| `npm run drive:privacy` | 27 proven / 0 broken | the data-subject export and erasure, driven through the real route handlers |
| `npm run drive:import` | 33 proven / 0 broken | a bought list from file to enrichment input |
| `npm run drive:pages` | 21 proven / 0 broken | 53 feature pages, their SEO bounds and their renderer |

## What the instruments themselves were caught doing wrong

Listed because an audit whose tools are wrong produces findings that are worse
than no findings — they send someone to fix working code.

| Instrument | What it got wrong | Fix |
|---|---|---|
| `check-dead-controls.mjs` | matched `<button` and ended the tag at the first `>`, so `onClick={() => {` truncated the tag and a working button was reported dead | brace-depth-aware tag scanning |
| `check-dead-controls.mjs` | read `<button>` **inside a comment** as code — including the comment describing the repair | comments blanked before matching, strings tracked so `https://` survives |
| `check-route-exposure.mjs` | reported `/api/gateway` as able to spend money because the module it imports contains a gateway call | resolves the imported symbol's own body |
| `drive-route-crawl.mjs` | reported 79 pages with "Failed to load resource" and could not say what had failed, because Chromium strips the URL from the console text | reads the network instead: failed requests and 4xx/5xx by URL, split into ours / auth-refused / outbound-blocked |
| `drive-privacy.mjs` | three assertions reported PROVEN while the route was answering 503 | every assertion gated on the response being what it claims to describe |
| `tests/privacy.test.mjs` | the unique-recipient assertion survived a mutant that gave every row a random hash | three sends to two people, so the property is measurable |
| my PWA check | reported the manifest missing | the repo was right and the check was wrong: `public/manifest.webmanifest` exists and is declared |
