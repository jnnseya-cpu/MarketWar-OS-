import { NextResponse } from "next/server";
import { ENV_CATALOGUE, ENV_NAMES } from "@/shared/env-catalogue";

// Live-readiness matrix — a SAFE, no-spend pre-flight for the deployed app.
// Reports which live capabilities are wired vs still demo, and exactly what to
// set to activate each.
//
// CRASH-PROOF BY CONSTRUCTION: this route imports NOTHING from @/backend at the
// top level. A static top-level import that throws at MODULE LOAD (e.g. an SDK
// init on the serverless runtime) cannot be caught by any try/catch inside the
// handler — it takes down the whole module and returns a bare "Internal Server
// Error" 500. So every backend module here is pulled in via DYNAMIC import()
// INSIDE a try/catch. If a module throws on import, we capture the message and
// report it in the JSON instead of 500-ing — which also makes this endpoint a
// self-diagnosing probe: it names the exact module and error that's failing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const env = (k: string) => Boolean(process.env[k]);

// Dynamically import a backend module and run a probe against it. Any failure —
// import-time throw OR probe throw — is captured, never propagated.
async function probe(load: () => Promise<boolean>): Promise<{ ready: boolean; error?: string }> {
  try {
    return { ready: await load() };
  } catch (e) {
    return { ready: false, error: (e as Error).message };
  }
}

