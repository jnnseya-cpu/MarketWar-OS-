import { NextRequest, NextResponse } from "next/server";
import { TEMPLATES, TRIGGERS, ACTIONS, validateWorkflow, simulateWorkflow, type Workflow } from "@/backend/automation";

// No-Code Revenue Automation Builder API (Brevo pack Module 7).
// GET → template library + trigger/action vocabulary.
// POST { action: "validate", workflow }  → frequency/consent validation.
// POST { action: "simulate", workflow, consented? } → dry-run timeline.
// POST { action: "template", id }         → a concrete pre-built workflow.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "template";

  if (action === "template") {
    const wf = TEMPLATES.find((t) => t.id === body.id) ?? TEMPLATES[0];
    return NextResponse.json({ workflow: wf, validation: validateWorkflow(wf) });
  }
  const workflow = (body.workflow as Workflow) || TEMPLATES[0];
  if (action === "validate") return NextResponse.json(validateWorkflow(workflow));
  if (action === "simulate") return NextResponse.json(simulateWorkflow(workflow, { consented: body.consented !== false }));

  return NextResponse.json({ error: "Unknown action — use template, validate or simulate" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "No-Code Revenue Automation Builder (trigger → condition → action → delay → branch)",
    triggers: TRIGGERS,
    actions: ACTIONS,
    templates: TEMPLATES.map((t) => ({ id: t.id, name: t.name, trigger: t.trigger, goal: t.goal })),
    doctrine: "Marketing steps are consent-gated + frequency-capped; opt-out and conversion end the journey. Transactional messages are exempt. The builder cannot ship a workflow that would spam.",
  });
}
