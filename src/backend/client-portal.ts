// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE CLIENT WHO WILL NEVER MAKE AN ACCOUNT.
//
// An agency sends work to a client for sign-off. That client is a busy person at
// another company who has no interest in MarketWar, will not create a password,
// and will not remember one if they do. Asking them to means the agency ends up
// forwarding screenshots by email and approving on their behalf, which is
// exactly the audit trail an agency needs and cannot fake.
//
// So: a link that approves one thing.
//
// WHAT MAKES A LINK LIKE THIS SAFE, GIVEN IT IS AN UNAUTHENTICATED URL.
//
//   • IT IS SIGNED. The token carries the item, the brand and an expiry, and an
//     HMAC over all three. Change any character and it stops verifying.
//   • IT OPENS EXACTLY ONE ITEM. Not a brand, not a queue, not a session. Even a
//     leaked link exposes the one asset it was minted for.
//   • IT EXPIRES, and it can be revoked before it does.
//   • THE ONLY ACTIONS ARE APPROVE, REQUEST CHANGES AND REJECT. It cannot edit,
//     publish, spend or read anything else — the same permissions the `client`
//     workspace role has, because they are the same person.
//
// AND THE RULE THAT MATTERS MOST HERE: WITHOUT A DURABLE SECRET, NO LINK IS
// MINTED AT ALL.
//
// A per-process key would mint links that verify on the instance that made them
// and fail everywhere else — the client clicks, gets an error, and the agency
// looks incompetent to their own customer. The human gate learned this the
// expensive way and refuses to enforce without `HUMAN_CHECK_SECRET`; this
// refuses to ISSUE, which is the same rule pointed the other way. Never take
// somebody's effort for an outcome that cannot be delivered.

import { createHmac, timingSafeEqual } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { getItem, transition, addComment } from "@/backend/approvals";
import { record as auditRecord } from "@/backend/audit-log";
import type { ApprovalItem } from "@/shared/approvals";

/** The three things a client may do, and nothing else. */
export const CLIENT_ACTIONS = ["approve", "request_changes", "reject"] as const;
export type ClientAction = (typeof CLIENT_ACTIONS)[number];

export const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000; // a fortnight
export const MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const COLLECTION = "portal_links";
const useDb = () => adminConfigured && Boolean(adminDb);
const revoked = new Map<string, { at: string; by: string }>();

function secret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PORTAL_LINK_SECRET || env.HUMAN_CHECK_SECRET || "").trim();
}

/** Whether this deployment can issue links at all. Surfaces ask before offering the button. */
export function portalConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return secret(env).length >= 16;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(payload: string, env: NodeJS.ProcessEnv = process.env): string {
  return b64url(createHmac("sha256", secret(env)).update(payload).digest());
}

export type MintResult =
  | { ok: false; error: string }
  | { ok: true; token: string; expiresAt: string; note: string };

/**
 * Make a link for one approval item.
 *
 * The token is `itemId.brandId.expiry.signature`, all base64url. Nothing secret
 * is inside it — the signature is what makes it unforgeable, and putting the
 * fields in the clear means a support conversation can read what a link is for
 * without anybody pasting a working credential into a chat window.
 */
export function mintLink(input: {
  itemId: string; brandId: string; ttlMs?: number; nowMs?: number; env?: NodeJS.ProcessEnv;
}): MintResult {
  const env = input.env || process.env;
  if (!portalConfigured(env)) {
    return {
      ok: false,
      error: "No approval links can be issued on this deployment. Set PORTAL_LINK_SECRET (at least 16 characters) and redeploy. Without a durable secret a link would verify on the server that made it and fail on every other one — the client would click, get an error, and you would look broken to your own customer.",
    };
  }
  const itemId = (input.itemId || "").trim();
  const brandId = (input.brandId || "").trim();
  if (!itemId || !brandId) return { ok: false, error: "itemId and brandId are required." };

  const now = input.nowMs ?? Date.now();
  const ttl = Math.min(Math.max(60_000, input.ttlMs ?? DEFAULT_TTL_MS), MAX_TTL_MS);
  const expiry = now + ttl;
  const payload = `${b64url(Buffer.from(itemId))}.${b64url(Buffer.from(brandId))}.${expiry}`;
  const token = `${payload}.${sign(payload, env)}`;

  return {
    ok: true, token,
    expiresAt: new Date(expiry).toISOString(),
    note: `Opens this one item and nothing else. Expires ${new Date(expiry).toISOString().slice(0, 10)}; revoke it sooner if you need to.`,
  };
}

