import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import { createItem, listItems, getItem, transition, addComment } from "@/backend/approvals";
import type { ApprovalAction } from "@/shared/approvals";

// Collaboration & Approvals API — brand-scoped. Every action verifies the caller
// owns the brand (resolveBrandAccess; demo-safe passthrough when Admin is
// unconfigured). No external key: the whole workflow is in-house.
//
// POST { action, brandId, ... }
//   create   { title, description?, assetUrl? }
//   list
//   get      { id }
//   transition { id, action, actor, role?, note? }
//   comment  { id, actor, role?, note }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ACTIONS: ApprovalAction[] = ["submit", "approve", "request_changes", "reject", "publish", "reopen"];

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "approvals"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const action = s("action");
  const brandId = s("brandId");
  const nowISO = typeof b.nowISO === "string" ? b.nowISO : new Date().toISOString();

  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // For item-scoped actions, confirm the item belongs to this brand.
  async function ownItemOr404(id: string) {
    const item = await getItem(id);
    if (!item || item.brandId !== brandId) return null;
    return item;
  }

  switch (action) {
    case "create": {
      if (!s("title")) return NextResponse.json({ error: "title is required" }, { status: 400 });
      const item = await createItem({ brandId, title: s("title"), description: s("description"), assetUrl: s("assetUrl"), createdBy: s("actor") || "you", nowISO });
      return NextResponse.json({ item });
    }
    case "list":
      return NextResponse.json({ items: await listItems(brandId) });
    case "get": {
      const item = await ownItemOr404(s("id"));
      return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "transition": {
      const act = s("act") as ApprovalAction; // the workflow action (distinct from the API `action`)
      if (!VALID_ACTIONS.includes(act)) return NextResponse.json({ error: "Invalid workflow action" }, { status: 400 });
      if (!(await ownItemOr404(s("id")))) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const r = await transition({ id: s("id"), action: act, actor: s("actor") || "you", role: s("role"), note: s("note"), nowISO });
      return r.ok ? NextResponse.json({ item: r.item }) : NextResponse.json({ error: r.error }, { status: 400 });
    }
    case "comment": {
      if (!(await ownItemOr404(s("id")))) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const r = await addComment({ id: s("id"), actor: s("actor") || "you", role: s("role"), note: s("note"), nowISO });
      return r.ok ? NextResponse.json({ item: r.item }) : NextResponse.json({ error: r.error }, { status: 400 });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
