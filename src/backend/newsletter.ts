// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE WEEKLY NEWSLETTER — every registered user, every week, selling the
// platform, with a great many links.
//
// `digest-subscriptions.ts` argued against exactly this and it was right about
// the danger, so the argument is answered here rather than ignored:
//
//   "Everyone with an account. A daily email nobody asked for is spam, and it
//    is spam sent from the domain this platform's whole deliverability story
//    depends on. One complaint rate ruins every customer's sending."
//
// That risk is real and it is not a reason to refuse — it is the specification
// for how this has to be built. Every customer's campaign email leaves through
// the same sending pool, so a complaint rate earned here is charged to them.
// Four things make the difference between a newsletter and that outcome:
//
//   1. ONE-CLICK UNSUBSCRIBE THAT ACTUALLY WORKS, in the header and in the body,
//      honoured permanently and instantly. A newsletter without this is not a
//      newsletter, and the reason people press "spam" instead of "unsubscribe"
//      is almost always that unsubscribe did not work last time.
//   2. IT ONLY SELLS WHAT THIS DEPLOYMENT CAN ACTUALLY DO. Selling AI video to a
//      customer whose deployment has no render key is the platform's own
//      cardinal sin — never take somebody's effort for an outcome you cannot
//      deliver — and it is also the fastest possible route to a complaint.
//   3. NO INVENTED NUMBERS. Every feature page carries a `proof` and a `limit`
//      written from how the thing genuinely works. Those go in the email
//      unchanged. There is no "join 10,000 businesses" anywhere in here.
//   4. ONE ISSUE PER WEEK PER PERSON, ENFORCED BY A CLAIM. A cron that fires
//      twice must not mean two emails, and the same idempotency shape the payout
//      and publication ledgers use applies to a mailing list.
//
// It is marketing mail, so it travels in the emergency stop's `send` lane and a
// halt stops it — unlike a password reset, nobody is locked out of anything by
// missing a newsletter.

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { adminDb, adminConfigured, adminAuth } from "@/backend/firebase-admin";
import { capabilityStates, type CapabilityId } from "@/backend/capabilities";
import { FEATURE_PAGES } from "@/shared/feature-pages";
import { siteUrl } from "@/shared/site";
import { validateAddress, suppress } from "@/backend/email";
import { addSuppression } from "@/backend/email-events";
import { record as auditRecord } from "@/backend/audit-log";

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------
// Who gets it, and who never does again
// ---------------------------------------------------------------------------

const OPTOUTS = "newsletter_optouts";
/** The reserved id under which MarketWar's own mail is suppressed, distinct from any brand's. */
export const PLATFORM_LIST = "__marketwar__";
const ISSUES = "newsletter_issues";
const useDb = () => adminConfigured && Boolean(adminDb);

const memOptOuts = new Set<string>();
/** issueKey|email → when it was sent. The claim that stops a double send. */
const memSent = new Map<string, string>();

const norm = (e: string) => (e || "").trim().toLowerCase();

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEWSLETTER_SECRET || env.PORTAL_LINK_SECRET || env.HUMAN_CHECK_SECRET || "").trim();
}

/**
 * Can this deployment send a newsletter at all?
 *
 * It needs a durable secret for the unsubscribe signature. Without one an
 * unsubscribe link minted by one server would not verify on another, so a
 * customer would click it, be told it was invalid, and press "spam" instead —
 * which is precisely the outcome this whole module is arranged to avoid. So:
 * no secret, no newsletter. Not "send it without working unsubscribes".
 */
export function newsletterConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return secret(env).length >= 16;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A signed, permanent unsubscribe token for one address. */
export function unsubscribeToken(email: string, env: NodeJS.ProcessEnv = process.env): string {
  const e = norm(email);
  const payload = b64url(Buffer.from(e));
  const sig = b64url(createHmac("sha256", secret(env)).update(e).digest());
  return `${payload}.${sig}`;
}

export function unsubscribeUrl(email: string, env: NodeJS.ProcessEnv = process.env): string {
  return siteUrl(`/unsubscribe?t=${encodeURIComponent(unsubscribeToken(email, env))}`);
}

export type UnsubResult = { ok: false; error: string } | { ok: true; email: string };

/**
 * Honour an unsubscribe.
 *
 * Deliberately forgiving about everything except the signature: a person trying
 * to leave a mailing list must never be asked to log in, confirm twice, or
 * explain themselves. The one thing checked is that the token is ours, so
 * nobody can unsubscribe somebody else's address by guessing it.
 */