export type Verified =
  | { ok: false; error: string }
  | { ok: true; itemId: string; brandId: string; expiresAt: string };

/** Check a token. Every failure says which one it was, because a client needs to know whether to ask for a new link. */
export function verifyLink(token: string, opts: { nowMs?: number; env?: NodeJS.ProcessEnv } = {}): Verified {
  const env = opts.env || process.env;
  if (!portalConfigured(env)) return { ok: false, error: "Approval links are not configured on this deployment." };

  const parts = (token || "").split(".");
  if (parts.length !== 4) return { ok: false, error: "That link is not a valid approval link." };
  const [rawItem, rawBrand, rawExpiry, signature] = parts;
  const payload = `${rawItem}.${rawBrand}.${rawExpiry}`;

  // Constant time, so a mismatched signature cannot be narrowed by timing.
  const expected = Buffer.from(sign(payload, env));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: "That link has been altered or was not issued by us." };
  }

  const expiry = Number(rawExpiry);
  if (!Number.isFinite(expiry)) return { ok: false, error: "That link is not a valid approval link." };
  const now = opts.nowMs ?? Date.now();
  if (now > expiry) {
    return { ok: false, error: `That link expired on ${new Date(expiry).toISOString().slice(0, 10)}. Ask for a new one — nothing is wrong with the work.` };
  }

  const itemId = fromB64url(rawItem).toString();
  if (revoked.has(itemId)) return { ok: false, error: "That link was withdrawn. Ask for a new one." };

  return { ok: true, itemId, brandId: fromB64url(rawBrand).toString(), expiresAt: new Date(expiry).toISOString() };
}

export async function revokeLink(itemId: string, by: string, nowISO?: string): Promise<{ ok: true }> {
  const at = nowISO || new Date().toISOString();
  revoked.set(itemId, { at, by });
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(itemId).set({ itemId, revokedAt: at, revokedBy: by }); } catch { /* memory holds it */ }
  }
  auditRecord({
    actorType: "user", actor: by, action: "portal_link.revoked",
    resource: "approval", resourceId: itemId,
    before: { link: "active" }, after: { link: "revoked" }, nowISO: at,
  });
  return { ok: true };
}

/** What the client sees. Deliberately the item and nothing around it. */
export type PortalView = {
  itemId: string;
  title: string;
  description: string;
  assetUrl?: string;
  state: ApprovalItem["state"];
  /** Which of the three actions are legal right now. */
  actions: ClientAction[];
  /** Decisions already made, so a client is not asked twice. */
  history: { action: string; at: string; note?: string }[];
  note: string;
};

