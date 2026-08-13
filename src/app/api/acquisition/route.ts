import { NextRequest, NextResponse } from "next/server";
import {
  addProspect, recordAttempt, setStage, listProspects, funnelFrom, diagnose, rates,
  STAGES, ACQUISITION_DOCTRINE, type Channel, type Stage,
} from "@/backend/acquisition";
import { GTM_TARGETS, GTM_DOCTRINE, targetById } from "@/shared/gtm-targets";
import { ENGINE_REGISTRY } from "@/shared/engine-registry";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

// THE ACQUISITION RUN — how many people were actually asked, and what happened.
//
// GET  ?brandId=…&targetId=…   → the pipeline, the counted funnel, the diagnosis
// POST { action: "prospect" }  → add a named business or person
// POST { action: "attempt" }   → record a message that was actually sent
// POST { action: "stage" }     → move one, with the evidence that justifies it
//
// NOT METERED, and it never will be. This is arithmetic over records the
// customer typed; charging for it would be charging somebody to count their own
// sales calls. No provider is called anywhere in this route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS: Channel[] = ["email", "linkedin", "whatsapp", "phone", "in_person", "group_post", "referral", "inbound"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const brandId = (url.searchParams.get("brandId") || "").trim();
  const targetId = (url.searchParams.get("targetId") || "").trim();

  if (!brandId) {
    return NextResponse.json({ targets: GTM_TARGETS, stages: STAGES, channels: CHANNELS, doctrine: GTM_DOCTRINE });
  }
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const prospects = await listProspects(brandId, targetId || undefined);
  const funnel = funnelFrom(prospects);
  return NextResponse.json({
    target: targetId ? targetById(targetId) : null,
    targets: GTM_TARGETS,
    stages: STAGES,
    channels: CHANNELS,
    prospects,
    funnel,
    rates: rates(funnel),
    // The engine count is passed in rather than typed, so the sentence "N
    // engines and 0 messages sent" can never quote a number that is out of date.
    diagnosis: diagnose(funnel, ENGINE_REGISTRY.length),
    doctrine: ACQUISITION_DOCTRINE,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "acquisition"), 120, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const num = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : Number(body[k]) || 0);

  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const nowISO = new Date().toISOString();
  const action = str("action") || "prospect";

  if (action === "prospect") {
    const res = await addProspect({
      brandId, targetId: str("targetId") || "marketwar",
      name: str("name"), contact: str("contact"), where: str("where"),
      source: str("source"), nowISO,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ prospect: res.prospect, charged: false });
  }

  if (action === "attempt") {
    const channel = (CHANNELS.includes(str("channel") as Channel) ? str("channel") : "email") as Channel;
    const res = await recordAttempt({
      id: str("id"), channel, message: str("message"),
      by: access.uid || "owner", nowISO,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ prospect: res.prospect, charged: false });
  }

  if (action === "stage") {
    const res = await setStage({
      id: str("id"), stage: str("stage") as Stage,
      reply: str("reply") || undefined,
      valueGbp: num("valueGbp") || undefined,
      lostReason: str("lostReason") || undefined,
      nowISO,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ prospect: res.prospect, charged: false });
  }

  return NextResponse.json({ error: "Unknown action — use prospect, attempt or stage." }, { status: 400 });
}
