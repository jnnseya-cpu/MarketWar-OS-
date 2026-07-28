import { NextRequest, NextResponse } from "next/server";
import { saveContacts, listContacts, clearContacts, patchContact, toCustomerRecords, type Contact } from "@/backend/contacts";
import { enrichBatch, dropSharedEmails, auditStoredEmails } from "@/backend/enrich";
import { scoredCustomerList, segmentLabel } from "@/backend/segments";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Email discovery makes many external fetches; reserve the platform maximum so a
// large batch is never killed halfway with the work already paid for.
export const maxDuration = 60;

// Customer Vault contact store — real CSV/CRM import behind the vault.
// POST { brandId, business, contacts:[...] }  → import + return scored vault
// GET  ?brandId=…&business=…                  → scored vault from stored contacts
// DELETE ?brandId=…                           → clear the brand's contacts
//
// Ownership is enforced: a caller can only touch a brand they own (demo passes
// through). Consent is preserved; the segmentation engine gates marketing.

function nowISO(req: NextRequest): string {
  // Client supplies the timestamp (no Date.now in some sandboxes); fall back safe.
  const h = req.headers.get("x-now");
  return h && /^\d{4}-\d{2}-\d{2}T/.test(h) ? h : "1970-01-01T00:00:00.000Z";
}

type ScoredRow = {
  id: string; name: string; segment: string; segmentLabel: string;
  spendGbp: number; orders: number; ltvGbp: number; churnRisk: number;
  purchaseIntent: number; lastOrderDaysAgo: number | null; consent: boolean;
  // Contact/prospect fields so the vault can show reach + one-click contact.
  email: string | null; phone: string | null; company: string | null;
  trade: string | null; town: string | null; status: string | null;
  website: string | null; emailConfidence: string | null;
};

// Build the SAME VaultReport shape the Customer Vault page renders (mirrors
// /api/segments action:"customers"), but from the brand's REAL stored contacts.
// "landing:family-platter-friday" → "Landing page · family platter friday".
function sourceLabelFor(source?: string | null): string | null {
  const raw = (source || "").trim();
  if (!raw) return null;
  if (raw.startsWith("landing:")) return `Landing page · ${raw.slice(8).replace(/-/g, " ")}`;
  if (raw === "import" || raw.startsWith("import:")) return "CSV import";
  if (raw.startsWith("form:")) return `Form · ${raw.slice(5)}`;
  return raw.replace(/[:_]/g, " · ");
}

