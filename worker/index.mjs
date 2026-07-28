// MarketWar OS — video render worker.
//
// Vercel cannot run FFmpeg (60s ceiling, read-only disk, small request bodies),
// so this is a separate long-running container. It polls the app's job queue,
// claims one job at a time, renders it with FFmpeg, uploads the result to
// Firebase Storage and reports back.
//
// Deploy: Cloud Run / Fly.io / Railway (any container host). See README.md.
//
// Required env:
//   APP_URL               https://www.marketwaros.com
//   VIDEO_WORKER_SECRET   same value set on the app (x-worker-secret)
//   FIREBASE_PRIVATE_KEY  the service-account JSON (same as the app)
//   FIREBASE_STORAGE_BUCKET
// Optional: WORKER_ID, POLL_MS

import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const APP_URL = (process.env.APP_URL || "https://www.marketwaros.com").replace(/\/$/, "");
const SECRET = process.env.VIDEO_WORKER_SECRET || "";
const WORKER_ID = process.env.WORKER_ID || `w_${Math.random().toString(36).slice(2, 8)}`;
const POLL_MS = Number(process.env.POLL_MS || 5000);

if (!SECRET) { console.error("VIDEO_WORKER_SECRET is required"); process.exit(1); }

// ---- Firebase Storage (same credentials as the app) ------------------------
function loadCreds() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_PRIVATE_KEY || "").trim();
  if (raw.startsWith("{")) {
    const j = JSON.parse(raw);
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: raw.replace(/\\n/g, "\n"),
  };
}
const creds = loadCreds();
if (!getApps().length) initializeApp({ credential: cert(creds), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
const bucket = getStorage().bucket();

// ---- app queue API ---------------------------------------------------------
async function api(action, payload = {}) {
  const res = await fetch(`${APP_URL}/api/video/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": SECRET },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`${action} failed: HTTP ${res.status}`);
  return res.json();
}

// ---- ffmpeg ----------------------------------------------------------------
function ffmpeg(args, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-progress", "pipe:2", "-y", ...args]);
    let stderr = "";
    p.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s.slice(0, 2000);
      const m = /out_time_ms=(\d+)/.exec(s);
      if (m && onProgress) onProgress(Number(m[1]) / 1000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`))));
  });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch source (HTTP ${res.status})`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function upload(localPath, brandId) {
  const name = `renders/${brandId}/${Date.now()}_${path.basename(localPath)}`;
  const token = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await bucket.upload(localPath, {
    destination: name,
    metadata: { contentType: "video/mp4", metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(name)}?alt=media&token=${token}`;
}

