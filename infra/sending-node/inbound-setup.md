# Inbound mail — receive replies into the in-app Inbox

This turns on the *receiving* half: replies to your campaigns arrive at the node,
get pushed to the app, and appear in **Dashboard → Inbox (replies)** per brand.
The app side (webhook + inbox UI) is already built; this is the node + DNS wiring.

> Only do this for a domain (or subdomain) you want the platform to receive mail
> for. Pointing a domain's MX here routes ALL its mail to this node.

## 1. DNS — point the receiving domain's MX at the node

Cleanest is a **dedicated subdomain** so you don't disturb the customer's normal
email. For replies addressed to `reply@mail.veryxjnn.com` (or use the root domain
if they don't host email there):

| Type | Host | Value | Priority |
|---|---|---|---|
| MX | `mail.veryxjnn.com` (or `veryxjnn.com`) | `smtp.marketwaros.com` | 10 |

Send campaigns with **From / Reply-To** on that domain so replies come back to it.

## 2. Node — create a catch-all that pushes mail to the app

On the node (`infra/sending-node`), add a catch-all alias that pipes every
received message to a small forwarder script, which POSTs it to the app's inbound
webhook.

```bash
# 2a. install the forwarder deps
docker exec mailserver bash -lc 'apt-get update && apt-get install -y curl formail || true'

# 2b. drop the script on the node host
cat >/opt/mw-inbound.sh <<'EOF'
#!/usr/bin/env bash
# Reads a raw email on stdin, extracts headers + body, POSTs to the app webhook.
raw="$(cat)"
from="$(printf '%s' "$raw" | sed -n 's/^From: //p' | head -1)"
to="$(printf '%s' "$raw"   | sed -n 's/^To: //p'   | head -1)"
subj="$(printf '%s' "$raw" | sed -n 's/^Subject: //p' | head -1)"
body="$(printf '%s' "$raw" | awk 'f{print} /^$/{f=1}' | head -c 50000)"
curl -s -X POST "https://www.marketwaros.com/api/inbound/email" \
  -H "x-webhook-secret: $EMAIL_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg to "$to" --arg from "$from" --arg subject "$subj" --arg text "$body" \
            '{to:$to,from:$from,subject:$subject,text:$text}')" >/dev/null
EOF
chmod +x /opt/mw-inbound.sh
```

Then configure Postfix (inside the container, via docker-mailserver overrides) to
pipe inbound mail for the receiving domain through the script — see docker-
mailserver's "custom transport / pipe" docs. Set `EMAIL_WEBHOOK_SECRET` in the
script's environment to the SAME value as the app.

> Simpler managed alternative: if you ever prefer not to run inbound Postfix, a
> hosted **inbound-parse** service (SES receive → SNS → your webhook, or a
> Mailgun/Postmark inbound route) can POST the same JSON to `/api/inbound/email`.
> The app doesn't care who delivers it, as long as the secret matches.

## 3. Verify

Send a campaign from an address on the receiving domain, reply to it from another
mailbox, and within a few seconds it appears in **Dashboard → Inbox (replies)**.
Bounces and auto-replies are filtered out automatically (they feed suppression).

## What the app does with it

- `POST /api/inbound/email` (secret-gated) resolves the owning brand from the
  recipient domain, files human replies into that brand's inbox, and routes
  bounces/auto-replies to the suppression ledger.
- **Dashboard → Inbox (replies)** lists them per brand; you can read and **reply
  DKIM-signed as your domain** without leaving the OS.