async function scoredVault(brandId: string, business: string) {
  const biz = business || "your brand";
  const contacts = await listContacts(brandId);
  const records = toCustomerRecords(contacts);
  // Empty vault → honest empty report. Never call the scorer with [] (its sample
  // fallback would fabricate 40 "Customer NNN" rows for a brand with no data).
  if (records.length === 0) {
    return {
      business: biz, live: false, contactCount: 0, totalContacts: 0, totalLtvGbp: 0,
      hot: 0, atRisk: 0, consentedShare: 0, statusCounts: {} as Record<string, number>,
      customers: [] as ScoredRow[],
      note: "No contacts yet. Import a CSV to populate and score your real vault.",
    };
  }
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const rows = scoredCustomerList(biz, records).map((c) => {
    const src = byId.get(c.id);
    return {
      id: c.id, name: c.name ?? c.id, segment: c.segment, segmentLabel: segmentLabel(c.segment),
      spendGbp: Math.round(c.totalSpendGbp ?? 0), orders: c.orderCount ?? 0, ltvGbp: c.ltvGbp,
      churnRisk: c.churnRisk, purchaseIntent: c.purchaseIntent,
      lastOrderDaysAgo: c.lastOrderDaysAgo ?? null, consent: c.consent !== false,
      email: src?.email ?? null, phone: src?.phone ?? null, company: src?.company ?? null,
      trade: src?.trade ?? null, town: src?.town ?? null, status: src?.status ?? null,
      source: src?.source ?? null,
      // A friendly label for where they came from, so a landing-page lead is
      // identifiable at a glance rather than buried in a raw tag.
      sourceLabel: sourceLabelFor(src?.source),
      website: src?.website ?? null, emailConfidence: src?.emailConfidence ?? null,
    };
  });
  const statusCounts: Record<string, number> = {};
  for (const r of rows) statusCounts[r.segmentLabel] = (statusCounts[r.segmentLabel] ?? 0) + 1;
  return {
    business: biz,
    live: rows.length > 0,
    contactCount: contacts.length,
    totalContacts: rows.length,
    totalLtvGbp: rows.reduce((s, r) => s + r.ltvGbp, 0),
    hot: rows.filter((r) => r.segment === "hot_leads" || r.purchaseIntent >= 75).length,
    atRisk: rows.filter((r) => r.churnRisk >= 60).length,
    consentedShare: rows.length ? Math.round(rows.filter((r) => r.consent).length / rows.length * 100) / 100 : 0,
    statusCounts,
    customers: rows,
    note: rows.length
      ? "Scored from YOUR imported contacts — RFM/LTV/churn/intent, live."
      : "No contacts yet. Import a CSV to populate and score your real vault.",
  };
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "contacts"), 20, 60_000, 0);
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  const business = typeof body.business === "string" ? body.business : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // ---- Audit action: remove emails that belong to somebody else ----
  // Local-only, free, and reversible by re-running discovery. It exists because
  // fixing the discovery path does nothing about rows written before the fix —
  // a vault can already carry one directory inbox spread across several firms,
  // and mailing that is how a sender reputation gets destroyed.
  // POST { action:"audit_emails", apply?: boolean }
  if (body.action === "audit_emails") {
    const stored = await listContacts(brandId);
    const { bad, checked } = auditStoredEmails(stored.map((c) => ({ id: c.id, company: c.company, name: c.name, email: c.email, website: c.website })));
    const apply = body.apply === true;
    if (apply && bad.length) {
      await Promise.all(bad.map((b) => patchContact(brandId, b.id, {
        email: "",
        emailConfidence: undefined,
        enrichNote: `Email removed on review: ${b.reason}`,
      })));
    }
    return NextResponse.json({
      action: "audit_emails",
      applied: apply,
      checked,
      badCount: bad.length,
      // Capped so a huge vault does not return a megabyte of JSON; the count is
      // the whole truth and the sample shows what kind of thing was found.
      sample: bad.slice(0, 50),
      ...(apply ? await scoredVault(brandId, business) : {}),
      note: bad.length === 0
        ? `Checked ${checked} address${checked === 1 ? "" : "es"} — every one belongs to the business it is attached to.`
        : apply
          ? `Removed ${bad.length} of ${checked} addresses that belonged to a directory or another company. Those rows are prospects again — run Find emails to try them properly.`
          : `${bad.length} of ${checked} addresses do not belong to the business they are attached to. Nothing has been changed yet.`,
    });
  }

  // ---- Enrich action: find real emails/phones for company-only prospect rows ----
  // Reads each firm's own website via live Google (Serper) and extracts a genuine
  // email — never fabricates one. Capped per call (external fetches are slow).
  if (body.action === "enrich") {
    // Rows per call. With the ownership gate most misses now cost a single
    // search instead of six page fetches against a directory site, so a bigger
    // batch fits the same wall clock — and 2,700 prospects at 25 a click was
    // 108 clicks, which is a feature nobody finishes using.
    const ENRICH_CAP = Math.min(120, Math.max(10, Number(body.limit) || 60));
    const stored = await listContacts(brandId);
    const wanted = Array.isArray(body.contactIds) ? new Set((body.contactIds as unknown[]).map(String)) : null;
    // Targets: explicitly requested rows, else every row that has a company but no
    // email yet (re-running never re-hits ones already enriched with an email).
    const targets = stored.filter((c) =>
      (wanted ? wanted.has(c.id) : !c.email) && (c.company || c.website)
    );
    if (!targets.length) {
      return NextResponse.json({ action: "enrich", enrichedCount: 0, remaining: 0, results: [], ...(await scoredVault(brandId, business)), note: "No rows to enrich — every prospect already has an email, or the rows have no company name to search." });
    }
    const batch = targets.slice(0, ENRICH_CAP);
    const raw = await enrichBatch(batch.map((c) => ({ company: c.company || c.name || "", town: c.town, area: c.area, trade: c.trade, website: c.website })), 8);

    // Addresses the vault has ALREADY attached to some other company. An address
    // that turns up again for a different firm is a directory inbox, and catching
    // it here means contamination cannot accumulate across separate runs.
    const usedByCompany = new Map<string, string>();
    for (const c of stored) {
      if (c.email) usedByCompany.set(c.email.toLowerCase(), (c.company || c.name || "").trim());
    }
    const { results, dropped: sharedDropped } = dropSharedEmails(raw, usedByCompany);
    let withEmail = 0;
    const now = nowISO(req);
    await Promise.all(batch.map(async (c, i) => {
      const r = results[i];
      if (!r) return;
      if (r.email) withEmail++;
      await patchContact(brandId, c.id, {
        email: r.email || undefined,
        phone: c.phone || r.phone || undefined,
        website: r.website || undefined,
        // Keep the company as the row identity; fill the contact person's name only
        // when the row had none, so the mailto can greet a real person.
        name: c.name || r.contactName || undefined,
        emailConfidence: r.email ? r.emailConfidence : undefined,
        status: c.status || (r.email ? "contactable" : c.status),
        enrichedAt: now,
        enrichNote: r.note,
      });
    }));
    const vault = await scoredVault(brandId, business);
    // A batch is only "not looked up" when NOTHING could be looked up. Using
    // .some() meant a single unsearchable row flipped the message for the whole
    // batch — so a customer could be told "no emails were invented" in the same
    // response that carried real emails found on real websites.
    const searched = results.filter(Boolean);
    const demoCount = searched.filter((r) => r?.mode === "demo").length;
    const allDemo = searched.length > 0 && demoCount === searched.length;

    // Where every row actually stopped. "1 email out of 2,100" is unactionable
    // on its own — an exhausted search quota, firms with no website, and sites
    // with no published address are three different problems with three
    // different fixes, and they look identical in a bare count.
    const breakdown = {
      found: searched.filter((r) => r?.stage === "found").length,
      searchUnavailable: searched.filter((r) => r?.stage === "search_unavailable").length,
      noOwnSite: searched.filter((r) => r?.stage === "no_own_site").length,
      siteNoEmail: searched.filter((r) => r?.stage === "site_no_email").length,
    };
    // The provider's own words when a KEYED deployment was refused — quota
    // exhausted reads exactly like a deleted key unless it is passed through.
    const providerError = searched.find((r) => r?.providerError)?.providerError;
    return NextResponse.json({
      action: "enrich",
      enrichedCount: batch.length,
      emailsFound: withEmail,
      remaining: Math.max(0, targets.length - batch.length),
      mode: allDemo ? "demo" : "live",
      // Per-row, so the customer can see WHICH companies could not be looked up
      // rather than inferring it from a single sentence about the batch.
      couldNotLookUp: demoCount,
      rejectedAsDirectory: sharedDropped,
      breakdown,
      providerError,
      results: batch.map((c, i) => ({ id: c.id, company: c.company || c.name, email: results[i]?.email || null, phone: results[i]?.phone || null, website: results[i]?.website || null, note: results[i]?.note || "" })),
      ...vault,
      note: allDemo
        ? (providerError
            ? `${providerError} Nothing was looked up on this run, and no emails were invented.`
            : "None of these could be looked up — live email discovery needs a search connector (SERPER_API_KEY). No emails were invented.")
        : [
            `Checked ${batch.length} compan${batch.length === 1 ? "y" : "ies"} — found ${withEmail} real email${withEmail === 1 ? "" : "s"} on their own websites.`,
            // Finding nothing is a RESULT, not a failure, and saying so stops a
            // customer concluding the feature is broken.
            withEmail === 0 && demoCount === 0 && breakdown.siteNoEmail > 0
              ? " These businesses do not publish an email address, which is common for trades — use the phone numbers instead."
              : "",
            demoCount > 0 ? ` ${demoCount} could not be looked up${providerError ? ` — ${providerError}` : " (no search connector for those)"}.` : "",
            breakdown.noOwnSite > 0 ? ` ${breakdown.noOwnSite} have no website of their own — only directory pages about them, which is normal for small trades and is a phone/WhatsApp lead, not an email one.` : "",
            breakdown.siteNoEmail > 0 ? ` ${breakdown.siteNoEmail} have a site but publish no address (contact form only).` : "",
            sharedDropped > 0 ? ` ${sharedDropped} address${sharedDropped === 1 ? "" : "es"} were rejected for belonging to a directory rather than to the business.` : "",
            targets.length > batch.length ? ` ${targets.length - batch.length} more remain — run again to continue.` : "",
          ].join(""),
    });
  }

  const contacts = Array.isArray(body.contacts) ? (body.contacts as Partial<Contact>[]) : [];
  if (!contacts.length) return NextResponse.json({ error: "No contacts to import" }, { status: 400 });
  if (contacts.length > 20000) return NextResponse.json({ error: "Import capped at 20,000 rows per upload" }, { status: 400 });

  try {
    const { imported, total } = await saveContacts(brandId, contacts, nowISO(req));
    const vault = await scoredVault(brandId, business);
    return NextResponse.json({ imported, total, ...vault });
  } catch (e) {
    // Surface the real reason instead of a bare 500 (e.g. a Firestore write
    // rejecting a value) so the client can show something actionable.
    console.error("[contacts] import failed:", (e as Error).message);
    return NextResponse.json({ error: `Import could not be saved: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const business = req.nextUrl.searchParams.get("business") || "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json(await scoredVault(brandId, business));
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  await clearContacts(brandId);
  return NextResponse.json({ ok: true, contactCount: 0 });
}
