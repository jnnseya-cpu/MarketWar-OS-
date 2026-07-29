import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction, creditAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { writeCitationPage, type ProofAnswer } from "@/backend/citation-page";
import { savePost } from "@/backend/blog-store";
import { slugify, type BlogPost } from "@/shared/blog";

// Write the page a brief describes.
//
// POST { brandId, question, angle, outline[], proof[{question,answer}], category? }
//   → a DRAFT, never published, with every claim it makes checked against the
//     facts the customer supplied.
//
// Saved as a draft post for the brand so it is editable and publishable through
// the machinery that already exists, rather than a second parallel one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const readMinutes = (c: string) => Math.max(1, Math.round(c.split(/\s+/).length / 220));

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "citation-page"), 10, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const brand = s(body.business);
  const question = s(body.question);
  const angle = s(body.angle);
  if (!brand || !question) return NextResponse.json({ error: "business and question are required — the page is written to answer one question for one brand." }, { status: 400 });

  const outline = Array.isArray(body.outline) ? (body.outline as unknown[]).map(s).filter(Boolean).slice(0, 10) : [];
  const proof: ProofAnswer[] = Array.isArray(body.proof)
    ? (body.proof as { question?: unknown; answer?: unknown }[])
        .map((p) => ({ question: s(p?.question), answer: s(p?.answer) }))
        .filter((p) => p.question)
        .slice(0, 10)
    : [];

  const meter = await meterAction(auth, "llm", 3);
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  let draft;
  try {
    draft = await writeCitationPage({
      brand, domain: s(body.domain) || undefined, question, angle, outline, proof,
      category: s(body.category) || undefined,
    });
  } catch (e) {
    // No key, or every provider failed. Refund in full — nothing was produced.
    let refunded = 0;
    if (meter.metered && auth.uid) {
      refunded = 3 * ACTION_COST_ACU.llm;
      await creditAcus(auth.uid, refunded).catch(() => { refunded = 0; });
    }
    return NextResponse.json({
      error: `The page could not be written: ${(e as Error).message}. ${refunded ? `${refunded} ACUs refunded.` : ""}`.trim(),
    }, { status: 503 });
  }

  // Stored as a draft. Never auto-published — a page carrying an unbacked claim
  // is the worst outcome of this whole module, because the assistants would
  // learn it.
  const slug = slugify(`${brand}-${question}`).slice(0, 80);
  const now = new Date().toISOString();
  const post: BlogPost = {
    id: slug, brandId, slug,
    title: draft.title, excerpt: draft.excerpt, category: s(body.category) || "AI visibility",
    readMinutes: readMinutes(draft.content), content: draft.content,
    author: brand, status: "draft", mode: "live", views: 0,
    createdAt: now, publishedAt: null,
  };
  await savePost(post).catch(() => { /* non-fatal — the draft is still returned */ });

  return NextResponse.json({
    draft,
    post: { slug, status: "draft" },
    charged: 3 * ACTION_COST_ACU.llm,
    balanceAcu: meter.balanceAcu,
    note: `${draft.note} Saved as a draft you can edit and publish; it is not live anywhere yet.`,
  });
}
