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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
  const ext = path.extname(localPath).toLowerCase();
  const contentType = ext === ".webm" ? "video/webm" : ext === ".mp3" ? "audio/mpeg" : "video/mp4";
  await bucket.upload(localPath, {
    destination: name,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(name)}?alt=media&token=${token}`;
}

// ---- pass executor ---------------------------------------------------------
// The worker does NOT decide what FFmpeg should do. The app hands over a list of
// passes (built from src/backend/ffmpeg-recipes.ts) and this runs them. That is
// why a change to the crop maths or caption style needs no container redeploy.
async function runPasses(job, passes, dir, onProgress) {
  const src = path.join(dir, "in.mp4");
  await download(job.sourceUrl, src);

  const outputs = [];
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    let assetPath;
    if (pass.asset) {
      assetPath = path.join(dir, pass.asset.filename);
      if (pass.asset.url) await download(pass.asset.url, assetPath);
      else if (typeof pass.asset.inlineText === "string") await writeFile(assetPath, pass.asset.inlineText, "utf8");
    }
    const outPath = path.join(dir, pass.output);
    const args = resolveArgs(pass.args, { input: src, output: outPath, asset: assetPath });
    console.log(`[${WORKER_ID}]   ${pass.label}`);
    await ffmpeg(args);
    outputs.push(outPath);
    // Report progress across passes — the only progress signal that means
    // anything when a job is 30 separate clips.
    await onProgress(Math.round(((i + 1) / passes.length) * 100));
  }
  return outputs;
}

// Placeholder substitution — kept byte-identical to resolveArgs() in
// src/backend/ffmpeg-recipes.ts. The escaped form is for paths that sit inside
// a filtergraph, where ":" and "\\" would otherwise break parsing.
function escapeFilterPath(p) {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
function resolveArgs(args, paths) {
  return args.map((a) =>
    a
      .replace(/\$ASSET_ESCAPED/g, paths.asset ? escapeFilterPath(paths.asset) : "")
      .replace(/\$ASSET/g, paths.asset ?? "")
      .replace(/\$IN/g, paths.input)
      .replace(/\$OUT/g, paths.output),
  );
}

// ---- main loop -------------------------------------------------------------
async function tick() {
  const { job, passes } = await api("claim", { workerId: WORKER_ID });
  if (!job) return false;
  if (!Array.isArray(passes) || !passes.length) {
    console.error(`[${WORKER_ID}] ${job.id} arrived with no render passes — skipping`);
    await api("fail", { jobId: job.id, error: "No render passes supplied" });
    return true;
  }
  console.log(`[${WORKER_ID}] claimed ${job.id} (${job.kind}) — ${passes.length} pass(es)`);
  const dir = await mkdtemp(path.join(tmpdir(), "mw-"));
  try {
    const files = await runPasses(job, passes, dir, (p) => api("progress", { jobId: job.id, progress: p }).catch(() => {}));
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
