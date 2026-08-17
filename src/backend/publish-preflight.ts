// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// EVERYTHING THAT COULD HAVE BEEN KNOWN BEFORE THE POST WENT OUT.
//
// The eight checks the spec names, run in one place before anything is
// enqueued. Each of them exists because the alternative is finding out from the
// platform's error message after the fact — or worse, not finding out, because
// the post went out at 3am with a 3,000-character caption truncated to 280 and
// a claim in it the brand cannot substantiate.
//
// THIS MODULE VALIDATES. IT DOES NOT DUPLICATE.
//
// The policy check calls `claim-guard.ts`, which already scans generated output
// for unevidenced statistics, invented testimonials and absolute claims and
// already runs on every agent result. The connection check calls
// `connection-health.ts`. Neither is reimplemented here — the development rule
// is explicit that an existing feature is extended rather than copied, and a
// second compliance scanner under a different name is how two of them end up
// disagreeing.
//
// THE ONE THING THIS GETS RIGHT THAT MOST PREFLIGHTS GET WRONG.
//
// A check that CANNOT RUN is not a check that passed.
//
// Aspect ratio cannot be judged without the image's dimensions. Approval cannot
// be judged if the caller did not say whether it was approved. A preflight that
// reports "8 of 8 passed" while three of them silently did nothing is worse than
// no preflight, because it converts ignorance into a green tick somebody then
// relies on. So every check returns pass, fail, or `cannot_check` with the
// reason it could not, and the summary counts all three.

import { claimReport } from "@/backend/claim-guard";
import { channelHealth, type ChannelHealth } from "@/backend/connection-health";

export const CHECKS = [
  "connection", "permissions", "asset", "aspect_ratio",
  "caption", "policy", "approval", "schedule",
] as const;
export type CheckId = (typeof CHECKS)[number];

export type Verdict = "pass" | "fail" | "needs_review" | "cannot_check";

export type CheckResult = {
  id: CheckId;
  /**
   * `needs_review` exists because the spec is explicit: flag uncertain content
   * rather than silently publishing it. A warning-level claim does not block —
   * blocking would refuse posts that go out today — but it is not a pass
   * either, and reporting it as one is how "we scanned it" becomes meaningless.
   */
  verdict: Verdict;
  /** What was found. Always specific enough to act on. */
  detail: string;
  /** Present when the verdict is fail. */
  fix?: string;
};

/**
 * What each platform actually publishes as its own limits.
 *
 * These are the platforms' documented values, not our guesses, and they change
 * — which is why a caption two characters under the limit is reported as a
 * warning-free pass rather than the module pretending to precision it does not
 * have. `mediaRequired` is the one that silently wastes people's time: an
 * Instagram or TikTok post with no image simply cannot exist.
 */
export const PLATFORM_LIMITS: Record<string, {
  captionMax: number;
  mediaRequired: boolean;
  /** Feed aspect ratios the platform accepts, as width ÷ height. */
  aspectMin?: number;
  aspectMax?: number;
  hashtagMax?: number;
}> = {
  facebook:  { captionMax: 63_206, mediaRequired: false },
  instagram: { captionMax: 2_200,  mediaRequired: true, aspectMin: 0.8, aspectMax: 1.91, hashtagMax: 30 },
  tiktok:    { captionMax: 2_200,  mediaRequired: true, aspectMin: 0.5, aspectMax: 1.0 },
  x:         { captionMax: 280,    mediaRequired: false },
  linkedin:  { captionMax: 3_000,  mediaRequired: false },
  youtube:   { captionMax: 5_000,  mediaRequired: true },
};

export type PreflightInput = {
  channel: string;
  text: string;
  mediaUrls?: string[];
  /** Width and height of the primary image, when the caller knows them. Absent means the ratio cannot be judged. */
  mediaDimensions?: { width: number; height: number };
  /** Whether a connection record exists. The caller owns that lookup. */
  connected: boolean;
  health?: ChannelHealth;
  /** Approval state, when the caller knows it. `undefined` means unknown, which is not "approved". */
  approved?: boolean;
  approvalRequired?: boolean;
  /** ISO time this is scheduled for. Absent means publish now. */
  scheduledAt?: string;
  nowISO?: string;
  /** Anything the CUSTOMER supplied, so a figure they gave us is not flagged as invented. */
  suppliedFacts?: string;
};

