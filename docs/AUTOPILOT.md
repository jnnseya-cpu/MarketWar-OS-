# Revenue Autopilot — find customers while you sleep

One of MarketWar's objectives: **the operator sleeps while the agents find
customers who spend real money.** Autopilot is the unattended acquisition loop
that delivers it — governed by the autonomy dial, feeding the money loop.

## What it does per cycle

For a brand, one cycle (`POST /api/autopilot`) scans the highest-£ acquisition
moves — prospect owned leads, reactivate dormant customers, launch a campaign,
spin up a referral loop, reallocate budget — and, **within the autonomy limits**:

- **Auto-executes** owned / low-risk moves (no approval needed at L3+).
- **Queues** everything else for the operator to approve.

Governed by `autonomyGate` (L0–L4). High-risk categories — **children, health,
regulated, financial, alcohol, gambling, political** — are capped to approval and
**never auto-publish**, no matter the requested level.

**Honesty rule:** Autopilot **never books fabricated revenue.** It reports a
*projection* (labelled) and creates the conditions for sales. Real, attributed
revenue only enters **Revenue** via the money loop — a paid checkout link, an
owned-form capture, or a manual log.

## Run it while you sleep (scheduling)

Autopilot is stateless per call; a scheduler fires it nightly per active brand.

### Firebase (this stack) — Scheduled Cloud Function
```js
// functions/index.js — 06:00 daily: run every brand's cycle + email one digest
// per account ("here's what I did overnight and what needs your approval").
exports.autopilotNightly = onSchedule("0 6 * * *", async () => {
  const accounts = await db.collection("accounts").where("autopilot", "==", true).get();
  for (const acc of accounts.docs) {
    const a = acc.data();                       // { email, brands: [...], autonomyLevel, autopilotBudgetGbp }
    await fetch("https://marketwaros.com/api/autopilot/nightly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brands: a.brands,
        to: a.email,
        recipientName: a.ownerName,
        requestedLevel: a.autonomyLevel ?? 3,
        budgetGbp: a.autopilotBudgetGbp ?? 0,
      }),
    });
  }
});
```
`POST /api/autopilot/nightly` runs a cycle per brand and sends **one combined
morning digest** via the SMTP email engine. (Use `POST /api/autopilot` instead if
you only want the JSON run, no email.)

### Vercel — Cron Job
`vercel.json` → `{ "crons": [{ "path": "/api/autopilot/nightly", "schedule": "0 2 * * *" }] }`
(add a small `/api/autopilot/nightly` that loops active brands and calls the cycle).

### Any host — plain cron
`curl -X POST https://marketwaros.com/api/autopilot -H 'Content-Type: application/json' -d '{"brand":{…},"requestedLevel":3,"budgetGbp":50}'`

## The morning digest

Each cycle returns a `digest` — *"While you were away, Autopilot scanned N moves,
auto-executed X, queued Y — projected £Z of pipeline."* Surface it on the
Autopilot dashboard and (with SMTP configured) email it as the daily briefing.

## What makes it real vs. requires keys

- **Works day one (no third party):** scanning, prioritisation, autonomy
  governance, the queue, owned-channel moves (SEO pages, marketplace, referral).
- **Needs a key to act live:** paid campaign launch (ad account), outreach
  delivery (email/SMS/WhatsApp), live prospect data (Serper/Apollo). Until then
  those moves are drafted and queued.
- **Revenue is captured** through the money loop (checkout links / owned forms /
  Stripe) — see `docs/REAL-TESTING.md` and the Revenue module.
