import { NextResponse } from "next/server";

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

  const admin = track("firebase-admin", await probe(async () => {
    const m = await import("@/backend/firebase-admin");
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
    { capability: "Firebase Admin (persistence, storage, auth)", ready: admin, activates: "FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY" },
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
  const KEYS = [
    "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY", "GEMINI_API_KEY", "AI_GATEWAY_ORDER",
    "NEXT_PUBLIC_FIREBASE_API_KEY", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_STORAGE_BUCKET",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ZERNIO_API_KEY", "SERPER_API_KEY", "PLATFORM_ADMIN_EMAILS",
    // Email is the highest-revenue action in the platform and the one most
    // often missed, because nothing else fails without it — it simply does not
    // send. Surfaced here so a go-live check can catch it.
    "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM",
    "ELEVENLABS_API_KEY", "FFMPEG_CLOUD_API_KEY", "VIDEO_WORKER_SECRET",
    // THE REST OF WHAT A GO-LIVE ACTUALLY NEEDS.
    //
    // This list was the answer to "which variables did my deployment really
    // receive?", and it omitted the secrets, the trader's legal details and the
    // canonical host — so the owner could set eight things in Vercel and this
    // endpoint would confirm three of them. A presence report with holes sends
    // somebody back to the dashboard to guess, which is the position that
    // produced a month of unexplained mail.
    "CRON_SECRET", "HUMAN_CHECK_SECRET", "FIELD_ENCRYPTION_MASTER_KEY",
    "PORTAL_LINK_SECRET", "NEWSLETTER_SECRET", "POSTBACK_ROOT_SECRET",
    "AI_MONTHLY_CEILING_USD", "MW_SITE_HOST", "MW_BOUNCE_ADDRESS", "MW_BOUNCE_HOST",
    "NEXT_PUBLIC_LEGAL_ENTITY_NAME", "NEXT_PUBLIC_REGISTERED_ADDRESS",
    "NEXT_PUBLIC_COMPANY_NUMBER", "NEXT_PUBLIC_VAT_NUMBER",
  ];
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
      return m.launchReport(m.readLaunchEnv());
    } catch (e) {
      errors["launch-check"] = (e as Error).message;
      return undefined;
    }
  })();

  return NextResponse.json({
    launch,
    service: "MarketWar OS",
    deploymentTimeUTC: process.env.VERCEL_DEPLOYMENT_ID ? undefined : undefined, // (informational placeholder)
    vercelEnv: process.env.VERCEL_ENV || "unknown", // "production" | "preview" | "development"
    liveReady: readyCount,
    total: caps.length,
    allDemo: readyCount === 0,
    aiConnected: ai,
    capabilities: caps,
    // The raw truth about what this running build actually has:
    envPresent,
    // Present ONLY if a backend module failed to import/probe — names the module
    // and the exact error so a 500's root cause is visible without server logs.
    moduleErrors: Object.keys(errors).length ? errors : undefined,
    note: "envPresent is the source of truth: it lists what THIS deployment holds in process.env (booleans, never values). If a key you set in Vercel shows false: (1) it was set on a different Environment than 'vercelEnv' above, (2) you didn't redeploy after saving it, or (3) a different Vercel project/branch serves this domain. GitHub repo secrets do NOT reach the app — only Vercel Project env vars do.",
  });
}