export type PreflightResult = {
  /** True only when nothing failed. A check that could not run never makes this true on its own. */
  ok: boolean;
  checks: CheckResult[];
  failed: CheckId[];
  /** Ran, found something a person should look at, and did not block. */
  review: CheckId[];
  unchecked: CheckId[];
  /** One sentence, honest about all three outcomes. */
  summary: string;
};

const ok = (id: CheckId, detail: string): CheckResult => ({ id, verdict: "pass", detail });
const no = (id: CheckId, detail: string, fix: string): CheckResult => ({ id, verdict: "fail", detail, fix });
const cant = (id: CheckId, detail: string): CheckResult => ({ id, verdict: "cannot_check", detail });
const review = (id: CheckId, detail: string, fix: string): CheckResult => ({ id, verdict: "needs_review", detail, fix });

/** Every check the spec names, in order, before anything is enqueued. */
export function preflight(input: PreflightInput): PreflightResult {
  const channel = (input.channel || "").toLowerCase();
  const limits = PLATFORM_LIMITS[channel];
  const text = input.text || "";
  const media = (input.mediaUrls || []).filter((u) => /^https?:\/\//i.test(u));
  const health = input.health ?? channelHealth({ channel, connected: input.connected });
  const checks: CheckResult[] = [];

  // 1. CONNECTION
  checks.push(
    health.state === "disconnected"
      ? no("connection", `${channel} is not connected.`, `Connect ${channel} in the Integration Hub.`)
      : health.state === "unknown"
        ? cant("connection", `Nothing is recorded about ${channel} either way.`)
        : ok("connection", health.note),
  );

  // 2. PERMISSIONS — from what the channel actually said, not from a scope list
  // we hold, which can be right while the account's is not.
  checks.push(
    health.faults.includes("insufficient_permission")
      ? no("permissions", `${channel} has refused a recent post for a permissions reason.`, health.fix || "Reconnect and grant publishing permission.")
      : health.faults.includes("expired_token")
        ? no("permissions", `The stored ${channel} access token is no longer valid.`, health.fix || "Reconnect the account.")
        : health.state === "disconnected"
          ? cant("permissions", "Not connected, so there is nothing to check permissions on.")
          : ok("permissions", "No permission or token failure has been recorded for this channel."),
  );

  // 3. ASSET — the one that silently wastes an afternoon.
  checks.push(
    !limits
      ? cant("asset", `No published limits are held for "${channel}", so what it requires is unknown.`)
      : limits.mediaRequired && media.length === 0
        ? no("asset", `${channel} does not accept text-only posts.`, "Attach an image or video before publishing.")
        : (input.mediaUrls || []).length > media.length
          ? no("asset", "Some attached media are previews rather than uploaded files, and no platform can fetch those.", "Upload the media so it has a public https address.")
          : ok("asset", media.length ? `${media.length} media item${media.length === 1 ? "" : "s"} attached.` : "No media needed for this channel."),
  );

  // 4. ASPECT RATIO — the check that must never pretend.
  if (!limits?.aspectMin || !limits?.aspectMax) {
    checks.push(cant("aspect_ratio", `No feed ratio range is held for ${channel}.`));
  } else if (!input.mediaDimensions) {
    checks.push(cant("aspect_ratio", "The image's dimensions were not supplied, so the ratio cannot be judged. This is unknown, not acceptable."));
  } else {
    const { width, height } = input.mediaDimensions;
    const ratio = height > 0 ? width / height : 0;
    checks.push(
      ratio >= limits.aspectMin && ratio <= limits.aspectMax
        ? ok("aspect_ratio", `${width}×${height} is ${ratio.toFixed(2)}:1, inside what ${channel} accepts.`)
        : no("aspect_ratio",
            `${width}×${height} is ${ratio.toFixed(2)}:1. ${channel} accepts ${limits.aspectMin}:1 to ${limits.aspectMax}:1, so it would be cropped or refused.`,
            "Re-export at an accepted ratio — the ad canvas does every placement size."),
    );
  }

  // 5. CAPTION
  if (!limits) {
    checks.push(cant("caption", `No published caption limit is held for "${channel}".`));
  } else if (!text.trim()) {
    checks.push(no("caption", "There is no caption.", "Write a caption, or confirm the post is intentionally silent."));
  } else if (text.length > limits.captionMax) {
    checks.push(no("caption", `The caption is ${text.length} characters and ${channel} allows ${limits.captionMax}.`, `Cut ${text.length - limits.captionMax} characters — the platform will truncate mid-sentence otherwise.`));
  } else {
    const tags = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
    checks.push(
      limits.hashtagMax && tags > limits.hashtagMax
        ? no("caption", `${tags} hashtags — ${channel} allows ${limits.hashtagMax}.`, `Remove ${tags - limits.hashtagMax}. Over the limit the platform can reject the whole caption.`)
        : ok("caption", `${text.length} of ${limits.captionMax} characters${tags ? `, ${tags} hashtags` : ""}.`),
    );
  }

  // 6. POLICY — the existing scanner, not a second one.
  const claims = claimReport(text, input.suppliedFacts || "");
  checks.push(
    claims.blocking > 0
      ? no("policy", `${claims.summary}`, "Remove or substantiate the flagged claim. Publishing it is the brand's liability, not the platform's.")
      : claims.warnings > 0
        ? review("policy", claims.summary, "Read the flagged lines before this goes out. Nothing is blocked — a figure or a superlative you can defend is fine, one you cannot is the brand's liability.")
        : ok("policy", "Nothing in the caption was flagged as an unevidenced or absolute claim."),
  );

  // 7. APPROVAL — unknown is not approved.
  checks.push(
    input.approvalRequired === false
      ? ok("approval", "This channel does not require approval at the current autonomy level.")
      : input.approved === true
        ? ok("approval", "Approved.")
        : input.approved === false
          ? no("approval", "This has not been approved.", "Approve it in Collaboration & Approvals, or lower the approval requirement for this channel.")
          : cant("approval", "The caller did not say whether this was approved, and unknown is not approval."),
  );

  // 8. SCHEDULE
  const now = Date.parse(input.nowISO || new Date().toISOString());
  if (!input.scheduledAt) {
    checks.push(ok("schedule", "Publishing immediately."));
  } else {
    const when = Date.parse(input.scheduledAt);
    checks.push(
      !Number.isFinite(when)
        ? no("schedule", `"${input.scheduledAt}" is not a time that can be read.`, "Supply an ISO timestamp.")
        : when < now
          ? no("schedule", `Scheduled for ${input.scheduledAt}, which is in the past.`, "Pick a future time, or publish now.")
          : when > now + 365 * 24 * 60 * 60 * 1000
            ? no("schedule", `Scheduled more than a year out (${input.scheduledAt}).`, "Check the date — this is almost always a typo in the year.")
            : ok("schedule", `Scheduled for ${input.scheduledAt}.`),
    );
  }

  const failed = checks.filter((c) => c.verdict === "fail").map((c) => c.id);
  const needsReview = checks.filter((c) => c.verdict === "needs_review").map((c) => c.id);
  const unchecked = checks.filter((c) => c.verdict === "cannot_check").map((c) => c.id);
  const passed = checks.length - failed.length - needsReview.length - unchecked.length;

  const caveats = [
    needsReview.length ? `${needsReview.length} needs a look (${needsReview.join(", ")})` : "",
    unchecked.length ? `${unchecked.length} could not be run (${unchecked.join(", ")}) — that is unknown, not clear` : "",
  ].filter(Boolean);

  return {
    ok: failed.length === 0,
    checks, failed, review: needsReview, unchecked,
    summary: failed.length
      ? `${failed.length} of ${checks.length} checks failed: ${failed.join(", ")}. Nothing was enqueued.`
      : caveats.length
        ? `${passed} checks passed; ${caveats.join("; ")}.`
        : `All ${checks.length} checks passed.`,
  };
}

export const PREFLIGHT_DOCTRINE = [
  "Uncertain content is flagged for review, never published silently. A warning-level claim does not block — blocking would refuse posts that go out today — but it is not a pass either.",
  "A check that cannot run is not a check that passed. Reporting eight of eight while three did nothing converts ignorance into a green tick somebody then relies on.",
  "The policy check calls the claim guard that already runs on every agent output. A second compliance scanner under a different name is how two of them end up disagreeing.",
  "Permissions are read from what the channel actually refused, not from a scope list we hold — ours can be right while the account's is not.",
  "Unknown approval is not approval. The caller either says it was approved or the check reports that nobody said.",
  "Platform limits are the platforms' own published values and they change. They are stated as what was checked, never as a guarantee of acceptance.",
];
