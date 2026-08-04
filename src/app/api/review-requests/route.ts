import { NextRequest, NextResponse } from "next/server";
import {
  REVIEW_PLATFORMS, askablePlatforms, planCampaign, draftRequest, reviewLink,
  gatingCheck, NO_GATING_DOCTRINE, PACING_IS_A_CONVENTION,
  type RequestCandidate, type RequestChannel, type RequestConfig,
} from "@/backend/review-requests";
import { listContacts } from "@/backend/contacts";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// Review requests — asking real customers for real reviews.
//
// POST { action: "plan", platformId, channel, brandName, brandId | candidates[], … }
// POST { action: "draft", platformId, channel, brandName, identifier|pastedUrl, … }
// GET  → the platform table and the doctrine
//
// Metered like everything else (`report` — the rate for work on data the
// customer already owns; nothing here calls a provider).
//
// GATING IS REJECTED AT THE DOOR. `gatingCheck` runs on the raw body before any
// work happens, so a request that tries to filter recipients by rating or
// sentiment is refused with the reason rather than quietly honoured — screening
// for happy customers first is a banned practice under the DMCC Act 2024 and
// the FTC's fake-review rule, not a feature toggle.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHANNELS: RequestChannel[] = ["email", "sms", "whatsapp"];

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "review-requests"), 40, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // Before anything else, including before charging. Checked at the top level
  // AND inside `config`, because a filter nested one level down is still a
  // filter — and that is where a caller would naturally put it.
  for (const scope of [body, (body.config && typeof body.config === "object" ? body.config : {}) as Record<string, unknown>]) {
    const gate = gatingCheck(scope);
    if (!gate.ok) return NextResponse.json({ error: gate.error, gatingKey: gate.key }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const action = str("action") || "plan";
  if (action !== "plan" && action !== "draft") {
    return NextResponse.json({ error: "Unknown action — use plan or draft" }, { status: 400 });
  }
  const channel = (CHANNELS.includes(str("channel") as RequestChannel) ? str("channel") : "email") as RequestChannel;
  const platformId = str("platformId");
  if (!platformId) return NextResponse.json({ error: "platformId required", platforms: REVIEW_PLATFORMS.map((p) => p.id) }, { status: 400 });

  const meter = await meterAction(auth, "report");
  if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });

  const identifier = str("identifier") || undefined;
  const pastedUrl = str("pastedUrl") || undefined;

  if (action === "draft") {
    const link = reviewLink(platformId, { identifier, pastedUrl });
    if (!link.ok) return NextResponse.json({ error: link.error, hint: link.hint }, { status: 400 });
    return NextResponse.json({
      link: link.url,
      linkSource: link.source,
      draft: draftRequest({
        platformId, channel,
        brandName: str("brandName") || "your business",
        link: link.url,
        contactName: str("contactName") || undefined,
        senderName: str("senderName") || undefined,
        whatTheyBought: str("whatTheyBought") || undefined,
        customBody: str("customBody") || undefined,
      }),
      doctrine: NO_GATING_DOCTRINE,
    });
  }

  // Who to ask. Either the brand's own vault (ownership-checked, exactly like
  // the Email Centre) or an explicit list for a customer who keeps their
  // records elsewhere.
  let candidates: RequestCandidate[] = [];
  const brandId = str("brandId");
  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const contacts = await listContacts(brandId).catch(() => []);
    // Only the transactional fields cross this boundary — the eligibility
    // engine has nowhere to put an opinion even if one were supplied.
    candidates = contacts.map((c) => ({
      id: c.id, name: c.name, email: c.email, phone: c.phone,
      orderCount: c.orderCount, lastOrderDaysAgo: c.lastOrderDaysAgo, consent: c.consent,
    }));
  } else if (Array.isArray(body.candidates)) {
    candidates = (body.candidates as Record<string, unknown>[]).map((r, i) => ({
      id: typeof r.id === "string" && r.id ? r.id : `c${i + 1}`,
      name: typeof r.name === "string" ? r.name : undefined,
      email: typeof r.email === "string" ? r.email : undefined,
      phone: typeof r.phone === "string" ? r.phone : undefined,
      orderCount: typeof r.orderCount === "number" ? r.orderCount : undefined,
      lastOrderDaysAgo: typeof r.lastOrderDaysAgo === "number" ? r.lastOrderDaysAgo : undefined,
      consent: typeof r.consent === "boolean" ? r.consent : undefined,
    }));
  } else {
    return NextResponse.json({ error: "brandId or candidates[] required — a review request goes to people you actually served" }, { status: 400 });
  }

  const cfg = (body.config && typeof body.config === "object" ? body.config : {}) as Partial<RequestConfig>;
  const asked = (body.askedDaysAgo && typeof body.askedDaysAgo === "object" ? body.askedDaysAgo : {}) as Record<string, number>;

  const result = planCampaign({
    platformId, identifier, pastedUrl, channel,
    brandName: str("brandName") || "your business",
    candidates,
    config: cfg,
    askedDaysAgo: asked,
    existingReviews: typeof body.existingReviews === "number" ? body.existingReviews : 0,
    senderName: str("senderName") || undefined,
    whatTheyBought: str("whatTheyBought") || undefined,
    customBody: str("customBody") || undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error, hint: result.hint }, { status: 400 });
  return NextResponse.json(result.campaign);
}

export async function GET() {
  return NextResponse.json({
    engine: "Review Request Engine — more real reviews, from people you really served",
    doctrine: NO_GATING_DOCTRINE,
    pacing: PACING_IS_A_CONVENTION,
    notBuilt:
      "Supplied, purchased or generated reviews are not available on this platform at any price. They are a banned practice under the UK DMCC Act 2024 (CMA-enforceable, to 10% of global turnover) and the US FTC's fake-review rule; the enforcement — review-stripping, a public manipulation notice, profile suspension — lands on YOUR page, not ours; and this platform's own fakeReviewRisk() would flag them as manipulated.",
    askable: askablePlatforms().map((p) => p.id),
    platforms: REVIEW_PLATFORMS.map((p) => ({
      id: p.id, label: p.label, ask: p.ask, identifier: p.identifier,
      identifierHint: p.identifierHint, buildsLink: Boolean(p.buildLink),
      rules: p.rules, discoveryEffect: p.discoveryEffect,
    })),
  });
}
