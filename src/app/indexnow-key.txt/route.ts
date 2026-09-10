import { NextResponse } from "next/server";
import { indexNowKey } from "@/backend/indexnow";

// THE OWNERSHIP PROOF THE INDEXNOW PROTOCOL ASKS FOR.
//
// The engines fetch this file and compare its contents with the key sent in the
// submission. It confirms whoever announced the URL controls the site, so it is
// PUBLIC BY DESIGN — there is no secret here to protect, and treating it as one
// would break the only thing it is for.
//
// It serves nothing at all when no key is configured, rather than an empty file:
// an empty 200 tells an engine the proof exists and is blank, which is a
// verification failure that looks like a content bug.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = indexNowKey();
  if (!key) {
    return new NextResponse("IndexNow is not configured on this deployment.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  // The key ALONE, no trailing newline — the engines compare the body verbatim.
  return new NextResponse(key, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
