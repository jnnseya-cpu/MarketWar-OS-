import { NextRequest, NextResponse } from "next/server";
import {
  buildReport,
  exportSpec,
  demoReport,
  REPORT_SECTIONS,
  exportFormats,
  exportFormatNotes,
  type ReportInput,
  type Report,
  type ExportFormat,
} from "@/backend/reporting";

// White-label Reporting Centre API (YepAPI §12).
// POST { action: "build", input }
// POST { action: "export", report, format }
// GET → doctrine + report sections + demo report
//
// Doctrine: every score/summary is an ESTIMATE; no fabricated metrics.
// Premium exports consume ACUs (qualitative). Provider cost/secrets are never exposed.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "build") {
    const input = body.input as ReportInput | undefined;
    if (!input || typeof input.business !== "string" || !input.business.trim()) {
      return NextResponse.json({ error: "Missing required field: input.business" }, { status: 400 });
    }
    return NextResponse.json(buildReport(input));
  }

  if (action === "export") {
    const report = body.report as Report | undefined;
    const format = body.format;
    if (!report || typeof report.business !== "string" || !Array.isArray(report.sections)) {
      return NextResponse.json({ error: "Missing or invalid required field: report" }, { status: 400 });
    }
    if (typeof format !== "string" || !(exportFormats as readonly string[]).includes(format)) {
      return NextResponse.json({ error: `Missing or invalid required field: format (one of ${exportFormats.join(", ")})` }, { status: 400 });
    }
    return NextResponse.json(exportSpec(report, format as ExportFormat));
  }

  return NextResponse.json({ error: "Unknown action — use build or export" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "White-label Reporting Centre (YepAPI §12)",
    doctrine:
      "Every score and summary is an ESTIMATE — the engine never fabricates metrics, testimonials or reviews. White-label branding is respected verbatim. Premium exports consume ACUs (qualitative only); provider cost and secrets are never exposed.",
    reportSections: REPORT_SECTIONS,
    exportFormats,
    exportFormatNotes,
    actions: ["build", "export"],
    demo: demoReport(),
  });
}
