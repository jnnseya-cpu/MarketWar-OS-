import { NextRequest, NextResponse } from "next/server";
import { cronAuthorised } from "@/backend/guard";
import { submitUrls, indexNowKey, KEY_PATH } from "@/backend/indexnow";
import { listPosts } from "@/backend/blog-store";
import { siteOrigin } from "@/shared/site";

// ANNOUNCE WHAT CHANGED, so a new article is crawled in hours rather than weeks.
//
// Scheduler-authorised: it speaks to an external service on this site's behalf,
// and an anonymous caller must not be able to spend that quota or trip the
// endpoint's rate limit for everyone.
//
// ONLY WHAT IS ACTUALLY PUBLISHED. `listPosts()` returns published articles only,
// so a draft — including one the SEO gate has just held back — is never announced.
// Announcing a URL that 404s is how a host earns a reputation for wasting crawl
// budget, which is the opposite of the point.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = cronAuthorised(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 });

  if (!indexNowKey()) {
    return NextResponse.json({
      ok: false, submitted: 0,
      note: `No INDEXNOW_KEY is set, so nothing is announced. Generate any 8-128 character key, set it, and this deployment serves it at ${KEY_PATH} as the ownership proof.`,
    }, { status: 503 });
  }

  const origin = siteOrigin().replace(/\/$/, "");
  const posts = await listPosts().catch(() => []);
  const urls = [
    origin,
    `${origin}/blog`,
    ...posts.map((p) => `${origin}/blog/${p.slug}`),
  ];

  const result = await submitUrls(urls, { origin });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

// Vercel Cron issues GET. Same authorisation.
export async function GET(req: NextRequest) {
  return POST(req);
}