export async function unsubscribe(token: string, env: NodeJS.ProcessEnv = process.env): Promise<UnsubResult> {
  if (!newsletterConfigured(env)) return { ok: false, error: "Unsubscribe links are not configured on this deployment." };
  const parts = (token || "").split(".");
  if (parts.length !== 2) return { ok: false, error: "That unsubscribe link is not valid." };

  const email = norm(Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  const expected = Buffer.from(b64url(createHmac("sha256", secret(env)).update(email).digest()));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: "That unsubscribe link is not valid." };
  }

  memOptOuts.add(email);

  // THERE IS ALREADY A SUPPRESSION LEDGER AND THIS FEEDS IT.
  //
  // `/api/track/unsubscribe` has handled brand-campaign opt-outs since long
  // before this file, and it works through `email-events.recordEvent`, which
  // calls `suppress()` and writes a durable row. Two mailing lists genuinely do
  // exist — a customer leaving AxionOS's campaigns must not stop MarketWar
  // writing to the AxionOS OWNER, and the reverse — so the LISTS are separate.
  //
  // But "never mail this address again" must have one answer, not two. So this
  // writes to the same in-memory ledger AND the same durable collection the
  // campaign path uses, under the reserved platform id. Without that, an opt-out
  // here would survive a restart in its own collection and be invisible to every
  // other send path in the platform.
  suppress(email);
  await addSuppression(PLATFORM_LIST, email, "newsletter unsubscribe").catch(() => { /* the fast path already holds it */ });
  if (useDb()) {
    try { await adminDb!.collection(OPTOUTS).doc(hid(email)).set({ email, at: new Date().toISOString() }); } catch { /* memory holds it */ }
  }
  auditRecord({
    actorType: "user", actor: `email:${hid(email)}`, action: "newsletter.unsubscribed",
    resource: "newsletter", resourceId: hid(email),
    before: { subscribed: "true" }, after: { subscribed: "false" },
  });
  return { ok: true, email };
}

export async function hasOptedOut(email: string): Promise<boolean> {
  const e = norm(email);
  if (memOptOuts.has(e)) return true;
  if (!useDb()) return false;
  try {
    const doc = await adminDb!.collection(OPTOUTS).doc(hid(e)).get();
    return doc.exists;
  } catch {
    return false;
  }
}

export type Recipient = { uid: string; email: string; name?: string };

/**
 * Everybody registered who may still be written to.
 *
 * Firebase Auth is the register. Without it there is no list of users, and the
 * honest answer is an empty audience rather than an invented one — a newsletter
 * that "sent to 0" tells the operator the truth about their deployment.
 */
export async function audience(limit = 1000): Promise<{ recipients: Recipient[]; skipped: { reason: string; count: number }[]; note: string }> {
  if (!adminConfigured || !adminAuth) {
    return {
      recipients: [], skipped: [],
      note: "No user register on this deployment — Firebase Admin is not configured, so there is nobody to send to. This is the truth about the deployment, not a failure of the newsletter.",
    };
  }

  const recipients: Recipient[] = [];
  const skipped = { unverified: 0, opted_out: 0, unsendable: 0 };
  try {
    const page = await adminAuth.listUsers(Math.min(1000, limit));
    for (const u of page.users) {
      const email = norm(u.email || "");
      if (!email) continue;
      // An unverified address is one nobody has proved they own. Mailing it is
      // how a typo'd signup becomes a complaint from a stranger.
      if (!u.emailVerified) { skipped.unverified += 1; continue; }
      if (await hasOptedOut(email)) { skipped.opted_out += 1; continue; }
      const verdict = validateAddress(email);
      if (!verdict.sendable) { skipped.unsendable += 1; continue; }
      recipients.push({ uid: u.uid, email, name: u.displayName || undefined });
      if (recipients.length >= limit) break;
    }
  } catch {
    return { recipients: [], skipped: [], note: "The user register could not be read. Nothing was sent — an audience that cannot be resolved is never guessed at." };
  }

  return {
    recipients,
    skipped: Object.entries(skipped).filter(([, n]) => n > 0).map(([reason, count]) => ({ reason, count })),
    note: `${recipients.length} registered ${recipients.length === 1 ? "person" : "people"} can be written to.`,
  };
}

// ---------------------------------------------------------------------------
// What is in it
// ---------------------------------------------------------------------------

