// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// GOOGLE POSTMASTER TOOLS — what Gmail thinks of the sending domain.
//
// THE OTHER HALF OF INBOX PLACEMENT, and the half that needs volume.
//
//   The seed probe (§140) measures where ONE message landed in mailboxes we
//   own. It works at any volume, and it measures how Gmail treats a STRANGER,
//   because a seed mailbox has no history with us.
//
//   This measures the opposite: what Gmail concluded about the DOMAIN from
//   everything it actually delivered to real people who did real things with it.
//   Reputation, complaint rate, and the authentication percentages that are the
//   only part entirely ours to fix.
//
// Both are needed and neither substitutes for the other, which is why this is a
// separate module rather than a field on the probe.
//
// WHAT IT NEEDS, AND WHY THAT IS MORE THAN A KEY.
//
// The API only answers for domains REGISTERED AND VERIFIED in Postmaster Tools
// by the account asking, and Google has no API for registering one — it is a
// page you visit and a DNS record you publish, once per domain. So a missing
// domain is reported as a missing REGISTRATION with the address to do it at,
// never as bad data.
//
// Reuses `getGoogleAccessToken`, which already mints from either a service
// account or a connected OAuth user, rather than adding a second way to obtain a
// Google token.

import { getGoogleAccessToken, googleConfigured } from "@/backend/google-auth";
import { readTrafficStats, postmasterVerdict, type PostmasterVerdict } from "@/shared/postmaster";

const API = "https://gmailpostmastertools.googleapis.com/v1";

/** Read-only, and that is the only scope this ever needs. */
export const POSTMASTER_SCOPE = "https://www.googleapis.com/auth/postmaster.readonly";

/** The domain we send from, which is the domain Gmail judges. */
export function sendingDomain(): string {
  const from = (process.env.EMAIL_FROM || "").trim();
  const inAngle = /<([^>]+)>/.exec(from)?.[1] || from;
  const domain = (inAngle.split("@")[1] || "").trim().toLowerCase();
  return domain.replace(/[>\s]+$/, "");
}

export type PostmasterStatus = {
  configured: boolean;
  domain: string;
  /** Why it cannot run, in one sentence. Empty when it can. */
  blocker: string;
};

export function postmasterStatus(): PostmasterStatus {
  const domain = sendingDomain();
  if (!googleConfigured()) {
    return { configured: false, domain, blocker:
      "No Google credential on this deployment. Postmaster needs a service account or a connected Google account — "
      + "the same credential Search Console already uses." };
  }
  if (!domain) {
    return { configured: false, domain, blocker:
      "EMAIL_FROM is not set, so there is no sending domain to ask about." };
  }
  return { configured: true, domain, blocker: "" };
}

type Fetched = { ok: true; rows: Record<string, unknown>[] } | { ok: false; status: number; error: string };

async function getJson(path: string, token: string): Promise<Fetched> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body.error as Record<string, unknown> | undefined) ?? {};
      return { ok: false, status: res.status, error: String(err.message || res.statusText || "unknown") };
    }
    const rows = Array.isArray(body.trafficStats) ? body.trafficStats as Record<string, unknown>[] : [];
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export type PostmasterReading =
  | { ok: true; verdict: PostmasterVerdict }
  | { ok: false; reason: string; fix: string };

/**
 * Read the last `days` of traffic stats for the sending domain.
 *
 * NOTHING IS INVENTED WHEN GOOGLE SAYS NOTHING. An empty `trafficStats` array is
 * the normal answer for a domain below the reporting threshold, and it is passed
 * straight to `postmasterVerdict`, which reports it as an absence with the
 * reason — never as zero complaints and a LOW reputation, which is the most
 * alarming reading available and would be manufactured out of an empty response.
 */
export async function readPostmaster(days = 30): Promise<PostmasterReading> {
  const st = postmasterStatus();
  if (!st.configured) {
    return { ok: false, reason: st.blocker, fix: "See docs/POSTMASTER.md." };
  }
  const token = await getGoogleAccessToken(POSTMASTER_SCOPE);
  if (!token) {
    return {
      ok: false,
      reason: "A Google credential is configured but no access token could be minted for the Postmaster scope.",
      fix: `The scope ${POSTMASTER_SCOPE} has to be granted to the credential. For a service account that is `
        + "domain-wide delegation; for a connected account, reconnect it so the new scope is consented.",
    };
  }

  const res = await getJson(`/domains/${encodeURIComponent(st.domain)}/trafficStats?pageSize=${Math.max(1, Math.min(100, days))}`, token);
  if (!res.ok) {
    // 403 AND 404 MEAN DIFFERENT THINGS AND HAVE DIFFERENT FIXES. Collapsing
    // them into "could not read Postmaster" is the wrong-remedy defect this
    // repository keeps paying for.
    if (res.status === 404) {
      return {
        ok: false,
        reason: `${st.domain} is not registered in Postmaster Tools, so Google holds no report for it.`,
        fix: `Register it once at https://postmaster.google.com/managedomains — it asks for a TXT record, the same way `
          + "domain verification works elsewhere. There is no API for this step.",
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        reason: `Google refused the request for ${st.domain}: ${res.error}`,
        fix: "The account asking must be one the domain is VERIFIED under in Postmaster Tools, and the Postmaster API "
          + "must be enabled on the Cloud project the credential belongs to.",
      };
    }
    return { ok: false, reason: `Postmaster answered ${res.status}: ${res.error}`, fix: "" };
  }

  return { ok: true, verdict: postmasterVerdict(st.domain, res.rows.map(readTrafficStats)) };
}
