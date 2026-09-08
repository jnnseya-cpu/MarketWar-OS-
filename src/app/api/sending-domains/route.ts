import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import { addDomain, listDomains, listDomainsForOwner, verifyDomain, removeDomain } from "@/backend/sending-domains";

// ESP sending-domain authentication API.
// POST { action:"add", brandId, domain }        → generate DKIM key + DNS records
// POST { action:"verify", brandId, domain }     → live DNS check, flips to verified
// GET  ?brandId=…                               → list domains + records (no keys)
// DELETE ?brandId=…&domain=…                    → remove a domain
// Ownership enforced; the private key is NEVER returned.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "sending-domains"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    if (action === "add") return NextResponse.json(await addDomain(brandId, domain, access.uid ?? undefined));
    if (action === "verify") {
      const v = await verifyDomain(brandId, domain);
      if (!v) return NextResponse.json({ error: "Domain not found — add it first" }, { status: 404 });
      return NextResponse.json(v);
    }
    return NextResponse.json({ error: "Unknown action — use add or verify" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  // ONE BRAND'S DOMAIN IS NOT ANOTHER BRAND'S DOMAIN.
  //
  // This used to MERGE every domain the account had verified under any brand id
  // into this brand's list. It was written to stop a verified domain silently
  // disappearing after a brand-id change, which was a real problem — but the
  // cure presented one brand's domain as another's, and the consequence is not
  // cosmetic:
  //
  //   1. `emailIdentityDefaults` prefills the From address from the FIRST
  //      verified domain in this list, so opening the Email Centre on Koda
  //      prefilled it to send as evandeli.com — AxionOS's domain.
  //   2. `fromAddressWarning` checks against this same list, so it said that was
  //      fine and warned about nothing.
  //   3. On send, `signingFor(brandId, fromDomain)` looks the record up by
  //      `brandId::domain` and finds NOTHING, because the domain is stored under
  //      the other brand. The message goes out claiming to be from evandeli.com
  //      with NO DKIM SIGNATURE.
  //
  // evandeli.com publishes `p=none; adkim=s; aspf=s` — strict alignment. Mail
  // From that domain with no valid DKIM fails DMARC alignment at the receiver
  // and damages the reputation of a domain the customer owns. So the merge did
  // not just confuse the screen; it produced mail engineered to fail.
  //
  // AND IT CANNOT BE FIXED BY SHARING THE KEY EITHER. A record is keyed
  // `brandId::domain` with a FIXED selector, so two brands on one domain would
  // both need `mwos._domainkey.<domain>` in DNS, which holds exactly one value.
  // The second brand's key could never validate. A domain belongs to one brand.
  //
  // So `domains` is brand-scoped and authoritative — it is what prefills the
  // From address, what the warning checks, and what may be signed. The account's
  // other domains are still REPORTED, because the original complaint ("all
  // gone") was legitimate and a domain vanishing with no explanation is its own
  // defect — but they are reported as belonging elsewhere, and nothing on the
  // send path reads them.
  const domains = await listDomains(brandId);
  const ownerDomains = access.uid ? await listDomainsForOwner(access.uid) : [];
  const here = new Set(domains.map((d) => d.domain));
  const otherBrandDomains = ownerDomains
    .filter((d) => !here.has(d.domain))
    .map((d) => ({ domain: d.domain, status: d.status }));

  // AUTHENTICATION AND TRANSPORT ARE TWO DIFFERENT THINGS, and this screen only
  // ever reported the first. A verified domain said "Live … it sends signed as
  // you" next to a promise that MarketWar's own infrastructure hands the message
  // to the recipient — on a deployment with no sending node configured, where
  // nothing leaves at all. The owner reasonably concluded sending was set up.
  //
  // DNS is the customer's half and is per domain. The sending node is the
  // platform's half, set once for the whole deployment. Both are required, so
  // both are reported here.
  const { emailIsConfigured } = await import("@/backend/email");
  const { mxHostConfigured } = await import("@/backend/sending-domains");
  const { platformReplyPath } = await import("@/backend/reply-routing");
  const replyPath = await platformReplyPath();
  return NextResponse.json({
    domains,
    sendingConfigured: emailIsConfigured(),
    // WHY THERE MAY BE NO MX ROW. The panel used to print one unconditionally,
    // naming a host that cannot receive mail; an absent row with a reason beats
    // a record a registrar refuses.
    repliesConfigured: mxHostConfigured() && replyPath.ok,
    repliesNote: mxHostConfigured() && replyPath.ok
      ? ""
      : "Replies into this Inbox are not switched on for this deployment yet, so no reply MX record is offered. Campaigns still send, and replies go to whatever Reply-to address you set — put a mailbox you actually read there.",
    // Display only. Never merged into `domains`, never prefilled, never signed.
    otherBrandDomains,
    otherBrandNote: otherBrandDomains.length
      // NOT "a second brand cannot sign for it" — that stopped being true when
      // the DKIM selector became brand-scoped. Each brand publishes its own key
      // at its own selector, so a shared domain is added once per brand.
      ? `${otherBrandDomains.length} other domain(s) on this account are authenticated under a DIFFERENT brand and are not listed here, because a brand only ever sends with a key it published itself. To send this brand's mail from one of them, add the domain here too and publish this brand's own DKIM record — the two keys sit at different selectors and do not collide.`
      : "",
  });
}

export async function DELETE(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || "";
  const domain = req.nextUrl.searchParams.get("domain") || "";
  if (!brandId || !domain) return NextResponse.json({ error: "brandId and domain required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  await removeDomain(brandId, domain);
  return NextResponse.json({ ok: true });
}
