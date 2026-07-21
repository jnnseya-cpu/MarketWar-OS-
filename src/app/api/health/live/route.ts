import { NextResponse } from "next/server";
import { adminConfigured } from "@/backend/firebase-admin";
import { storageConfigured } from "@/backend/storage";
import { zernioConfigured } from "@/backend/zernio";
import { videoGatewayConfigured } from "@/backend/video-gateway";

// Live-readiness matrix — a SAFE, no-spend pre-flight for the deployed app.
// Reports which live capabilities are wired vs still demo, and exactly what to
// set to activate each. Use it after adding production secrets to confirm the
// platform flipped to live BEFORE spending on a real generate/render.
export const runtime = "nodejs";

const env = (k: string) => Boolean(process.env[k]);

export async function GET() {
  const ai = env("ANTHROPIC_API_KEY") || env("OPENAI_API_KEY") || env("GEMINI_API_KEY");
  const storage = storageConfigured();
  const caps = [
    { capability: "AI intelligence (agents + engines)", ready: ai, activates: "ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY)" },
    { capability: "Firebase Admin (persistence, storage, auth)", ready: adminConfigured, activates: "FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY" },
    { capability: "Media hosting (Firebase Storage)", ready: storage, activates: "Firebase Admin secrets + FIREBASE_STORAGE_BUCKET" },
    { capability: "Hosted, attachable images (Brand Studio)", ready: storage, activates: "Firebase Storage (above) — brand-safe PNG hosts even without an image model" },
    { capability: "Photoreal image backgrounds", ready: env("OPENAI_API_KEY"), activates: "OPENAI_API_KEY (gpt-image-1)" },
    { capability: "Video render (Veo/Sora)", ready: videoGatewayConfigured(), activates: "GEMINI_API_KEY (Veo) or OPENAI_API_KEY (Sora)" },
    { capability: "Hosted, attachable video", ready: videoGatewayConfigured() && storage, activates: "a video model key + Firebase Storage" },
    { capability: "Social publishing (Zernio, 15 channels)", ready: zernioConfigured(), activates: "ZERNIO_API_KEY" },
    { capability: "Email sending (SMTP pool)", ready: env("SMTP_HOST") && env("SMTP_USER"), activates: "SMTP_HOST + SMTP_USER + SMTP_PASS" },
    { capability: "Payments (Stripe)", ready: env("STRIPE_SECRET_KEY"), activates: "STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET)" },
  ];
  const readyCount = caps.filter((c) => c.ready).length;
  return NextResponse.json({
    service: "MarketWar OS",
    liveReady: readyCount,
    total: caps.length,
    allDemo: readyCount === 0,
    capabilities: caps,
    note: "Safe pre-flight — no provider calls, no spend. Each 'ready:false' shows exactly what to set. Run scripts/smoke-live.mjs against the deployed URL to exercise the live paths end to end.",
  });
}