// ---- the seven job kinds ---------------------------------------------------
async function render(job, dir, report) {
  const src = path.join(dir, "in.mp4");
  await download(job.sourceUrl, src);
  const p = job.params || {};
  const out = (n) => path.join(dir, n);

  switch (job.kind) {
    case "trim": {
      const start = Math.max(0, Number(p.startSec) || 0);
      const dur = Math.max(0.1, (Number(p.endSec) || start + 15) - start);
      const f = out("trim.mp4");
      await ffmpeg(["-ss", String(start), "-i", src, "-t", String(dur), "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", f], report);
      return [f];
    }
    case "clips": {
      // Many social cuts from ranked moments. Optionally reframed to vertical.
      const moments = Array.isArray(p.moments) ? p.moments.slice(0, 30) : [];
      if (!moments.length) throw new Error("clips needs params.moments [{startSec,endSec}]");
      const vertical = p.aspect === "9:16";
      const files = [];
      for (let i = 0; i < moments.length; i++) {
        const m = moments[i];
        const start = Math.max(0, Number(m.startSec) || 0);
        const dur = Math.max(1, (Number(m.endSec) || start + 20) - start);
        const f = out(`clip_${String(i + 1).padStart(2, "0")}.mp4`);
        const vf = vertical ? ["-vf", "crop=ih*9/16:ih,scale=1080:1920"] : [];
        await ffmpeg(["-ss", String(start), "-i", src, "-t", String(dur), ...vf, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", f]);
        files.push(f);
        report?.(0); // progress is per-clip below
        await api("progress", { jobId: job.id, progress: Math.round(((i + 1) / moments.length) * 100) });
      }
      return files;
    }
    case "captions_burn": {
      if (!p.srt) throw new Error("captions_burn needs params.srt");
      const sub = out("subs.srt");
      await writeFile(sub, String(p.srt), "utf8");
      const f = out("captioned.mp4");
      const style = "FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,MarginV=40";
      await ffmpeg(["-i", src, "-vf", `subtitles=${sub.replace(/[\\:]/g, "\\$&")}:force_style='${style}'`, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", f], report);
      return [f];
    }
    case "brand": {
      // Watermark the brand logo, bottom-right, with padding.
      const f = out("branded.mp4");
      if (p.logoUrl) {
        const logo = path.join(dir, "logo.png");
        await download(String(p.logoUrl), logo);
        await ffmpeg(["-i", src, "-i", logo, "-filter_complex", "[1]scale=iw*0.14:-1[wm];[0][wm]overlay=W-w-30:H-h-30", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", f], report);
      } else {
        await ffmpeg(["-i", src, "-c", "copy", f]);
      }
      return [f];
    }
    case "broll": {
      // Picture-in-picture B-roll over the base video.
      if (!p.brollUrl) throw new Error("broll needs params.brollUrl");
      const b = path.join(dir, "broll.mp4");
      await download(String(p.brollUrl), b);
      const f = out("broll_out.mp4");
      await ffmpeg(["-i", src, "-i", b, "-filter_complex", "[1]scale=iw*0.35:-1[pip];[0][pip]overlay=W-w-40:40:enable='between(t,0,8)'", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", f], report);
      return [f];
    }
    case "bg_remove": {
      // Chroma-key green screen (true ML matting needs a model — this is the
      // honest, dependency-free version and only claims green-screen removal).
      const colour = String(p.colour || "0x00FF00");
      const f = out("keyed.mp4");
      await ffmpeg(["-i", src, "-vf", `chromakey=${colour}:0.18:0.06,format=yuva420p`, "-c:v", "libvpx-vp9", "-b:v", "2M", "-c:a", "libopus", out("keyed.webm")], report);
      return [out("keyed.webm")];
    }
    case "upscale": {
      const h = Math.min(2160, Math.max(720, Number(p.height) || 1080));
      const f = out(`up_${h}.mp4`);
      await ffmpeg(["-i", src, "-vf", `scale=-2:${h}:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "copy", f], report);
      return [f];
    }
    default:
      throw new Error(`Unknown job kind: ${job.kind}`);
  }
}

// ---- main loop -------------------------------------------------------------
async function tick() {
  const { job } = await api("claim", { workerId: WORKER_ID });
  if (!job) return false;
  console.log(`[${WORKER_ID}] claimed ${job.id} (${job.kind})`);
  const dir = await mkdtemp(path.join(tmpdir(), "mw-"));
  try {
    const files = await render(job, dir, () => {});
    const urls = [];
    for (const f of files) urls.push(await upload(f, job.brandId));
    await api("complete", { jobId: job.id, outputUrls: urls });
    console.log(`[${WORKER_ID}] done ${job.id} → ${urls.length} file(s)`);
  } catch (e) {
    console.error(`[${WORKER_ID}] failed ${job.id}:`, e.message);
    await api("fail", { jobId: job.id, error: e.message?.slice(0, 300) || "render failed" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return true;
}

console.log(`[${WORKER_ID}] video worker up — polling ${APP_URL} every ${POLL_MS}ms`);
for (;;) {
  try {
    const did = await tick();
    if (!did) await new Promise((r) => setTimeout(r, POLL_MS));
  } catch (e) {
    console.error("loop error:", e.message);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
