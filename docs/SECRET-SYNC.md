# Manage keys in GitHub, sync to Secret Manager

Firebase App Hosting reads runtime secrets from **Google Secret Manager**, not
from GitHub. The workflow `.github/workflows/sync-secrets.yml` bridges the gap:
you keep your keys as **GitHub Actions secrets**, and one workflow run pushes
them into Secret Manager (where the deployed app reads them).

## One-time setup

### 1. A Google service account for the sync (GitHub → GCP auth)

The workflow needs permission to write to Secret Manager.

1. Google Cloud Console → **IAM & Admin → Service Accounts → Create service account**
   (project `studio-1718252475-c6017`). Name it e.g. `github-secret-sync`.
2. Grant it the role **Secret Manager Admin** (`roles/secretmanager.admin`).
3. Open the account → **Keys → Add key → JSON** → download the file.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `GCP_SA_KEY`
   - Value: paste the **entire JSON** file contents.

### 2. Your provider keys as GitHub secrets

Same screen (**Settings → Secrets and variables → Actions**), add each key you
have. Names must be exactly these (UPPER_SNAKE):

| GitHub secret | What it powers |
|---|---|
| `ANTHROPIC_API_KEY` | Live AI (agents + engines) |
| `OPENAI_API_KEY` | AI failover + photoreal images (gpt-image-1) + Sora video |
| `ZERNIO_API_KEY` | Social publishing (15 channels) |
| `FIREBASE_PRIVATE_KEY` | Persistence, Auth, hosted media (Storage) |
| `STRIPE_SECRET_KEY` | Checkout, subscriptions, ACU top-ups |
| `STRIPE_WEBHOOK_SECRET` | (optional) auto revenue/ACU attribution |
| `GEMINI_API_KEY` | (optional) AI failover + Veo video |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | real browser sign-up / login (see note below) |

Only the ones you add get synced; the rest are skipped.

> **`NEXT_PUBLIC_FIREBASE_API_KEY` is a BUILD-time secret** (Next.js inlines
> `NEXT_PUBLIC_*` into the client bundle at build). App Hosting must therefore
> expose it to the **build** service account, not just the runtime one. The
> optional grant step (below) covers the runtime SA; to be safe for this one,
> also run once:
> `firebase apphosting:secrets:grantaccess firebase-web-api-key --backend <backend-id>`
> — the Firebase CLI grants every service account App Hosting needs (build + run).

> **Note on `FIREBASE_PRIVATE_KEY`:** paste the `private_key` value from your
> Firebase service-account JSON, including the `-----BEGIN PRIVATE KEY-----` /
> `-----END PRIVATE KEY-----` lines. Multi-line is fine — GitHub stores it verbatim.

### 3. (Recommended) Let the workflow grant App Hosting access

App Hosting can only read a secret if its backend service account has access.
Add this so the sync grants it automatically:

1. Find the backend service account: **Firebase Console → App Hosting → your
   backend → Settings**, or run
   `firebase apphosting:backends:get <backend-id> --project studio-1718252475-c6017`
   and read its `serviceAccount`. It looks like
   `firebase-app-hosting-compute@studio-1718252475-c6017.iam.gserviceaccount.com`
   or `service-<project-number>@gcp-sa-firebaseapphosting.iam.gserviceaccount.com`.
2. GitHub → **Settings → Secrets and variables → Actions → Variables tab → New
   repository variable**: name `APPHOSTING_SA`, value = that email.

If you skip this, sync still works — grant access once by hand:
`firebase apphosting:secrets:grantaccess <name> --backend <backend-id>`.

## Run it

1. GitHub repo → **Actions** tab → **Sync secrets to Secret Manager** → **Run workflow**.
2. Watch the run — each key prints `✓ synced <name>` (or `· skip` if not set).
3. Trigger an **App Hosting rollout** (Firebase Console → App Hosting), or push to
   the connected branch.
4. Open **`https://marketwaros.com/api/health/live`** — capabilities should read
   **live**. That endpoint is the proof.

Re-run the workflow any time you rotate a key. Then redeploy.

## Troubleshooting

- **`PERMISSION_DENIED` creating/adding a secret** → `GCP_SA_KEY`'s service
  account is missing `roles/secretmanager.admin`.
- **Deploy fails "secret X not found"** → that key wasn't synced (no matching
  GitHub secret) but is referenced in `apphosting.yaml`. Add the GitHub secret and
  re-run, or comment the reference out.
- **Deploy fails "permission denied on secret X"** → App Hosting can't read it;
  set `APPHOSTING_SA` (step 3) and re-run, or grant access by hand.
- **Still shows demo after deploy** → the rollout used an old build; trigger a
  fresh rollout and re-check `/api/health/live`.
