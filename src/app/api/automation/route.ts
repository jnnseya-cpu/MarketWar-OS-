import { NextRequest, NextResponse } from "next/server";
import { compileJourney } from "@/backend/journey-compiler";
import { TEMPLATES, TRIGGERS, ACTIONS, validateWorkflow, simulateWorkflow, type Workflow, type TriggerId } from "@/backend/automation";

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
  // Turn an agent's written plan into a runnable journey, validated with the
  // same rules the Lab enforces — so "Activate" is a button, not an afternoon.
  if (action === "compile") {
    const text = typeof body.text === "string" ? body.text : "";
    const compiled = compileJourney({
      text,
      name: typeof body.name === "string" ? body.name : undefined,
      trigger: typeof body.trigger === "string" ? (body.trigger as TriggerId) : undefined,
    });
    if (!compiled.ok || !compiled.workflow) {
      return NextResponse.json({ ok: false, error: compiled.error, unparsed: compiled.unparsed }, { status: 400 });
    }
    const validation = validateWorkflow(compiled.workflow);
    return NextResponse.json({
      ok: true,
      workflow: compiled.workflow,
      steps: compiled.steps,
      unparsed: compiled.unparsed,
      assumptions: compiled.assumptions,
      validation,
      timeline: simulateWorkflow(compiled.workflow, { consented: true }).timeline,
      note: validation.valid
        ? "Compiled and within the frequency cap. Review the timeline, then activate."
        : "Compiled, but it breaches the frequency cap — space the messages out before activating.",
    });
  }

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
