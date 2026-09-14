import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/backend/guard";

// IS THE DATABASE SLOW, OR REFUSING US?
//
// Two questions that used to have one answer — "something went wrong" — and have
// completely different remedies.
//
// SIGNED IN, NOT PUBLIC, AND THE LANE AUDIT IS WHY THIS IS SPELLED OUT. The
// first version of this route was anonymous on the reasoning that it carries no
// customer data and no identifiers, which is true. It also broadcasts that this
// deployment is out of quota, or being refused on credentials — operational
// state that is of no use to a visitor and of some use to somebody probing. This
// platform has already shipped one health endpoint that answered strangers with
// more than it should have (`/api/health/stripe`, which handed over the
// account's other webhook endpoints), and the posture that came out of that is
// the one applied here rather than relearned.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { storeHealth } = await import("@/backend/store-health");
  return NextResponse.json({
    service: "Firestore behaviour, as this instance has experienced it",
    ...storeHealth(),
  });
}
