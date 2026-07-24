# MarketWar OS — dedicated sending node (own your delivery)

This is the **one non-serverless piece** of the ESP: a mail node with a
**dedicated IP + reverse DNS** that physically hands your customers' DKIM-signed
mail to Gmail/Outlook/Yahoo. Stand this up once and MarketWar OS delivers with
**zero third-party ESP** — no Brevo, no SendGrid, no Resend. The app already
DKIM-signs per customer domain and sends From/Reply-To as the customer; this node
just relays that mail out. It does **not** re-sign (the app owns signing).

Two deploy paths — pick one. Both end with the same three env vars in the app.

---

## What you need first

1. A small **VPS** (1 vCPU / 1 GB is plenty to start) from a provider that:
   - gives you a **dedicated IPv4**, and
   - lets you set **reverse DNS (PTR)** on it, and
   - does **not block outbound port 25** (ask support — many block it by default;
     good options that allow it on request: Hetzner, OVH, Scaleway, a dedicated
     AWS/GCP egress with port-25 unblock request).
2. A sending hostname you control, e.g. `smtp.marketwaros.com`.
3. Access to your DNS (for the node's A record, PTR, SPF, MX-of-bounce).

> **Port 25 is the gate.** If the provider won't unblock outbound 25, this node
> cannot deliver directly and you'd be back to relaying through someone else.
> Confirm this before anything else.

---

## Step 1 — DNS + reverse DNS (do this first; it propagates while you build)

For hostname `smtp.marketwaros.com` and node IP `203.0.113.10`:

| Record | Host | Value |
|---|---|---|
| **A** | `smtp.marketwaros.com` | `203.0.113.10` |
| **PTR** (reverse DNS) | set on the IP at your VPS provider | `smtp.marketwaros.com` |
| **SPF for the sending host** | `_spf.marketwaros.com` (TXT) | `v=spf1 ip4:203.0.113.10 -all` |
| **MX for bounces** (optional) | `bounces.marketwaros.com` | `10 smtp.marketwaros.com` |

`_spf.marketwaros.com` is the include your customers reference (see
`MW_SPF_INCLUDE` in the app `.env`). Forward + reverse DNS **must match**
(`A` → IP and `PTR` → hostname) or Gmail penalises you hard.

---

## Step 2a — Deploy with Docker (recommended)

```bash
cd infra/sending-node
cp .env.example .env         # set MYHOSTNAME, SMTP_USER, SMTP_PASS
docker compose up -d
```

`docker-compose.yml` runs Postfix as an **authenticated outbound relay**:
accepts SASL-authenticated submission on 587, delivers **direct to recipient MX**
(no upstream relay), TLS on. See the compose file for the knobs.

## Step 2b — Deploy on a bare Ubuntu 22.04 VPS (no Docker)

```bash
sudo apt update && sudo apt install -y postfix sasl2-bin
# choose "Internet Site" when prompted; system mail name = smtp.marketwaros.com
```

Append the settings from `postfix-main.cf` to `/etc/postfix/main.cf`, add the
`submission` service from `postfix-master.cf` to `/etc/postfix/master.cf`, then
create the app's SMTP account and start:

```bash
# SASL account the app authenticates with (matches SMTP_USER / SMTP_PASS)
sudo saslpasswd2 -c -u smtp.marketwaros.com appuser
sudo chown postfix:postfix /etc/sasldb2
sudo systemctl restart postfix saslauthd
```

TLS: get a cert for the hostname (`certbot certonly --standalone -d
smtp.marketwaros.com`) and point `smtpd_tls_cert_file` / `_key_file` at it.

---

## Step 3 — Wire the app

In the app's environment (Vercel), set:

```
SMTP_HOST=smtp.marketwaros.com
SMTP_PORT=587
SMTP_USER=appuser@smtp.marketwaros.com
SMTP_PASS=<the password you set with saslpasswd2>
SMTP_SECURE=false           # 587 = STARTTLS
EMAIL_FROM=MarketWar OS <os@marketwaros.com>
MW_SPF_INCLUDE=_spf.marketwaros.com
MW_SENDING_HOST=smtp.marketwaros.com
```

Redeploy. Confirm from the app: **`GET /api/health/smtp`** returns
`reachable: true` and the Email Center banner turns green. Send a test to
yourself — it now leaves through **your** node, DKIM-signed as the sending domain.

---

## Step 4 — Warm the IP (critical — do not skip)

A brand-new IP has no reputation; blasting day one gets you spam-foldered or
blocked. Ramp volume gradually — see `warmup-schedule.md`. Register the IP/domain
with **Google Postmaster Tools** and **Microsoft SNDS** to watch reputation, and
monitor blacklists (mxtoolbox.com/blacklists). The app's suppression ledger
already prevents re-sending to bounces/complaints.

---

## Files here

| File | What |
|---|---|
| `docker-compose.yml` | One-command Postfix outbound relay |
| `postfix-main.cf` | `main.cf` settings for the bare-metal path |
| `postfix-master.cf` | `submission` service definition |
| `.env.example` | Node config (hostname + app SMTP account) |
| `warmup-schedule.md` | The IP warm-up ramp + reputation checklist |

## Why this is the last dependency removed

Authentication (DKIM/SPF/DMARC, built in the app) earns *trust*; this node
provides the *reputable IP* that delivers. With both, MarketWar OS is a complete,
independent ESP. Everything upstream of the node — lists, consent, hygiene,
templates, per-domain signing, send-as-you — is already shipped in the app.