export async function view(token: string, opts: { nowMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<{ ok: false; error: string } | { ok: true; view: PortalView }> {
  const v = verifyLink(token, opts);
  if (!v.ok) return v;
  const item = await getItem(v.itemId);
  if (!item) return { ok: false, error: "That item no longer exists." };
  // The token names a brand; the item must agree. A token that verifies against
  // a different brand's item would mean a mint bug, and it fails closed.
  if (item.brandId !== v.brandId) return { ok: false, error: "That link does not match this item." };

  const decided = item.state === "approved" || item.state === "rejected" || item.state === "published";
  return {
    ok: true,
    view: {
      itemId: item.id,
      title: item.title,
      description: item.description,
      assetUrl: item.assetUrl,
      state: item.state,
      actions: decided ? [] : [...CLIENT_ACTIONS],
      history: item.history.map((h) => ({ action: h.action, at: h.at, note: h.note })),
      note: decided
        ? `This was already ${item.state.replace(/_/g, " ")}. Nothing further is needed from you.`
        : "Approve it, ask for a change, or reject it. You are not signed in and nothing else here is visible to you.",
    },
  };
}

export type ActResult = { ok: false; error: string } | { ok: true; state: ApprovalItem["state"]; note: string };

/**
 * The client's decision.
 *
 * Runs through `approvals.transition` — the same state machine everybody else
 * uses — rather than writing a state directly, so an illegal move is refused
 * here exactly as it would be in the dashboard.
 */
export async function act(input: {
  token: string; action: ClientAction; note?: string; clientName?: string;
  nowISO?: string; nowMs?: number; env?: NodeJS.ProcessEnv;
}): Promise<ActResult> {
  const v = verifyLink(input.token, { nowMs: input.nowMs, env: input.env });
  if (!v.ok) return v;
  if (!(CLIENT_ACTIONS as readonly string[]).includes(input.action)) {
    return { ok: false, error: `A client link can only approve, request changes or reject — not "${input.action}".` };
  }

  const item = await getItem(v.itemId);
  if (!item) return { ok: false, error: "That item no longer exists." };
  if (item.brandId !== v.brandId) return { ok: false, error: "That link does not match this item." };

  const nowISO = input.nowISO || new Date().toISOString();
  const actor = (input.clientName || "").trim() || "Client (via approval link)";
  // CAPTURED BEFORE THE TRANSITION, not read after it.
  //
  // `approvals.transition` mutates the stored item in place, and `getItem` can
  // hand back that same object — so reading `item.state` afterwards yields the
  // NEW state, the audit entry records before and after as identical, and the
  // one record an agency actually needs says nothing changed. A test caught it;
  // review would not have.
  const stateBefore = item.state;

  // The state machine requires an item to be in review before it can be decided.
  // A client opening a draft is the agency's mistake, not the client's, and the
  // message says so rather than showing them a state name.
  if (stateBefore === "draft" || stateBefore === "changes_requested") {
    return { ok: false, error: "This has not been sent for review yet. Ask whoever shared the link to submit it first." };
  }

  const result = await transition({ id: item.id, action: input.action, actor, role: "client", note: input.note, nowISO });
  if (!result.ok) return { ok: false, error: result.error };

  if ((input.note || "").trim() && input.action === "approve") {
    // An approval with a comment keeps the comment — it is often the only place
    // a client's caveat is written down.
    await addComment({ id: item.id, actor, role: "client", note: input.note!.trim(), nowISO });
  }

  auditRecord({
    actorType: "user", actor, action: `portal.${input.action}`,
    resource: "approval", resourceId: item.id, brandId: item.brandId,
    before: { state: stateBefore }, after: { state: result.item.state },
    reason: input.note, approvalId: item.id, nowISO,
  });

  return {
    ok: true, state: result.item.state,
    note: input.action === "approve"
      ? "Approved. Whoever sent this can now schedule it."
      : input.action === "request_changes"
        ? "Sent back with your note. They will see it straight away."
        : "Rejected, with your note attached.",
  };
}

export const PORTAL_DOCTRINE = [
  "A link opens exactly one item. Not a brand, not a queue, not a session — so even a leaked link exposes only the asset it was minted for.",
  "Without a durable secret, no link is issued at all. A per-process key mints links that verify on one server and fail on every other, and the agency looks broken to their own customer.",
  "The only actions are approve, request changes and reject — the same permissions the client workspace role holds, because it is the same person.",
  "Decisions go through the shared approval state machine, so an illegal move is refused for a client exactly as it is in the dashboard.",
  "Signature comparison is constant time, and the fields are in the clear: a support conversation can read what a link is for without anybody pasting a working credential into a chat window.",
];

/** Test seam. Never called by product code. */
export function __resetPortal(): void { revoked.clear(); }
