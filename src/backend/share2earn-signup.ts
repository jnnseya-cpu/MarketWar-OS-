// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR OS — THE SHARE2EARN DOOR.
//
// The creator programme and SHARE2EARN are ONE account and ONE payout path with
// TWO doors, and the difference between the doors is the whole point:
//
//   /growth  → APPLICATION. You state an audience, we score it, a follower
//              count gets verified, and verification is what unlocks the 1% and
//              0.75% influencer bands. It is reviewed because it pays more.
//
//   /share2earn → JOIN. Name and email. No application, no follower count, no
//              audience test, no review queue, no waiting. You are on the
//              SHARE2EARN band from the first second, which pays 0.5% of the
//              eligible net value of verified sales.
//
// THE SAFETY PROPERTY THIS MODULE EXISTS TO HOLD: the instant door cannot mint
// an influencer band. It does not accept a follower count — not "ignores one if
// supplied", but has no parameter for one — so there is no number for a later
// change to start trusting. Somebody who joins here and then grows an audience
// applies at /growth like anyone else and has it verified; the account they
// already have is the account that gets upgraded.
//
// Everything downstream is deliberately shared: the same CreatorAccount, the
// same tracked-code scheme, the same identity gate, the same single
// `executePayout`. Two doors, one building. The one thing this codebase has
// learned the hard way is that a second path for money is always the weaker
// path, and this module is careful not to be one.

import { upsertCreator, getCreator, creatorId as creatorIdFor, type CreatorAccount } from "@/backend/creator-engine";
import { bandForFollowers, ratePct, SHARE2EARN_RATE, type CommissionBand } from "@/shared/creator-program";

const EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

export type JoinResult =
  | {
      ok: true;
      creatorId: string;
      band: CommissionBand;
      alreadyRegistered: boolean;
      /** Only ever present for a BRAND-NEW account. See the note below. */
      dashboardUrl?: string;
      message: string;
      next: string[];
      /** Whether the dashboard link actually left the machine. Never assumed. */
      emailed: boolean;
      /** Why it did not, when it did not — shown rather than swallowed. */
      emailProblem?: string;
    }
  | { ok: false; error: string; field?: "name" | "email" };

/**
 * Join SHARE2EARN.
 *
 * Note the signature: `name` and `email`, and nothing else. There is no
 * `followers`, no `audience`, no `tier`. That is not an omission — the band a
 * new joiner lands on has to be SHARE2EARN by construction rather than by a
 * check somewhere that could be relaxed, and the way to guarantee it is to
 * never let the number into the function.
 */
import { sendEmail } from "@/backend/email";
import { siteOrigin } from "@/shared/site";

