import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { listRuns } from "@/backend/ai-visibility";
import { getIdentity, saveIdentity, brandFidelity, checkConsistency, signatureHtml } from "@/backend/brand-identity";
import { identityCompleteness } from "@/shared/brand-identity";
import { extractLogoPalette } from "@/backend/logo-palette";

// The brand's identity record — read, correct, and the two checks that make it
// worth keeping.
//
// GET  ?brandId=…              → the record, its completeness, and the fidelity score
// PUT  { brandId, patch }      → correct a value by hand (outranks anything generated)
// POST { brandId, action }     → "palette" re-reads the logo; "consistency" checks text
//
// Fidelity is the part no competitor can compute: it needs BOTH what the brand
// says about itself and what the assistants actually said about it, and this
// platform is the only place holding both.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const identity = await getIdentity(brandId);
  const runs = await listRuns(brandId, 1).catch(() => []);
  const fidelity = brandFidelity(identity, runs[0] ?? null);

  return NextResponse.json({
    identity,
    completeness: identityCompleteness(identity),
    fidelity,
    note: identity
      ? "This is what the rest of the platform reads when it writes for you. A value you set by hand outranks one a model proposed and will not be overwritten by rebuilding the kit."
      : "No identity is stored yet. Build the Brand Launch Kit — the structured parts of those documents become this record, and every other module then writes from it.",
  });
}

export async function PUT(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "brand-identity"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // Anything a person types here is `supplied` — the top rank — so a later kit
  // rebuild cannot quietly replace a colour they went and corrected.
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => { patch[key] = { value, source: "supplied", confirmedAt: now }; };

  if (Array.isArray(body.colours)) set("colours", (body.colours as unknown[]).map(s).filter(Boolean));
  if (typeof body.accent === "string" && body.accent.trim()) set("accent", s(body.accent));
  if (typeof body.tagline === "string") set("tagline", s(body.tagline));
  if (typeof body.positioning === "string") set("positioning", s(body.positioning));
  if (Array.isArray(body.toneWords)) set("toneWords", (body.toneWords as unknown[]).map(s).filter(Boolean));
  if (Array.isArray(body.avoidWords)) set("avoidWords", (body.avoidWords as unknown[]).map(s).filter(Boolean));
  if (body.fonts && typeof body.fonts === "object") {
    const f = body.fonts as { heading?: unknown; body?: unknown };
    set("fonts", { heading: s(f.heading), body: s(f.body) });
  }
  if (typeof body.emailSignatureHtml === "string") set("emailSignatureHtml", s(body.emailSignatureHtml));

  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const identity = await saveIdentity(brandId, patch);
  return NextResponse.json({
    identity,
    completeness: identityCompleteness(identity),
    note: "Saved as confirmed. Rebuilding the Launch Kit will not overwrite these — a value you set by hand outranks one a model proposed.",
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "brand-identity-act"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = s(body.brandId);
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const action = s(body.action);

  // Re-read the logo. Free: our own CPU, no provider call, so it is not metered.
  if (action === "palette") {
    const result = await extractLogoPalette(s(body.logoUrl));
    if (result.ok) {
      await saveIdentity(brandId, {
        colours: { value: result.colours.map((c) => c.hex), source: "measured" },
        ...(result.accent ? { accent: { value: result.accent, source: "measured" as const } } : {}),
      }).catch(() => null);
    }
    return NextResponse.json({ palette: result, note: result.note });
  }

  // Check a produced artefact against the stored identity. Deterministic and
  // free, so it can run on everything the OS makes without a bill.
  if (action === "consistency") {
    const identity = await getIdentity(brandId);
    const result = checkConsistency(s(body.content), identity, { expectTagline: Boolean(body.expectTagline) });
    return NextResponse.json(result);
  }

  // Build the signature as real, sendable HTML and store it on the identity, so
  // the mail engine can use it instead of the customer rebuilding a description
  // of one by hand.
  if (action === "signature") {
    const identity = await getIdentity(brandId);
    const html = signatureHtml({
      name: s(body.name), personName: s(body.personName), role: s(body.role),
      email: s(body.email), phone: s(body.phone), website: s(body.website),
      logoUrl: s(body.logoUrl),
    }, identity);
    const saved = await saveIdentity(brandId, { emailSignatureHtml: { value: html, source: "supplied", confirmedAt: new Date().toISOString() } }).catch(() => null);
    return NextResponse.json({
      html,
      identity: saved,
      note: "Built and saved. Table-based with inline styles, which is what survives Outlook and Gmail — a flexbox signature previews correctly and collapses in the inbox.",
    });
  }

  return NextResponse.json({ error: `Unknown action "${action}". Use "palette", "signature" or "consistency".` }, { status: 400 });
}
