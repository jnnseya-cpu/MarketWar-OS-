import { NextRequest, NextResponse } from "next/server";
import { getPage } from "@/backend/landing-store";
import { saveContacts } from "@/backend/contacts";
import { rateLimit, clientKey } from "@/backend/guard";

// PUBLIC lead capture — a real visitor submits a hosted landing page's form. No
// auth (it's a public page), but the target brand+page must EXIST (so a caller
// can't stuff arbitrary brands) and it's rate-limited. The lead lands in that
// brand's Customer Vault as a consented contact, ready to score/segment/message.
//
// POST { brandId, slug, fields: { name?, email?, phone?, company?, ... } }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "landing-lead"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many submissions — try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid submission" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const fields = (body.fields && typeof body.fields === "object") ? (body.fields as Record<string, unknown>) : {};
  if (!brandId || !slug) return NextResponse.json({ error: "Missing page reference" }, { status: 400 });

  // The page must exist and be live — prevents writing leads to arbitrary brands.
  const page = await getPage(brandId, slug);
  if (!page || !page.live) return NextResponse.json({ error: "This page is not accepting submissions." }, { status: 404 });

  const s = (k: string) => {
    for (const key of Object.keys(fields)) {
      if (key.toLowerCase().includes(k)) { const v = fields[key]; if (typeof v === "string" && v.trim()) return v.trim(); }
    }
    return undefined;
  };
  const email = s("email");
  const phone = s("phone") || s("tel") || s("mobile") || s("whatsapp");
  const name = s("name") || s("full");
  if (!email && !phone) return NextResponse.json({ error: "Please provide an email or phone." }, { status: 400 });

  // A landing-page submission is a real inbound lead → consented for the follow-up
  // the visitor asked for. Source ties it back to the page for attribution.
  const note = Object.entries(fields).map(([k, v]) => `${k}: ${String(v)}`).join(" | ").slice(0, 500);
  const nowISO = typeof body.nowISO === "string" ? body.nowISO : new Date().toISOString();
  await saveContacts(brandId, [{
    email, phone, name, company: s("company"),
    consent: true, source: `landing:${slug}`,
  }], nowISO);

  return NextResponse.json({ ok: true, message: page.formConfig.submitAction === "book_call" ? "Thanks — we'll be in touch to book your slot." : "Thanks — we've got your details and will be in touch shortly.", note });
}
