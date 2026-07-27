import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import { gatewayComplete, GatewayUnconfiguredError, gatewayLangFrom } from "@/backend/gateway";

// AI email drafting — writes the campaign copy, or a reusable template.
//
// POST { mode: "email" | "template", business?, product?, audience?, goal?,
//        offer?, segment?, tone?, notes? }
//   → { subject, body, html, mode }
//
// The draft is ALWAYS returned for the user to edit — it is never sent and never
// saved automatically. Merge tags are only emitted for template mode, where the
// send path substitutes them per contact.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Split the model's reply into a subject line and a body. Falls back to using
// the first line as the subject so a malformed reply still yields a usable draft.
function splitDraft(text: string): { subject: string; body: string } {
  const m = /^\s*subject\s*:\s*(.+)$/im.exec(text);
  if (m) {
    const subject = m[1].replace(/^["'“”]+|["'“”]+$/g, "").trim();
    const body = text.slice(text.indexOf(m[0]) + m[0].length).replace(/^\s*(body\s*:)?\s*/i, "").trim();
    if (body) return { subject, body };
  }
  const lines = text.trim().split("\n").filter(Boolean);
  return { subject: (lines[0] || "").replace(/^#+\s*/, "").slice(0, 120), body: lines.slice(1).join("\n").trim() || text.trim() };
}

const toHtml = (body: string) =>
  `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${
    body.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)).replace(/\n/g, "<br/>")
  }</div>`;

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "email-draft"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const mode = body.mode === "template" ? "template" : "email";
  const business = s(body.business);
  const goal = s(body.goal) || "get replies and bookings";
  if (!business) return NextResponse.json({ error: "Add a brand first — the draft is written from your brand details." }, { status: 400 });

  // Only real, supplied facts go in. Nothing is invented about the business.
  const facts = [
    `Business: ${business}`,
    s(body.product) && `What they sell: ${s(body.product)}`,
    s(body.audience) && `Audience: ${s(body.audience)}`,
    s(body.segment) && `Segment being emailed: ${s(body.segment)}`,
    s(body.offer) && `Offer: ${s(body.offer)}`,
    s(body.notes) && `Extra instructions: ${s(body.notes)}`,
    `Goal: ${goal}`,
    `Tone: ${s(body.tone) || "direct, warm, no hype"}`,
  ].filter(Boolean).join("\n");

  const system = `You write short commercial emails that get replies for small businesses. British English.

RULES:
- Use ONLY the facts supplied. Never invent products, prices, statistics, awards, testimonials or claims. If a detail is missing, write around it — do not guess.
- No hype, no "revolutionary", no fake urgency, no ALL CAPS, no exclamation spam.
- Plain text, short paragraphs, one clear call to action.
- 90-160 words. Mobile-first: the first line must earn the second.
- Subject line under 60 characters, specific, no clickbait and no emoji.
${mode === "template" ? "- This is a REUSABLE TEMPLATE. Use the merge tags {{name}} and {{business}} where a person's name or the sender's business belongs, so each contact gets a personalised copy." : "- Write it ready to send as-is. Do NOT use merge tags or placeholders like [name]."}

Reply in exactly this shape:
Subject: <subject line>
<blank line>
<email body>`;

  try {
    const res = await gatewayComplete({ system, prompt: facts, maxTokens: 800, lang: gatewayLangFrom(req) });
    const { subject, body: text } = splitDraft(res.text);
    return NextResponse.json({
      mode, subject, body: text, html: toHtml(text),
      provider: res.provider,
      note: "Draft only — edit it before sending. Nothing was sent or saved.",
    });
  } catch (e) {
    if (e instanceof GatewayUnconfiguredError) {
      return NextResponse.json({ error: "No AI provider key is configured, so drafting is unavailable. Write the email yourself, or set an AI key." }, { status: 503 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Drafting failed" }, { status: 502 });
  }
}