// THE EMAIL THIS FORM SAID IT HAD SENT.
//
// joinShare2Earn returned "We have sent your dashboard link to <address>" and
// contained no call to the mailer at all. The same sentence is the ONLY route
// back for a returning partner, because the form deliberately refuses to print
// an existing account's token to whoever typed the address — so the security
// rule and the missing send combined into a locked door. A new joiner got no
// welcome either, and /partner tells them to "check the email from when you
// applied".
//
// It sends now, and — the part that matters more — the message it returns is
// derived from what the send ACTUALLY did. `sendEmail` reports honestly when no
// sending server is configured, and this must not paper over that: claiming a
// delivery is how the whole platform lost the customer's trust once already.
async function sendDashboardLink(to: string, name: string, url: string, isNew: boolean) {
  const link = `${siteOrigin()}${url}`;
  return sendEmail({
    to,
    // Transactional: this is account access. It must survive an emergency stop,
    // for the same reason a password reset does.
    transactional: true,
    subject: isNew ? "Your Share2Earn dashboard" : "Your Share2Earn dashboard link",
    html: `<p>Hello ${escapeHtml(name) || "there"},</p>`
      + (isNew
        ? `<p>You are in the network. This link is your dashboard and your earnings — keep it, it is the way back in.</p>`
        : `<p>You are already in the network, so nothing new was created. Here is the link to your existing dashboard.</p>`)
      + `<p><a href="${link}">${link}</a></p>`
      + `<p>Anyone with this link can see your earnings, so treat it like a password.</p>`,
  });
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function joinShare2Earn(input: { name: string; email: string; nowISO: string }): Promise<JoinResult> {
  const name = (input.name || "").trim().slice(0, 120);
  const email = (input.email || "").trim().toLowerCase();
  if (!name) return { ok: false, error: "Add your name — a brand pays a person, not an address.", field: "name" };
  if (!EMAIL.test(email)) return { ok: false, error: "Add an email we can reach you on.", field: "email" };

  const id = creatorIdFor(email);
  const existing = await getCreator(id);

  // SECURITY: this is a PUBLIC, unauthenticated form and an existing partner's
  // access token is the credential to their dashboard and their money. Typing
  // somebody else's email into a join form must not print their token. Only a
  // brand-new account gets a link inline; an existing one is told to check the
  // inbox that already owns it. (The /growth application holds the same rule —
  // both doors, because one door that leaks is a leak.)
  let account: CreatorAccount | null = existing;
  let dashboardUrl: string | undefined;
  if (!existing) {
    account = await upsertCreator({
      name,
      email,
      tier: "promoter",
      // Zero, unverified, always. Nothing a joiner types can move this.
      followers: 0,
      followersVerified: false,
      nowISO: input.nowISO,
    });
    dashboardUrl = account.accessToken ? `/partner?t=${account.accessToken}` : undefined;
  }

  const band = bandFor(account);

  // The link that goes in the email. A returning partner's token is not printed
  // in the response, so for them the inbox is the only route — which is exactly
  // why the send has to be real, and why a failure has to be said out loud.
  const linkPath = dashboardUrl
    || (existing?.accessToken ? `/partner?t=${existing.accessToken}` : undefined);
  const sent = linkPath ? await sendDashboardLink(email, name, linkPath, !existing) : null;
  const delivered = Boolean(sent?.ok);

  const joinedLine = `You are in. No application, no follower count, no wait. You earn ${ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale your link produces, from your first one.`;

  return {
    ok: true,
    creatorId: id,
    band,
    alreadyRegistered: Boolean(existing),
    ...(dashboardUrl ? { dashboardUrl } : {}),
    emailed: delivered,
    ...(sent && !sent.ok ? { emailProblem: sent.detail || "The email could not be sent." } : {}),
    message: existing
      ? (delivered
        ? `You are already in the network, so nothing was created. We have sent your dashboard link to ${email} — for your security a public form never shows an existing account's link.`
        // NOT "we have sent". The link is deliberately withheld from a public
        // form, so with no mail there is no route: say so plainly rather than
        // leaving somebody waiting for a message that is not coming.
        : `You are already in the network, so nothing was created. Your dashboard link could NOT be emailed just now, and for your security a public form never shows an existing account's link — so contact support to get back in.`)
      : (delivered
        ? `${joinedLine} Your dashboard link is on its way to ${email}.`
        : `${joinedLine} We could not email your dashboard link, so save the one on this page — it is how you get back in.`),
    next: [
      "Pick something to promote — a brand's mission, or any product in an open catalogue.",
      "Post it your way, with the AI-content disclosure where it applies. We pay on verified sales, not on reach, so nothing depends on your follower count.",
      "Earnings settle after the hold, then you verify your identity once and withdraw to the rail you choose, wherever you are.",
      `Grown an audience since? Apply at /growth to have it verified — 5,000 verified followers moves this same account to ${ratePct(0.0075)}, and 10,000 to ${ratePct(0.01)}.`,
    ],
  };
}

/**
 * The band an account is actually on.
 *
 * Kept here as one line so no surface guesses: an unverified count is a claim,
 * and a claim never pays an influencer rate.
 */
export function bandFor(account: CreatorAccount | null): CommissionBand {
  return bandForFollowers({
    followers: account?.followers || 0,
    verified: Boolean(account?.followersVerified),
    onCreatorProgramme: Boolean(account?.followersVerified),
  });
}

export const JOIN_DOCTRINE = [
  "SHARE2EARN has no gate. Name, email, and you are earning — because a programme that pays 0.5% cannot justify a review queue, and telling somebody they are too small to earn is how you lose the person who was about to be big.",
  "The influencer bands DO have a gate, and it is the same gate as before: an application, a scored audience, and a verified follower count. They pay more, so they are checked more.",
  "One account either way. Joining here and applying later upgrades the account you already have — nobody starts again, and nothing already earned is lost.",
  "The instant door cannot issue an influencer rate. It does not take a follower count at all, so there is no unverified number anywhere in it for a later change to start believing.",
  "Both doors end at the same payout: the same identity check before the first withdrawal, the same fee quote, the same single execution path.",
];
