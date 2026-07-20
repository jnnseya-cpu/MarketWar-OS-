import { NextRequest, NextResponse } from "next/server";
import {
  keywordResearch,
  serpTracker,
  backlinkProfile,
  onPageAudit,
  demoSeo,
  type KeywordResearchOpts,
} from "@/backend/seo";

// Classic-SEO intelligence API (keyword research, SERP tracking, backlinks,
// on-page audit). All numbers are deterministic ESTIMATES — never live Google
// data — and no provider cost or secret is ever exposed.
//
// POST { action: "keywords",  seedKeyword, opts? } → keyword research buckets
// POST { action: "serp",      keyword, domain }    → estimated SERP position
// POST { action: "backlinks", domain }             → estimated backlink profile
// POST { action: "audit",     url }                → on-page technical audit
// GET                                              → doctrine + full demo output

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;

  if (action === "keywords") {
    if (typeof body.seedKeyword !== "string" || body.seedKeyword.trim() === "") {
      return NextResponse.json({ error: "keywords requires a non-empty seedKeyword string" }, { status: 400 });
    }
    const opts =
      typeof body.opts === "object" && body.opts !== null ? (body.opts as KeywordResearchOpts) : undefined;
    return NextResponse.json(keywordResearch(body.seedKeyword as string, opts));
  }

  if (action === "serp") {
    if (typeof body.keyword !== "string" || body.keyword.trim() === "") {
      return NextResponse.json({ error: "serp requires a non-empty keyword string" }, { status: 400 });
    }
    if (typeof body.domain !== "string" || body.domain.trim() === "") {
      return NextResponse.json({ error: "serp requires a non-empty domain string" }, { status: 400 });
    }
    return NextResponse.json(serpTracker(body.keyword as string, body.domain as string));
  }

  if (action === "backlinks") {
    if (typeof body.domain !== "string" || body.domain.trim() === "") {
      return NextResponse.json({ error: "backlinks requires a non-empty domain string" }, { status: 400 });
    }
    return NextResponse.json(backlinkProfile(body.domain as string));
  }

  if (action === "audit") {
    if (typeof body.url !== "string" || body.url.trim() === "") {
      return NextResponse.json({ error: "audit requires a non-empty url string" }, { status: 400 });
    }
    return NextResponse.json(onPageAudit(body.url as string));
  }

  return NextResponse.json(
    { error: "Unknown action — use keywords, serp, backlinks or audit" },
    { status: 400 }
  );
}

export async function GET() {
  return NextResponse.json({
    engine: "Classic-SEO Intelligence (keyword research · SERP · backlinks · on-page audit)",
    doctrine:
      "Every volume, difficulty, authority and ranking number is a deterministic ESTIMATE — not live Google data. We label all projections as estimates, never fabricate rankings, metrics or testimonials, and defer AI-visibility/GEO to the separate GEO engine.",
    demo: demoSeo(),
  });
}