/** Monday-anchored week key. Two sends in one week is the thing this prevents. */
export function weekKey(nowISO: string): string {
  const d = new Date(nowISO);
  if (Number.isNaN(d.getTime())) return "invalid";
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export type Link = { label: string; url: string; why: string };

export type Issue = {
  week: string;
  subject: string;
  preheader: string;
  /** Every link in the issue, so a test can check they are all absolute. */
  links: Link[];
  /** Capabilities this deployment can actually deliver. */
  live: CapabilityId[];
  /** Named so the issue never sells them. */
  dark: CapabilityId[];
  html: string;
  text: string;
};

/**
 * One week's issue.
 *
 * The rotation is derived from the week key rather than a counter, so the same
 * week always produces the same issue — a resend after a failure is the same
 * email, not a different one.
 */
export function buildIssue(input: {
  week: string;
  recipientName?: string;
  unsubscribeHref: string;
  env?: NodeJS.ProcessEnv;
}): Issue {
  const env = input.env || process.env;
  const states = capabilityStates(env);
  const live = states.filter((s) => s.live).map((s) => s.id);
  const dark = states.filter((s) => !s.live).map((s) => s.id);

  // WHICH FEATURES GET SOLD. A feature page whose capability is dark on this
  // deployment is left out — the customer clicking through would find something
  // they cannot use, and the person who opened the email would be right to
  // complain. `keyless` pages are always fair game.
  const sellable = FEATURE_PAGES.filter((p) => !p.requiresCapability || live.includes(p.requiresCapability as CapabilityId));

  // Deterministic rotation: the same week is always the same three.
  const seed = Number.parseInt(hid(input.week).slice(0, 6), 16);
  const rotate = <T,>(arr: T[], take: number): T[] => {
    if (arr.length <= take) return [...arr];
    const start = seed % arr.length;
    return Array.from({ length: take }, (_, i) => arr[(start + i) % arr.length]);
  };

  const featured = rotate(sellable, 3);
  const links: Link[] = [];
  const add = (label: string, url: string, why: string) => { links.push({ label, url, why }); return url; };

  const feature = (p: (typeof FEATURE_PAGES)[number]) =>
    add(p.title, siteUrl(`/features/${p.slug}`), p.description);

  const dashboardLinks: Link[] = [
    { label: "Open your command centre", url: siteUrl("/dashboard"), why: "Today's revenue, leads and what needs approving." },
    { label: "Run the free website audit", url: siteUrl("/audit"), why: "A real crawl of a real page. No account, no key." },
    { label: "See what you can acquire this week", url: siteUrl("/dashboard/acquisition"), why: "Who has actually been asked, and what came back." },
    { label: "Check what your deployment can do", url: siteUrl("/dashboard/settings"), why: "Every capability, live or dark, with the one action that lights it up." },
    { label: "All features", url: siteUrl("/features"), why: "Every engine, each with its proof and its limit." },
    { label: "Read the blog", url: siteUrl("/blog"), why: "What we have actually learned running this." },
  ];
  for (const l of dashboardLinks) links.push(l);

  const hello = input.recipientName ? `Hello ${input.recipientName},` : "Hello,";
  const subject = `MarketWar this week: ${featured[0]?.title ?? "what your deployment can do right now"}`;
  const preheader = featured.map((f) => f.title).join(" · ").slice(0, 140);

  const featureHtml = featured.map((p) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #1d2739">
      <a href="${feature(p)}" style="color:#34d399;font-weight:700;font-size:16px;text-decoration:none">${escapeHtml(p.title)}</a>
      <p style="margin:6px 0 8px;color:#94a3b8;font-size:14px;line-height:1.55">${escapeHtml(p.description)}</p>
      <p style="margin:0 0 6px;color:#cbd5e1;font-size:13px;line-height:1.55"><strong>How it actually works:</strong> ${escapeHtml(firstSentence(p.proof))}</p>
      <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.55"><strong>The limit:</strong> ${escapeHtml(firstSentence(p.limit))}</p>
    </td></tr>`).join("");

  const quickHtml = dashboardLinks.map((l) => `
    <li style="margin:0 0 8px;color:#94a3b8;font-size:14px;line-height:1.5">
      <a href="${l.url}" style="color:#34d399;text-decoration:none;font-weight:600">${escapeHtml(l.label)}</a> — ${escapeHtml(l.why)}
    </li>`).join("");

  const darkNote = dark.length
    ? `<p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.55">Some of the platform is not switched on for you yet (${dark.length} of ${states.length} capabilities). We have deliberately left those out of this email rather than sell you something you would click through to and find gated. <a href="${siteUrl("/dashboard/settings")}" style="color:#94a3b8">See what turns them on</a>.</p>`
    : "";

  const html = `<div style="background:#0b1120;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;background:#0f172a;border:1px solid #1d2739;border-radius:14px;padding:28px">
    <p style="margin:0 0 4px;color:#34d399;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">MarketWar OS · week of ${escapeHtml(input.week)}</p>
    <p style="margin:0 0 18px;color:#e2e8f0;font-size:15px">${escapeHtml(hello)}</p>
    <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;line-height:1.6">Three things your account can do this week, each with how it genuinely works and where it stops.</p>
    <table style="width:100%;border-collapse:collapse">${featureHtml}</table>
    <p style="margin:22px 0 8px;color:#e2e8f0;font-size:14px;font-weight:700">Straight to it</p>
    <ul style="margin:0;padding-left:18px">${quickHtml}</ul>
    ${darkNote}
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #1d2739;color:#64748b;font-size:12px;line-height:1.6">
      You are getting this because you have a MarketWar OS account.
      <a href="${input.unsubscribeHref}" style="color:#94a3b8;text-decoration:underline">Unsubscribe</a> — one click, takes effect immediately, and we will not write to you again.
    </p>
  </div>
</div>`;

  const text = [
    `MarketWar OS — week of ${input.week}`,
    "",
    hello,
    "",
    ...featured.flatMap((p) => [
      p.title,
      siteUrl(`/features/${p.slug}`),
      `How it actually works: ${firstSentence(p.proof)}`,
      `The limit: ${firstSentence(p.limit)}`,
      "",
    ]),
    "Straight to it:",
    ...dashboardLinks.map((l) => `- ${l.label}: ${l.url}`),
    "",
    `Unsubscribe (one click, immediate): ${input.unsubscribeHref}`,
  ].join("\n");

  return { week: input.week, subject, preheader, links, live, dark, html, text };
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The proof and limit fields are paragraphs; an email wants the first sentence. */
function firstSentence(md: string): string {
  const plain = String(md || "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const stop = plain.search(/\.\s/);
  return (stop > 0 ? plain.slice(0, stop + 1) : plain).slice(0, 300);
}

// ---------------------------------------------------------------------------
// Sending it, once
// ---------------------------------------------------------------------------

const sentKey = (week: string, email: string) => `${week}|${norm(email)}`;

/**
 * Has this person already had this week's issue? The claim that stops a double send.
 *
 * `readClaim` is injectable for one reason: the branch that matters most here —
 * what happens when storage cannot be read — is unreachable in a test
 * environment with no Firebase, so a mutation removing it survived. A guard
 * nothing can exercise is a guard nobody can trust.
 */
export async function alreadySent(
  week: string,
  email: string,
  readClaim?: (docId: string) => Promise<boolean>,
): Promise<boolean> {
  const k = sentKey(week, email);
  if (memSent.has(k)) return true;
  const read = readClaim ?? (useDb()
    ? async (docId: string) => (await adminDb!.collection(ISSUES).doc(docId).get()).exists
    : null);
  if (!read) return false;
  try {
    return await read(hid(k));
  } catch {
    // UNREADABLE IS NOT PROOF IT WAS NEVER SENT. Treating it as "not sent" is
    // how one storage blip becomes a second email to the entire list, and a
    // duplicate newsletter is the complaint that costs every customer their
    // deliverability.
    return true;
  }
}

export async function markSent(week: string, email: string, nowISO: string): Promise<void> {
  const k = sentKey(week, email);
  memSent.set(k, nowISO);
  if (useDb()) {
    try { await adminDb!.collection(ISSUES).doc(hid(k)).set({ week, email, sentAt: nowISO }); } catch { /* memory holds it */ }
  }
}

export const NEWSLETTER_DOCTRINE = [
  "Unsubscribe is one click, permanent, needs no login, and also suppresses the address platform-wide — somebody who left the list did not agree to hear from a different part of the product instead.",
  "Without a durable secret nothing is sent at all. An unsubscribe link that fails to verify on another server is how a reader presses \"spam\" instead, and every customer's campaign mail leaves through the same domain.",
  "The issue only sells capabilities this deployment can actually deliver. Selling a gated feature is the platform's own cardinal sin and the fastest route to a complaint.",
  "No invented numbers. Every claim in the email is a feature page's `proof` and `limit`, written from how the thing genuinely works.",
  "Unverified addresses are never mailed. An address nobody proved they own is how a typo'd signup becomes a complaint from a stranger.",
  "One issue per person per week, enforced by a claim written before the send — a cron that fires twice must not mean two emails.",
  "It is marketing, so it travels in the emergency stop's `send` lane. Nobody is locked out of anything by missing a newsletter.",
];

/** Test seam. Never called by product code. */
export function __resetNewsletter(): void {
  memOptOuts.clear();
  memSent.clear();
}
