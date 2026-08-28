// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Per-customer SEO autopilot — the customer's OWN branded blog.
//
// Two tiers, deliberately separate:
//   • PLATFORM blog (admin/owner) — MarketWar's own posts, no brandId, free to
//     the owner, scheduled by /api/blog/daily.
//   • CUSTOMER blog (this module) — each brand's own posts, brandId-scoped, and
//     CHARGED IN ACUs on every generation. A customer may push manually or let it
//     run automatically; either way the same charge applies, because either way
//     it spends real AI budget.
//
// Money rule: the wallet is debited BEFORE generation. If the balance can't cover
// the post, nothing is generated and nothing is charged — a customer can never
// end up with a half-written post they paid for, or a post they didn't pay for.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { walletIdForBrand } from "@/backend/brand-access";
import { entitlementFor } from "@/backend/entitlement";
import { generateArticle } from "@/backend/blog-generator";
import { brandLinkMenu } from "@/backend/blog-links";
import { savePost, getPost, listPostsForBrand } from "@/backend/blog-store";
import { spendAcus, getWallet, type Spender } from "@/backend/wallet";
import type { BlogPost } from "@/shared/blog";

// What one automated post costs the customer. A post is a long generation plus
// storage and hosting, so it is priced above a single short completion.
export const ACU_PER_POST = 25;

export type SeoAutopilotSettings = {
  brandId: string;
  enabled: boolean;                 // false = manual only
  cadence: "daily" | "weekly";
  topics: string[];                 // the rotating plan, in the brand's own words
  keywords: string;
  autoPublish: boolean;             // false = generate as draft for review
  updatedAt: string;
  lastRunAt?: string | null;
};

const COLLECTION = "seo_autopilot";
const mem = new Map<string, SeoAutopilotSettings>();

function defaults(brandId: string): SeoAutopilotSettings {
  return {
    brandId, enabled: false, cadence: "weekly", topics: [], keywords: "",
    autoPublish: false, updatedAt: new Date().toISOString(), lastRunAt: null,
  };
}

export async function getSeoSettings(brandId: string): Promise<SeoAutopilotSettings> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).doc(brandId).get();
    return snap.exists ? (snap.data() as SeoAutopilotSettings) : defaults(brandId);
  }
  return mem.get(brandId) ?? defaults(brandId);
}

export async function setSeoSettings(brandId: string, patch: Partial<SeoAutopilotSettings>): Promise<SeoAutopilotSettings> {
  const cur = await getSeoSettings(brandId);
  const next: SeoAutopilotSettings = {
    ...cur,
    enabled: patch.enabled ?? cur.enabled,
    cadence: patch.cadence === "daily" || patch.cadence === "weekly" ? patch.cadence : cur.cadence,
    topics: Array.isArray(patch.topics) ? patch.topics.map((t) => String(t).trim()).filter(Boolean).slice(0, 30) : cur.topics,
    keywords: typeof patch.keywords === "string" ? patch.keywords.trim().slice(0, 300) : cur.keywords,
    autoPublish: patch.autoPublish ?? cur.autoPublish,
    lastRunAt: patch.lastRunAt !== undefined ? patch.lastRunAt : cur.lastRunAt,
    updatedAt: new Date().toISOString(),
  };
  if (adminConfigured && adminDb) await adminDb.collection(COLLECTION).doc(brandId).set(next, { merge: true });
  else mem.set(brandId, next);
  return next;
}

// Brands with autopilot switched on — the scheduler's work list.
export async function listEnabledBrands(): Promise<SeoAutopilotSettings[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).where("enabled", "==", true).limit(500).get();
    return snap.docs.map((d) => d.data() as SeoAutopilotSettings);
  }
  return [...mem.values()].filter((s) => s.enabled);
}

// Is this brand due a post under its cadence? Prevents a daily cron from posting
// daily for a customer who chose weekly.
export function isDue(s: SeoAutopilotSettings, nowMs = Date.now()): boolean {
  if (!s.lastRunAt) return true;
  const elapsed = nowMs - Date.parse(s.lastRunAt);
  if (Number.isNaN(elapsed)) return true;
  return elapsed >= (s.cadence === "daily" ? 20 : 6.5 * 24) * 3_600_000; // slack so a cron drift never skips a cycle
}

const slugify = (x: string) => x.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
const readMinutes = (c: string) => Math.max(1, Math.round(c.split(/\s+/).length / 200));

export type BrandPostResult = {
  ok: boolean;
  charged: number;
  balanceAcu?: number;
  post?: { slug: string; title: string; status: string; url: string };
  /** How many links the article carries, and anything that was unlinked. */
  links?: { internal: number; external: number; removed: { url: string; text: string; reason: string }[]; note: string };
  error?: string;
};

