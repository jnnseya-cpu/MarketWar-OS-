import { NextRequest, NextResponse } from "next/server";
import {
  classifyEmail, buildContactRecord, verifyEmail, assessCompliance, outreachGate, demoHarvest,
  GENERIC_MAILBOXES, CANSPAM_REQUIREMENTS,
  type ContactRecord, type VerifyContext, type CampaignContext,
} from "@/backend/lead-harvest";

// Lead Harvest API — compliant B2B contact intelligence (deterministic).
// Compliance-first: only lawful public contacts; no send without passing the gate.
// POST { action: "classify", email }
// POST { action: "verify", email, context? }               → 12-check verification
// POST { action: "compliance", record, consentOnFile?, liaCompleted?, doNotContact? }
// POST { action: "gate", record, consentOnFile?, liaCompleted?, campaign{…} }  → 12-check send gate
// GET  → doctrine, generic mailbox list, CAN-SPAM requirements, demo harvest run

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "verify";

  if (action === "classify") {
    if (typeof body.email !== "string") return NextResponse.json({ error: "classify requires email" }, { status: 400 });
    return NextResponse.json(classifyEmail(body.email));
  }

  if (action === "verify") {
    if (typeof body.email !== "string") return NextResponse.json({ error: "verify requires email" }, { status: 400 });
    const c = (body.context as { suppressed?: string[]; blacklistedDomains?: string[]; complained?: string[]; seenEmails?: string[] }) ?? {};
    const ctx: VerifyContext = {
      suppressed: new Set(c.suppressed ?? []),
      blacklistedDomains: new Set(c.blacklistedDomains ?? []),
      complained: new Set(c.complained ?? []),
      seenEmails: new Set(c.seenEmails ?? []),
    };
    return NextResponse.json(verifyEmail(body.email, ctx));
  }

  if (action === "compliance" || action === "gate") {
    const rec = body.record as (Partial<ContactRecord> & { email?: string; sourceUrl?: string }) | undefined;
    if (!rec || !rec.email) return NextResponse.json({ error: `${action} requires record.email` }, { status: 400 });
    const record = buildContactRecord({ ...rec, email: rec.email, sourceUrl: rec.sourceUrl ?? "" });
    const compliance = assessCompliance({
      record,
      consentOnFile: Boolean(body.consentOnFile),
      liaCompleted: Boolean(body.liaCompleted),
      doNotContact: Boolean(body.doNotContact),
    });
    if (action === "compliance") return NextResponse.json(compliance);
    const gate = outreachGate(record, compliance, (body.campaign as CampaignContext) ?? {});
    return NextResponse.json({ record, compliance, gate });
  }

  return NextResponse.json({ error: "Unknown action — use classify, verify, compliance or gate" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Lead Harvest — compliant B2B contact intelligence",
    doctrine: "Only lawful, public business contacts. Every record carries its source + lawful-basis status; every send passes a 12-check gate. Personal (named) mailboxes are personal data — consent or a passed LIA in UK/EU. Promise = maximum inbox placement, never '0 spam'.",
    genericMailboxes: GENERIC_MAILBOXES,
    canSpamRequirements: CANSPAM_REQUIREMENTS,
    demo: demoHarvest(),
  });
}
