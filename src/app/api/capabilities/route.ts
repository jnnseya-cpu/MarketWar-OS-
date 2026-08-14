import { NextResponse } from "next/server";
import { capabilityStates, capabilitySummary, CAPABILITY_DOCTRINE } from "@/backend/capabilities";

// WHAT THIS DEPLOYMENT CAN ACTUALLY DO.
//
// Deliberately public and unauthenticated: whether the platform a person is
// about to spend an evening in can perform the thing they are about to attempt
// is not a secret, and putting it behind a login puts the warning on the wrong
// side of the door.
//
// It returns no key values — only whether each is present, which is the same
// thing a customer discovers in thirty seconds by clicking.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    capabilities: capabilityStates().map(({ id, label, live, because, whenDark, stillWorks, oneAction }) => ({
      id, label, live, because, whenDark, stillWorks, oneAction,
    })),
    summary: capabilitySummary(),
    doctrine: CAPABILITY_DOCTRINE,
  });
}
