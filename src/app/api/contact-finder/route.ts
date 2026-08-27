import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import {
  createJob, getJob, chargeRow, setRowState, progress, unfinishedRows, resultRowsFrom,
} from "@/backend/contact-finder-store";
import { screenIntake, PROHIBITED_CATEGORIES } from "@/shared/contact-hunter";
import {
  detectInputType, mapColumns, detectHeaderRow, isSkippableRow,
  dedupe, dedupeKeys, mergeValue, resolveIdentity, estimateJob,
  buildWorkbook, workbookToSpreadsheetML, workbookToCsv, demoContactFinder,
  TARGET_FIELDS, MW_COLUMNS, ROW_STATES, NOT_FOUND_REASONS, BILLABLE_OPERATIONS,
  CANDIDATE_SEPARATION,
  type DedupeInput, type Candidate, type ResultRow, type BillableOperation,
} from "@/shared/contact-finder";

// MarketWar Contact Finder — upload a list, get it filled in.
//
// POST { action: "detect",   values[] }                    → what each value is
// POST { action: "map",      headers[] }                   → column mapping + warnings
// POST { action: "inspect",  rows[][] }                    → header row, skippable rows, mapping
// POST { action: "dedupe",   records[] }                   → unique records + what merged where
// POST { action: "resolve",  candidates[], minimumConfidence? } → the person, or a refusal to choose
// POST { action: "merge",    a, b }                        → which value survives, and why
// POST { action: "estimate", rows, fields[] }              → the ACU ceiling, before the button
// POST { action: "workbook", rows[], originalColumns[] }   → the six sheets (+ ?format=xml)
// -- brand-scoped, stateful, resumable --
// POST { action: "job",      brandId, id, rows[], ... }    → create or resume; idempotent by id
// POST { action: "charge",   brandId, jobId, originalRow, operation, outcome }
// POST { action: "state",    brandId, jobId, originalRow, state }
// POST { action: "progress", brandId, jobId }
// GET  → doctrine, fields, states, charging rules, demo
//
// THE PROHIBITED-CATEGORY SCREEN RUNS FIRST, on every action, exactly as it does
// on /api/contact-hunter — because this is the door people paste whole
// spreadsheets through, and a spreadsheet is the likeliest place a home address
// or a date of birth arrives without anybody intending it.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const intake = screenIntake(body);
  if (!intake.ok) {
    return NextResponse.json({
      error: `Refused: ${intake.refusals.map((r) => r.field).join(", ")}. ${intake.refusals[0].why}`,
      refusals: intake.refusals, neverCollected: PROHIBITED_CATEGORIES,
    }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const at = new Date().toISOString();

  if (action === "detect") {
    const values = Array.isArray(body.values) ? body.values.map((v) => String(v ?? "")) : null;
    if (!values) return NextResponse.json({ error: "detect requires values[]" }, { status: 400 });
    return NextResponse.json({ results: values.map((value) => ({ value, ...detectInputType(value) })) });
  }

  if (action === "map") {
    const headers = Array.isArray(body.headers) ? body.headers.map((h) => String(h ?? "")) : null;
    if (!headers) return NextResponse.json({ error: "map requires headers[]" }, { status: 400 });
    return NextResponse.json({ ...mapColumns(headers), targetFields: TARGET_FIELDS });
  }

  if (action === "inspect") {
    const rows = Array.isArray(body.rows) ? (body.rows as unknown[]).map((r) => Array.isArray(r) ? r.map((c) => String(c ?? "")) : []) : null;
    if (!rows) return NextResponse.json({ error: "inspect requires rows[][]" }, { status: 400 });
    const header = detectHeaderRow(rows);
    const headers = header.headerRow >= 0 ? rows[header.headerRow] : [];
    const skipped = rows.map((cells, i) => ({ row: i + 1, ...isSkippableRow(cells) })).filter((r) => r.skip);
    return NextResponse.json({
      header, headers,
      mapping: headers.length ? mapColumns(headers) : null,
      skipped,
      totalRows: rows.length,
      dataRows: Math.max(0, rows.length - (header.headerRow + 1) - skipped.filter((s) => s.row > header.headerRow + 1).length),
      note: "Original columns are never overwritten. Everything MarketWar adds is prefixed MW_.",
    });
  }

  if (action === "dedupe") {
    const records = Array.isArray(body.records) ? (body.records as DedupeInput[]) : null;
    if (!records) return NextResponse.json({ error: "dedupe requires records[]" }, { status: 400 });
    const r = dedupe(records);
    return NextResponse.json({
      ...r,
      keysFor: records.slice(0, 5).map((rec) => ({ originalRow: rec.originalRow, keys: dedupeKeys(rec) })),
      note: "There is deliberately no key on a name alone. Two James Wilsons are two people, and merging them because their names match attaches one person's verified address to another person's job.",
    });
  }

  if (action === "resolve") {
    const candidates = Array.isArray(body.candidates) ? (body.candidates as Candidate[]) : null;
    if (!candidates) return NextResponse.json({ error: "resolve requires candidates[]" }, { status: 400 });
    return NextResponse.json({
      ...resolveIdentity({
        candidates,
        minimumConfidence: typeof body.minimumConfidence === "number" ? body.minimumConfidence : undefined,
        conflicting: body.conflicting === true,
      }),
      separationRequired: CANDIDATE_SEPARATION,
    });
  }

  if (action === "merge") {
    return NextResponse.json(mergeValue((body.a as never) ?? null, (body.b as never) ?? null));
  }

  if (action === "estimate") {
    const rows = typeof body.rows === "number" ? body.rows : NaN;
    const fields = Array.isArray(body.fields) ? (body.fields as BillableOperation[]).filter((f) => f in BILLABLE_OPERATIONS) : [];
    if (!Number.isFinite(rows) || rows < 0) return NextResponse.json({ error: "estimate requires a row count" }, { status: 400 });
    return NextResponse.json(estimateJob({ rows, fields }));
  }

  if (action === "workbook") {
    const rows = Array.isArray(body.rows) ? (body.rows as ResultRow[]) : null;
    const originalColumns = Array.isArray(body.originalColumns) ? body.originalColumns.map((c) => String(c ?? "")) : [];
    if (!rows) return NextResponse.json({ error: "workbook requires rows[]" }, { status: 400 });
    const wb = buildWorkbook({
      rows, originalColumns,
      duplicatesRemoved: typeof body.duplicatesRemoved === "number" ? body.duplicatesRemoved : 0,
      acusConsumed: typeof body.acusConsumed === "number" ? body.acusConsumed : 0,
      processingMs: typeof body.processingMs === "number" ? body.processingMs : 0,
      sourceAudit: (body.sourceAudit as never) ?? [],
    });
    if (body.format === "xml") {
      return new NextResponse(workbookToSpreadsheetML(wb), {
        headers: {
          "Content-Type": "application/vnd.ms-excel",
          "Content-Disposition": 'attachment; filename="marketwar-contacts.xls"',
        },
      });
    }
    if (body.format === "csv") {
      const csvs = workbookToCsv(wb);
      const one = typeof body.sheet === "string" ? csvs.find((c) => c.name === body.sheet) : null;
      if (one) {
        return new NextResponse(one.csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${one.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv"`,
          },
        });
      }
      return NextResponse.json({ sheets: csvs });
    }
    return NextResponse.json(wb);
  }

  // ── Brand-scoped and stateful from here. ─────────────────────────────────
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required for this action" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "you";

  if (action === "job") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const rows = Array.isArray(body.rows) ? body.rows.map((r) => Number(r)).filter((n) => Number.isFinite(n)) : null;
    if (!id) return NextResponse.json({ error: "job requires an id — it is what makes a retried upload idempotent rather than a second bill" }, { status: 400 });
    if (!rows) return NextResponse.json({ error: "job requires rows[] of original row numbers" }, { status: 400 });
    const job = await createJob({
      brandId, id, rows,
      originalColumns: Array.isArray(body.originalColumns) ? body.originalColumns.map((c) => String(c ?? "")) : [],
      duplicatesRemoved: typeof body.duplicatesRemoved === "number" ? body.duplicatesRemoved : 0,
      maxAcus: typeof body.maxAcus === "number" ? body.maxAcus : null,
      at, by,
    });
    return NextResponse.json({
      job, progress: progress(job), remaining: unfinishedRows(job).length,
      resumed: job.createdAt !== at,
      note: job.createdAt !== at
        ? "This job already existed, so it was resumed rather than started again. Finished rows are not redone and are never recharged."
        : "Created.",
    });
  }

  if (action === "charge") {
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const originalRow = typeof body.originalRow === "number" ? body.originalRow : NaN;
    const operation = String(body.operation ?? "") as BillableOperation;
    if (!jobId || !Number.isFinite(originalRow)) return NextResponse.json({ error: "charge requires jobId and originalRow" }, { status: 400 });
    if (!(operation in BILLABLE_OPERATIONS)) return NextResponse.json({ error: `Unknown operation. One of: ${Object.keys(BILLABLE_OPERATIONS).join(", ")}` }, { status: 400 });
    const r = await chargeRow({
      brandId, jobId, originalRow, operation,
      outcome: (body.outcome as never) ?? "completed",
      isReverification: body.isReverification === true,
    });
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 404 });
  }

  if (action === "state") {
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const originalRow = typeof body.originalRow === "number" ? body.originalRow : NaN;
    const state = String(body.state ?? "");
    if (!jobId || !Number.isFinite(originalRow)) return NextResponse.json({ error: "state requires jobId and originalRow" }, { status: 400 });
    if (!ROW_STATES.includes(state as never)) return NextResponse.json({ error: `Unknown state. One of: ${ROW_STATES.join(", ")}` }, { status: 400 });
    const r = await setRowState({
      brandId, jobId, originalRow, state: state as never,
      failureReason: typeof body.failureReason === "string" ? body.failureReason : undefined,
    });
    // 409, not 500: refusing to re-run a finished row is the engine working.
    return r.ok ? NextResponse.json({ progress: progress(r.job) }) : NextResponse.json({ error: r.error }, { status: 409 });
  }

  if (action === "progress") {
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const job = await getJob(brandId, jobId);
    if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });
    const originals = (body.originals as Record<number, Record<string, string>>) ?? {};
    return NextResponse.json({
      progress: progress(job),
      remaining: unfinishedRows(job).map((r) => r.originalRow),
      rows: resultRowsFrom(job, originals),
    });
  }

  return NextResponse.json({ error: "Unknown action — use detect, map, inspect, dedupe, resolve, merge, estimate, workbook, job, charge, state or progress" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "MarketWar Contact Finder — upload a list, get it filled in",
    doctrine:
      "Upload names. MarketWar identifies the right businesses and people, finds permitted professional email and phone routes, verifies every result, fills the spreadsheet and turns approved records into revenue-ready leads. It refuses to choose between two people with the same name, it never overwrites a column the user supplied, it charges for what completed rather than for what was attempted, and a resumed job never charges twice.",
    reuses: {
      "contact-hunter": "Provenance, employment confidence, suppression, readiness and the prohibited categories. Every rule about whether a value may be held, shown or sent.",
      "lead-harvest": "The twelve-check email verification and the UK/EU/US lawful-basis decision, through contact-hunter.",
    },
    inputTypes: ["PERSON", "COMPANY", "DOMAIN", "EMAIL", "PHONE", "ADDRESS", "PROFESSIONAL_PROFILE", "UNKNOWN"],
    targetFields: TARGET_FIELDS,
    appendedColumns: MW_COLUMNS,
    rowStates: ROW_STATES,
    notFoundReasons: NOT_FOUND_REASONS,
    identityStates: ["EXACT_MATCH", "HIGH_CONFIDENCE_MATCH", "MULTIPLE_CANDIDATES", "INSUFFICIENT_INFORMATION", "NO_MATCH", "CONFLICTING_INFORMATION"],
    refusalToChoose: `Two candidates within ${CANDIDATE_SEPARATION} of each other are not separable. The engine returns both and chooses neither — there is no threshold at which it decides anyway.`,
    charging: {
      operations: BILLABLE_OPERATIONS,
      reverification: "25% of the original charge — the expensive part, finding the person and the route, was done the first time.",
      neverCharged: [
        "Duplicate rows removed before discovery.",
        "Cached tenant records still inside their verification window.",
        "Failed technical requests.",
        "Provider timeouts.",
        "Anything repeated because of a failure on our side.",
        "Any row and operation already charged in this job — a resume is not a rerun.",
      ],
      ledger: "Written BEFORE the operation runs, not after. A crash between the work and the write would otherwise make a resume repeat the work AND charge for it; writing first means a crash costs one operation the customer did not receive, which the refund path handles. Given a choice between double-charging silently and over-charging visibly, take the visible one.",
    },
    workbook: {
      sheets: ["Completed Results", "Ready for Outreach", "Manual Review", "Not Found", "Job Summary", "Source Audit"],
      readyIsNarrower: "\"Ready for Outreach\" is narrower than \"Completed\" on purpose: completed means we finished looking, eligible means it may actually be contacted.",
      formats: {
        json: "The six sheets as data. The default.",
        csv: 'format:"csv" returns one CSV per sheet, or one sheet as a download with sheet:"Ready for Outreach". RFC 4180 quoting, and a leading apostrophe on any cell starting with = + - or @ so a spreadsheet cannot execute a value that came off somebody else\'s website.',
        xml: 'format:"xml" returns SpreadsheetML — Microsoft\'s published multi-sheet XML format, six named tabs, no new dependency.',
      },
      verified: "The SpreadsheetML output is well-formed XML with six named worksheets and every cell escaped, checked by a real XML parser in the test suite. It has NOT been opened in a spreadsheet application: the only one available in the build environment is a Writer-only LibreOffice with no Calc filters, which refuses a plain CSV as readily. Correct against the published schema, unproven against a real application — take the CSV if you want certainty rather than tabs.",
      whyNotXlsx: "A true .xlsx is a ZIP of XML parts and needs a zip library this repository does not have. Adding a dependency to a platform that already ships is not a decision to make quietly for a file format.",
    },
    neverCollected: PROHIBITED_CATEGORIES,
    actions: ["detect", "map", "inspect", "dedupe", "resolve", "merge", "estimate", "workbook", "job", "charge", "state", "progress"],
    demo: demoContactFinder(),
  });
}
