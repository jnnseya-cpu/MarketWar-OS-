# MarketWar Video Render Worker

Vercel functions cannot run FFmpeg — 60s ceiling, read-only filesystem, small
request bodies. This container does the pixel work: it polls the app's job queue,
claims one job at a time, renders with FFmpeg, uploads the result to Firebase
Storage and reports back.

The app never touches FFmpeg. The worker never touches a user session. The queue
(`/api/video/jobs`) is the only contract between them.

## What it renders

| kind | does | params |
|---|---|---|
| `trim` | cut in/out → one clip | `startSec`, `endSec` |
| `clips` | cut many moments → social clips | `moments:[{startSec,endSec}]`, `aspect:"9:16"` |
| `captions_burn` | burn subtitles into the frame | `srt` |
| `brand` | watermark the brand logo | `logoUrl` |
| `broll` | picture-in-picture B-roll | `brollUrl` |
| `bg_remove` | green-screen chroma key → transparent WebM | `colour` |
| `upscale` | resolution upscale (lanczos) | `height` |

## Deploy

```bash
# 1. Set the shared secret on the APP (Vercel env), then here:
#    VIDEO_WORKER_SECRET=<same long random string>

# Fly.io
fly launch --no-deploy
fly secrets set APP_URL=https://www.marketwaros.com \
  VIDEO_WORKER_SECRET=... \
  FIREBASE_PRIVATE_KEY='<the whole service-account JSON>' \
  FIREBASE_STORAGE_BUCKET=<bucket>
fly deploy

# Google Cloud Run
gcloud run deploy mw-video-worker --source . --region europe-west2 \
  --no-allow-unauthenticated --cpu 2 --memory 4Gi --min-instances 1 \
  --set-env-vars APP_URL=https://www.marketwaros.com,FIREBASE_STORAGE_BUCKET=<bucket> \
  --set-secrets VIDEO_WORKER_SECRET=...:latest,FIREBASE_PRIVATE_KEY=...:latest

# Railway: New Project → Deploy from Dockerfile → add the same variables.
```

`--min-instances 1` matters: the worker polls, so it must stay warm. Scaling to
zero means jobs sit in the queue until something wakes it.

## Sizing
Renders are CPU-bound. 1 vCPU / 2GB handles trims and watermarks; give it 2 vCPU
/ 4GB for `clips`, `upscale` and `bg_remove`. Run several instances to process
jobs in parallel — claiming is transactional, so two workers can never take the
same job.

## Reliability
- A job claimed but unfinished for 20 minutes is re-claimed (worker died).
- Three failed attempts marks it failed and **refunds the customer's ACUs**.
- Progress is reported so the UI can show a real percentage.
