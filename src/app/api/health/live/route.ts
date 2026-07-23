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
  ];
  const envPresent: Record<string, boolean> = {};
  for (const k of KEYS) envPresent[k] = env(k);

  return NextResponse.json({
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