// Generate ONE post for a brand. `trigger` only affects the note — the charge is
// identical whether a human pressed the button or the scheduler did.
export async function runBrandSeoPost(input: {
  brandId: string;
  brandName: string;
  website?: string;
  topic?: string;              // explicit topic wins; otherwise rotate the plan
  category?: string;
  trigger: "manual" | "auto";
  siteBase: string;
  /**
   * WHO ASKED FOR IT, so staff are not billed for their own platform.
   *
   * Pass the `BrandAccess` the route resolved. Omit it — or pass null — for the
   * scheduler, which has no caller: unattended work is charged, and `spendAcus`
   * says so rather than leaving a reader to guess whether an exemption was
   * considered.
   */
  spender?: Spender | null;
}): Promise<BrandPostResult> {
  const settings = await getSeoSettings(input.brandId);

  // Choose the topic from the brand's OWN plan — never an invented subject.
  const plan = settings.topics.length ? settings.topics : [];
  const explicit = (input.topic || "").trim();
  if (!explicit && !plan.length) {
    return { ok: false, charged: 0, error: "No topics set for this brand yet. Add at least one topic (or pass one) — the OS won't invent a subject for your blog." };
  }
  const existing = await listPostsForBrand(input.brandId);
  const topic = explicit || plan[existing.length % plan.length];

  // CHARGE FIRST. If the wallet can't cover it, generate nothing.
  const spendWalletId = await walletIdForBrand(input.brandId);
  // Unattended work does not run for a lapsed account. A balance is not a
  // subscription: the customer may still spend their ACUs themselves, but
  // nothing spends them on their behalf while nobody is paying.
  const ent = await entitlementFor(spendWalletId);
  if (ent.automationsPaused) {
    return { ok: false, charged: 0, error: `Autopilot is paused — ${ent.reason}` };
  }
  const debit = await spendAcus(input.spender ?? null, spendWalletId, ACU_PER_POST);
  if (!debit.ok) {
    return {
      ok: false, charged: 0, balanceAcu: debit.balanceAcu,
      error: `Not enough ACUs — a post costs ${ACU_PER_POST} ACUs and your balance is ${debit.balanceAcu}. Top up on Billing to continue.`,
    };
  }

  try {
    // THE BRAND'S OWN MENU, not the platform's. A customer's article linking to
    // marketwaros.com is our marketing on their page; what earns them rankings
    // is their blog pointing at their own service, pricing and booking pages.
    // Taken from their sitemap and their own navigation, so every destination
    // is a page that exists. A failure here costs links, never the post.
    const menu = await brandLinkMenu({
      posts: existing, brandId: input.brandId, website: input.website, cap: 40,
    }).catch(() => []);
    const gen = await generateArticle({ topic, category: input.category || "Growth", keywords: settings.keywords || undefined, menu });
    const now = new Date().toISOString();
    let slug = slugify(`${input.brandName}-${gen.title}`);
    if (await getPost(slug)) slug = `${slug}-${now.slice(0, 10).replace(/-/g, "")}`;
    const status = settings.autoPublish ? "published" : "draft";
    const post: BlogPost = {
      id: slug, slug, brandId: input.brandId, title: gen.title, excerpt: gen.excerpt,
      category: input.category || "Growth", readMinutes: readMinutes(gen.content), content: gen.content,
      author: input.brandName, status: status as BlogPost["status"], mode: gen.mode, views: 0,
      createdAt: now, publishedAt: settings.autoPublish ? now : null,
    };
    await savePost(post);
    await setSeoSettings(input.brandId, { lastRunAt: now });
    const wallet = await getWallet(input.brandId);
    return {
      // WHAT WAS ACTUALLY TAKEN, not the price list. A staff run charges nothing
      // and must not report a charge, or the owner's economics count revenue
      // from wallets that were never debited.
      ok: true, charged: debit.charged, balanceAcu: wallet.balanceAcu,
      post: { slug, title: post.title, status, url: `${input.siteBase}/blog/${slug}` },
      links: gen.links,
    };
  } catch (e) {
    // Generation failed after the debit — refund, so a customer is never charged
    // for a post that does not exist.
    // Refund only what was taken. Crediting the price list back to an exempt
    // caller's wallet would MINT ACUs out of a failed generation.
    if (debit.charged > 0) {
      const { creditAcus } = await import("@/backend/wallet");
      await creditAcus(spendWalletId, debit.charged);
    }
    return {
      ok: false, charged: 0,
      error: `Generation failed — ${debit.charged > 0 ? `your ${debit.charged} ACUs were refunded` : "nothing was charged"}. ${e instanceof Error ? e.message : ""}`.trim(),
    };
  }
}
