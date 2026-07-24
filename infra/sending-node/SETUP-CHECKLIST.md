# MarketWar OS — email go-live checklist (filled in)

Values for THIS deployment:
- VPS IP: `187.124.117.159` (Hostinger KVM, Ubuntu 24.04, Manchester UK)
- Sending host: `smtp.marketwaros.com`
- Domain: `marketwaros.com` (DNS at Cloudflare)

Do these in order. Don't skip Step 2.

---

## PHASE A — VPS

**Step 1. SSH into the VPS**
```bash
ssh root@187.124.117.159
```

**Step 2. Test outbound port 25 (THE GATE)**
```bash
apt update && apt install -y netcat-openbsd
nc -zv gmail-smtp-in.l.google.com 25
```
- `open / succeeded` → continue to Step 3.
- `timed out` → STOP. Open a Hostinger support ticket: "Please unblock outbound
  port 25 on my VPS for authenticated email sending." Wait for it, then re-test.

**Step 3. Install Docker + tools**
```bash
apt install -y docker.io docker-compose-v2 git certbot
systemctl enable --now docker
```

---

## PHASE B — DNS (do while the node builds; propagation takes minutes–hours)

**Step 4. Cloudflare → marketwaros.com → DNS → add an A record**
- Type `A`, Name `smtp`, IPv4 `187.124.117.159`, Proxy **DNS only (grey cloud)**.

**Step 5. Cloudflare → add the SPF record for the sending host**
- Type `TXT`, Name `_spf`, Content `v=spf1 ip4:187.124.117.159 -all`.

**Step 6. Hostinger hPanel → VPS → rDNS / PTR**
- Change the PTR for `187.124.117.159` from `srv1854161.hstgr.cloud` to
  `smtp.marketwaros.com`. (Forward + reverse must match.)

---

## PHASE C — Deploy the sending node (on the VPS)

**Step 7. Get the node config**
```bash
git clone https://github.com/jnnseya-cpu/marketwar-os-.git
cd marketwar-os-/infra/sending-node
```

**Step 8. Get the TLS certificate** (needs Step 4 live + port 80 free)
```bash
certbot certonly --standalone -d smtp.marketwaros.com --agree-tos -m jnbankwa@gmail.com -n
mkdir -p dms/letsencrypt && cp -rL /etc/letsencrypt/* dms/letsencrypt/
```

**Step 9. Start the mail node**
```bash
docker compose up -d
docker compose ps        # should show "mailserver" up
```

**Step 10. Create the account the app logs in as**
```bash
docker exec -it mailserver setup email add appuser@marketwaros.com 'STRONG_PASSWORD_HERE'
```
Write down that password — it becomes `SMTP_PASS`.

---

## PHASE D — Wire the app (Vercel → Project → Settings → Environment Variables)

**Step 11. Generate two secrets**
```bash
openssl rand -hex 32     # run twice; secret #1 and secret #2
```

**Step 12. Add/confirm these env vars (Production), then Redeploy**
```
SMTP_HOST=smtp.marketwaros.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=appuser@marketwaros.com
SMTP_PASS=<password from Step 10>
EMAIL_FROM=MarketWar OS <os@marketwaros.com>
MW_SENDING_HOST=smtp.marketwaros.com
MW_SPF_INCLUDE=_spf.marketwaros.com
MW_TRACK_URL=https://www.marketwaros.com
EMAIL_TRACKING_SECRET=<secret #1>
EMAIL_WEBHOOK_SECRET=<secret #2>
```

---

## PHASE E — Verify the node

**Step 13. Check connectivity**
- Open `https://www.marketwaros.com/api/health/smtp`
- Expect `reachable: true`, `authAdvertised: true`.
- Email Center banner turns green ("Live sending via SMTP").

---

## PHASE F — Authenticate the domain (DKIM / SPF / DMARC) IN THE APP

**Step 14. App → Sending Domains → add `marketwaros.com`**
- The app generates a unique DKIM key and shows the exact records.

**Step 15. Publish the records it shows, at Cloudflare**
- **DKIM** — TXT, Name `mwos._domainkey`, Value = the `v=DKIM1; k=rsa; p=…`
  string the app shows (unique to you; copy it exactly).
- **DMARC** — TXT, Name `_dmarc`, Value
  `v=DMARC1; p=none; rua=mailto:dmarc@marketwaros.com; adkim=s; aspf=s`.
- **SPF** — the app shows `v=spf1 include:_spf.marketwaros.com ~all` for the root
  domain. If marketwaros.com already has an SPF TXT (e.g. for Brevo), MERGE into
  ONE record (only one SPF allowed), e.g.
  `v=spf1 include:_spf.marketwaros.com include:spf.brevo.com ~all`.

**Step 16. App → Sending Domains → Verify DNS**
- When required records resolve, the domain flips to **Authenticated**.

---

## PHASE G — Test + warm up

**Step 17. Send a test to yourself**
- Email Center → From `os@marketwaros.com` → subject + message → **Send test (1)**.
- Check it arrives; view "show original" → `spf=pass`, `dkim=pass`, `dmarc=pass`.

**Step 18. Warm the IP**
- Follow `warmup-schedule.md`: ~50/day, ramp gradually. Register in Google
  Postmaster Tools (postmaster.google.com) with marketwaros.com.

Done = independent ESP: your node, your IP, your domain, DKIM-signed, tracked,
auto-suppressing. No third party.
