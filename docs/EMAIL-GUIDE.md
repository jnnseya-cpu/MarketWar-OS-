# Email — how to use it (templates, bulk send, limits, bounces)

Your platform now runs its own email system end-to-end. This is the plain-English
guide to using it.

## 1. Make a personalised, branded template (with a CTA link)

1. Sidebar → **Email Templates** → **New template**.
2. Click **✨ Branded starter + CTA** — it drops in a ready-made, mobile-friendly
   design with your brand header, a greeting, body text, and a **CTA button**.
3. Edit the text. Personalise with merge variables (click the chips): `{{ firstName }}`,
   `{{ company }}`, `{{ town }}`, `{{ brand }}` — each recipient gets their own value.
   Use a fallback like `{{ firstName | there }}` for contacts with no first name.
4. Change the **CTA button link**: find `https://your-link.com` in the HTML and
   replace it with your real page (offer, booking, product). Every link is
   **auto-tracked for clicks** when you send.
5. **Preview** tab shows exactly what a recipient sees (with sample data).
6. **Save**. The template now appears in the Email Center send form.

## 2. Send bulk email

1. Sidebar → **Email Center**.
2. In **Send a real campaign to your vault**:
   - **From name** + **From address** — use an address on your **authenticated
     domain** (e.g. `hello@veryxjnn.com`). This is what makes it DKIM-signed and
     inbox-worthy. (Authenticate the domain in **Sending Domains** first.)
   - Pick your **template** (or type a one-off subject + message).
   - **Target status** — leave blank to email consented customers, or type a
     prospect status (e.g. `contacted`) to email just that segment.
3. Click **Send test (1)** — sends one to the first contact (make it yourself)
   so you can confirm it looks right and lands.
4. Click **Send to vault** — sends the batch. Large lists send in repeated
   clicks/days (see limits below). The result shows how many went and how many
   remain.

Everyone bounced/complained/unsubscribed is skipped automatically, and every
send carries an open pixel, tracked links, and a one-click unsubscribe.

## 3. What's the maximum daily limit?

The platform **automatically enforces a ramping daily limit** to protect your
sending reputation (a new IP that blasts gets blocked). The limit **grows on its
own** as you keep sending:

| Warm-up day | Max emails/day |
|---:|---:|
| 1 | 50 |
| 2 | 100 |
| 3 | 250 |
| 4 | 500 |
| 5 | 1,000 |
| 6–7 | 2,500 |
| 8–10 | 5,000 |
| 11–14 | 10,000 |
| 15–21 | 25,000 |
| 22+ | 50,000+ |

- Day 1 starts on your **first real send**.
- The Email Center shows **"Warm-up day X · today's limit N · M left."**
- When you hit the daily limit, sending pauses until tomorrow — the rest of a big
  list simply continues the next day. This is normal and correct.
- These numbers are safe defaults; a single well-warmed IP comfortably does
  ~50k/day. To go higher, add more sending IPs (extra nodes) later.

## 4. Bounces & complaints (auto-suppression)

- **Hard failures during a send** (a server rejects the address, 5xx) are
  **suppressed instantly** — never tried again.
- **Async bounces / spam complaints** (which arrive after the send) come in via
  the webhook: `POST /api/webhooks/email` with the `EMAIL_WEBHOOK_SECRET`.
  Anything reported there (`bounce`, `complaint`, `unsubscribe`) is suppressed.
- **Unsubscribes** happen through the one-click link/header in every email and
  suppress immediately.

### Wiring the node's bounces to the webhook (optional, for hard-bounce capture)

On the sending node, pipe Postfix bounce notifications to the webhook so hard
bounces from recipient servers also auto-suppress. Add a bounce handler that
POSTs `{ "brandId": "...", "email": "<failed address>", "type": "bounce" }` with
header `x-webhook-secret: <EMAIL_WEBHOOK_SECRET>` to
`https://www.marketwaros.com/api/webhooks/email`. For reliable brand attribution,
use a VERP return-path (encode the brand + recipient in the envelope sender) —
this is the standard ESP approach and is on the roadmap in `docs/ESP-SENDING.md`.

## 5. Golden rules for staying in the inbox

- Always send from your **authenticated domain** (green in Sending Domains).
- **Warm up** — don't blast; the daily limit does this for you, so let it.
- Send to **engaged people** first; prune non-openers over time.
- Keep content clean and honest; always keep the unsubscribe (it's automatic).
- Watch **Google Postmaster Tools** for your domain's reputation.