export async function GET() {
  const errors: Record<string, string> = {};
  const track = (name: string, r: { ready: boolean; error?: string }) => {
    if (r.error) errors[name] = r.error;
    return r.ready;
  };

  // THE REASON, NOT JUST THE BOOLEAN.
  //
  // This read `Boolean(m.adminConfigured)` and reported `ready: false`. On a
  // deployment where FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and
  // FIREBASE_PROJECT_ID are ALL present, that single word is the most misleading
  // thing this endpoint can say: it looks like a missing key when it is in fact
  // a credential the SDK rejected, and the two need completely different actions.
  //
  // Without Admin nothing persists and nothing authenticates, so from the seat
  // of whoever is using it the entire platform is broken — no sign-in, no brand,
  // every dashboard empty. That is the loudest possible failure reported here as
  // one `false` among fourteen.
  //
  // `adminDiagnostics` has held the exact reason all along — initError, the
  // credential source, whether the PEM is well formed, the raw length of each
  // variable as the DEPLOYED build sees it, and a fingerprint of the key so two
  // redeploys can be told apart. It was surfaced only on /api/health/auth, which
  // nobody opens when the symptom is "nothing works". The value existed on one
  // side of a boundary and was never carried across: the twenty-sixth time.
  let adminWhy: Record<string, unknown> | null = null;
  const admin = track("firebase-admin", await probe(async () => {
    const m = await import("@/backend/firebase-admin");
    adminWhy = m.adminDiagnostics as unknown as Record<string, unknown>;
    return Boolean(m.adminConfigured);
  }));
  const storage = track("storage", await probe(async () => {
    const m = await import("@/backend/storage");
    return m.storageConfigured();
  }));
  const video = track("video-gateway", await probe(async () => {
    const m = await import("@/backend/video-gateway");
    return m.videoGatewayConfigured();
  }));
  const zernio = track("zernio", await probe(async () => {
    const m = await import("@/backend/zernio");
    return m.zernioConfigured();
  }));

  const ai = env("ANTHROPIC_API_KEY") || env("OPENAI_API_KEY") || env("GEMINI_API_KEY");

  const caps = [
    { capability: "AI intelligence (agents + engines)", ready: ai, activates: "ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY)" },
    {
      capability: "Firebase Admin (persistence, storage, auth)", ready: admin,
      activates: "FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY",
      // Credentials present and STILL not ready is a different fault from
      // credentials absent, and it is the more serious one — it looks configured.
      ...(admin ? {} : {
        why: (adminWhy as { initError?: string } | null)?.initError
          || "Admin did not initialise and reported no reason. Open /api/health/auth for the full credential diagnostic.",
        impact: "Nothing persists and nobody stays signed in. Every dashboard is empty, no brand loads, and saved work is lost — which from a user's seat is the whole platform being broken, not one capability being off.",
      }),
    },
    { capability: "Media hosting (Firebase Storage)", ready: storage, activates: "Firebase Admin secrets + FIREBASE_STORAGE_BUCKET" },
    { capability: "Hosted, attachable images (Brand Studio)", ready: storage, activates: "Firebase Storage (above) — brand-safe PNG hosts even without an image model" },
    { capability: "Photoreal image backgrounds", ready: env("OPENAI_API_KEY"), activates: "OPENAI_API_KEY (gpt-image-1)" },
    { capability: "Video render (Veo/Sora)", ready: video, activates: "GEMINI_API_KEY (Veo) or OPENAI_API_KEY (Sora)" },
    { capability: "Hosted, attachable video", ready: video && storage, activates: "a video model key + Firebase Storage" },
    { capability: "Social publishing (Zernio, 15 channels)", ready: zernio, activates: "ZERNIO_API_KEY" },
    { capability: "Email sending (SMTP pool)", ready: env("SMTP_HOST") && env("SMTP_USER"), activates: "SMTP_HOST + SMTP_USER + SMTP_PASS" },
    { capability: "Payments (Stripe)", ready: env("STRIPE_SECRET_KEY"), activates: "STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET)" },
    { capability: "Live prospect + market search", ready: env("SERPER_API_KEY"), activates: "SERPER_API_KEY — without it LeadWar Room and market research return nothing rather than inventing prospects" },
    { capability: "Voiceovers & dubbing", ready: env("ELEVENLABS_API_KEY"), activates: "ELEVENLABS_API_KEY" },
    // Two different things were listed together here as if they were the same
    // kind of dependency. FFMPEG_CLOUD_API_KEY is a THIRD PARTY
    // (api.ffmpeg-micro.com, a new supplier and a new bill). VIDEO_WORKER_SECRET
    // is a shared secret for the container in worker/ that MarketWar runs
    // itself, on infrastructure the stack already uses — not a vendor at all.
    // And clip cutting needs neither: the browser does it (clip-render.ts).
    { capability: "Clip cutting to 9:16 — captions burned in, logo, B-roll", ready: true, activates: "Already live and needs no key at all. The customer's browser does the cropping, the captions, the logo overlay and the picture-in-picture B-roll, so there is no upload, no queue and no render bill. Chrome, Edge or Firefox on a desktop." },
    // Reports the state this deployment is ACTUALLY in rather than generic
    // advice. The two executors are not interchangeable: the hosted API takes a
    // flat list of FFmpeg options and cannot run filter_complex, so a logo
    // overlay or picture-in-picture B-roll only ever runs on the self-hosted
    // worker. Telling an owner who already pays for the hosted service to "go
    // set it up" is noise; telling them which two of seven jobs it cannot do is
    // the thing worth knowing.
    {
      capability: "Server-side batch rendering (queued trim/clips/captions/brand/B-roll/upscale)",
      ready: env("FFMPEG_CLOUD_API_KEY") || env("VIDEO_WORKER_SECRET"),
      activates: env("VIDEO_WORKER_SECRET")
        ? "Live on your own worker container — every render kind is available, including the logo and B-roll composites."
        : env("FFMPEG_CLOUD_API_KEY")
          ? "Live on the hosted renderer: trim, clips, burned captions, background removal and upscale all run QUEUED here. The queued versions of logo overlay and B-roll do not — they need FFmpeg's filter_complex — and are refused before anything is charged. That is no longer a missing capability: both are available in the browser from the Clip Finder, at no cost and with no key. The worker is only worth adding for unattended batches of those two."
          : "OPTIONAL, and not needed for clip cutting — the browser does that. For unattended batches: either run worker/ yourself (a container on the Google Cloud account this stack already uses, no new supplier) or set FFMPEG_CLOUD_API_KEY for the hosted service, which is a supplier and a per-minute bill.",
    },
  ];
  const readyCount = caps.filter((c) => c.ready).length;

  // RAW env presence — the definitive truth about what THIS running deployment
  // actually holds in process.env (booleans only, never values). If you set a
  // key in Vercel but it reads false here, the running deployment does not have
  // it: usually set on the wrong Environment (Preview vs Production), or set but
  // NOT redeployed since, or a different project/domain is serving this URL.
  // EVERY VARIABLE THIS PLATFORM READS, from the one registry.
  //
  // This was a hand-typed list of 35 names while the codebase read 133 — so
  // RESEND_API_KEY, APOLLO_API_KEY, COMPANIES_HOUSE_API_KEY, ONFIDO_API_TOKEN,
  // WHATSAPP_TOKEN, FB_APP_SECRET, the Google OAuth trio and every webhook
  // secret were invisible here. A key you cannot see is a key you cannot tell is
  // missing. `shared/env-catalogue.ts` is now the single list, and a test walks
  // the source and fails if anything read from the environment is missing from
  // it, so this can no longer drift.
  const KEYS = ENV_NAMES;
  const envPresent: Record<string, boolean> = {};
  for (const k of KEYS) envPresent[k] = env(k);

  // The capability list above answers "is this wired", one variable at a time.
  // Every state that actually hurts someone is a COMBINATION — a live Stripe
  // key with no webhook secret charges the card and credits nothing; Firebase
  // Admin with no encryption key refuses every PII write in silence. This
  // reports those as consequences. Dynamically imported and caught, like every
  // other backend module here, so a launch pre-flight can never itself 500.
  const launch = await (async () => {
    try {
      const m = await import("@/backend/launch-check");
      // The REAL Admin state, not the presence of its variables. Without this
      // the go-live report reads the environment and declares Firebase fine on
      // a deployment where the SDK rejected the credentials and nothing persists.
      const a = adminWhy as { initError?: string } | null;
      return m.launchReport(m.readLaunchEnv(process.env, { adminConfigured: admin, adminInitError: a?.initError ?? null }));
    } catch (e) {
      errors["launch-check"] = (e as Error).message;
      return undefined;
    }
  })();

  return NextResponse.json({
    launch,
    service: "MarketWar OS",
    // WHICH CODE IS ACTUALLY RUNNING — the question that blocked a whole day.
    //
    // A fix was pushed, CI was green, and there was no way to tell from the
    // outside whether the deployment serving the domain had picked it up. The
    // only build stamp in the codebase lived in `/api/health/ai` and read
    // `VERCEL_GIT_COMMIT_SHA` alone, so on Firebase App Hosting — the other host
    // this repo supports — it said "unknown".
    //
    // Every host stamps the commit under a different name, so all of them are
    // read and the one that answered is named. `host: "unknown"` with no commit
    // means this deployment cannot tell you what it is running, which is itself
    // the finding: compare `commit` against the SHA you pushed before spending
    // another hour on a bug that may already be fixed.
    // The full credential diagnostic, beside the capability it explains. Safe:
    // lengths, a one-way fingerprint and a reason — never a key.
    firebaseAdmin: adminWhy,
    build: (() => {
      const sources: [string, string | undefined][] = [
        ["vercel", process.env.VERCEL_GIT_COMMIT_SHA],
        ["firebase-app-hosting", process.env.CLOUD_RUN_REVISION || process.env.K_REVISION],
        ["github-actions", process.env.GITHUB_SHA],
        ["generic", process.env.COMMIT_SHA || process.env.SOURCE_COMMIT || process.env.GIT_COMMIT],
      ];
      const found = sources.find(([, v]) => Boolean(v && v.trim()));
      return {
        commit: found ? String(found[1]).slice(0, 12) : "unknown",
        host: found ? found[0] : "unknown",
        note: found
          ? "Compare this with the commit you pushed. If they differ, the deployment has not picked up your change yet and nothing in the code will explain what you are seeing."
          : "This deployment exposes no commit stamp, so it cannot say which build it is running. Set COMMIT_SHA in the host's environment to make that answerable.",
      };
    })(),
    vercelEnv: process.env.VERCEL_ENV || "unknown", // "production" | "preview" | "development"
    liveReady: readyCount,
    total: caps.length,
    allDemo: readyCount === 0,
    aiConnected: ai,
    capabilities: caps,
    // The raw truth about what this running build actually has:
    envPresent,
    // AND WHAT IS MISSING, WITH WHAT IT COSTS AND WHERE TO GET IT.
    //
    // `envPresent` answers "is it set?" one name at a time, which is the right
    // answer to the wrong question when somebody is standing in front of a
    // half-configured deployment asking "what do I still need?". This is that
    // question, answered from the same registry: every variable the code reads
    // that this process does not hold, grouped, with what stops working and
    // where the owner obtains it. Names and prose only — never a value.
    envMissing: ENV_CATALOGUE
      .filter((e) => !env(e.name))
      .map((e) => ({ name: e.name, group: e.group, secret: e.secret, unlocks: e.unlocks, where: e.where })),
    envSummary: (() => {
      const missing = ENV_CATALOGUE.filter((e) => !env(e.name));
      const byGroup: Record<string, number> = {};
      for (const m of missing) byGroup[m.group] = (byGroup[m.group] || 0) + 1;
      return {
        catalogued: ENV_CATALOGUE.length,
        set: ENV_CATALOGUE.length - missing.length,
        missing: missing.length,
        missingByGroup: byGroup,
      };
    })(),
    // Present ONLY if a backend module failed to import/probe — names the module
    // and the exact error so a 500's root cause is visible without server logs.
    moduleErrors: Object.keys(errors).length ? errors : undefined,
    note: "envPresent is the source of truth: it lists what THIS deployment holds in process.env (booleans, never values). If a key you set in Vercel shows false: (1) it was set on a different Environment than 'vercelEnv' above, (2) you didn't redeploy after saving it, or (3) a different Vercel project/branch serves this domain. GitHub repo secrets do NOT reach the app — only Vercel Project env vars do.",
  });
}
