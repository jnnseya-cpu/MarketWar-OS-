// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT THIS DEPLOYMENT CAN ACTUALLY DO, RIGHT NOW.
//
// The owner's report was that the features do not work and produce nothing a
// customer can see. Walking it found the mechanism, and it is not subtle:
//
//   `demoFallbackAllowed()` returns false in production. So on a live
//   deployment with no AI provider key, every generative surface fails. Four
//   modules say "Live AI is activating — please retry in a moment", which
//   implies a passing glitch and is not true; the rest throw "No AI provider
//   configured", which is a developer's sentence in a customer's face.
//
//   Either way the person clicks, waits, gets nothing, retries because they
//   were told to, gets nothing again, and concludes the product is broken.
//   For them it is.
//
// `launch-check.ts` has known this the whole time and says it perfectly — "the
// thing customers are paying for does not exist on this deployment" — behind a
// JSON health endpoint that nobody opens.
//
// THIS MODULE'S JOB IS THE OTHER HALF: making the product refuse work it cannot
// finish, BEFORE somebody does the work. A capability is either live or it is
// dark; if it is dark, every surface that depends on it says so up front, says
// what still works without it, and says the one action that lights it up.
//
// The rule this encodes, which the platform should never have needed telling:
// never take somebody's effort for an outcome you cannot deliver.

import { readLaunchEnv } from "@/backend/launch-check";
import { configuredProviders } from "@/backend/gateway";
import { adminConfigured } from "@/backend/firebase-admin";
// ASK THE MODULE THAT OWNS THE CAPABILITY. Never guess its env vars.
//
// The first version of this file guessed, and got two of seven wrong. It looked
// for a pair of plausible-sounding render and mail variables that nothing in
// this codebase reads, while the video gateway actually runs on the Gemini or
// OpenAI key and mail readiness is decided by the sending pool. So on a
// deployment where video WORKED, this report called it dark and told the
// operator to set a variable no code path consults.
//
// That is worse than having no report at all, and it is this codebase's
// recurring defect wearing another hat: a value that exists on one side of a
// boundary and is never carried across. The fix is not a better guess — it is
// to stop guessing and call the module's own check. A test asserts that every
// variable this file names is one that `src` actually reads.
import { videoGatewayConfigured } from "@/backend/video-gateway";
import { emailIsConfigured } from "@/backend/email";

export type CapabilityId =
  | "ai_generation"
  | "payments"
  | "persistence"
  | "email_sending"
  | "image_generation"
  | "video_render"
  | "scheduling";

export type Capability = {
  id: CapabilityId;
  label: string;
  /** What a customer loses when this is dark, in their words. */
  whenDark: string;
  /** What still genuinely works without it. Never "nothing" if that is a lie. */
  stillWorks: string;
  /** The ONE action that turns it on. */
  oneAction: string;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "ai_generation",
    label: "AI writing and strategy",
    whenDark: "Every surface that writes, plans or analyses returns an error instead of work — the agents, the campaign builder, the content engine, the strategy documents.",
    stillWorks: "The free website audit, the ad canvas, all the pricing and margin arithmetic, the acquisition run, the payout engine, and every check that measures rather than generates. Those are real and they need no key.",
    oneAction: "Set ANTHROPIC_API_KEY (or OPENAI_API_KEY, or GEMINI_API_KEY) in the deployment's environment and redeploy.",
  },
  {
    id: "payments",
    label: "Taking money",
    whenDark: "Choosing a paid plan fails. Nobody can buy anything, so the platform cannot earn.",
    stillWorks: "Free signup, the whole demo, and every engine a free plan includes.",
    oneAction: "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, and redeploy.",
  },
  {
    id: "persistence",
    label: "Saving work between visits",
    whenDark: "Everything a customer makes lives in one server's memory and disappears on the next deploy or restart. They will do the work twice and blame themselves the first time.",
    stillWorks: "The full product within a single session — nothing is refused, it simply is not kept.",
    oneAction: "Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, and redeploy.",
  },
  {
    id: "email_sending",
    label: "Sending email",
    whenDark: "Nothing this platform writes can be delivered to anybody. Campaigns compose and never send, and the free audit's report cannot be emailed.",
    stillWorks: "Every message is still produced in full and can be copied out and sent from your own inbox — which for the first fifty is what you should do anyway.",
    oneAction: "Either configure the sending pool (MW_SENDING_HOST and the pool variables) with its DNS verified, or set RESEND_API_KEY or SENDGRID_API_KEY. `emailIsConfigured()` in src/backend/email.ts is the check that decides.",
  },
  {
    id: "image_generation",
    label: "Generating images",
    whenDark: "Nothing can have artwork generated for it, so an ad brief that expects a produced image comes back empty.",
    stillWorks: "The ad canvas takes your own photograph, lays out every placement, and exports a PNG you can post — which is what most small businesses should use regardless.",
    oneAction: "Set an image-capable provider key (OPENAI_API_KEY or GEMINI_API_KEY) and redeploy.",
  },
  {
    id: "video_render",
    label: "Rendering video",
    // Corrected after walking it. The gateway does NOT hang or queue a job
    // that never finishes — it returns a job marked `demo` with an honest note
    // saying the pipeline is wired and only the render engine is gated. Saying
    // otherwise here would have been this report inventing a fault.
    whenDark: "A render request comes back immediately marked as a demo rather than producing a file, so there is no MP4 to attach to a post or upload anywhere.",
    stillWorks: "The whole pipeline around it: scripts, shot lists, captions, the clip finder and the job model. Nothing hangs and nothing is left queued — the render is the only gated step.",
    oneAction: "Set GEMINI_API_KEY for Veo or OPENAI_API_KEY for Sora, and redeploy. `videoGatewayConfigured()` in src/backend/video-gateway.ts is the check that decides.",
  },
  {
    id: "scheduling",
    label: "Running work on a schedule",
    whenDark: "Nothing runs overnight. Autopilot, the nightly reports and the scheduled publishing never fire.",
    stillWorks: "Every one of those jobs can be run by hand from its own screen.",
    oneAction: "Set CRON_SECRET and redeploy so the scheduler can be recognised.",
  },
];

export type CapabilityState = Capability & { live: boolean; because: string };

/**
 * Which capabilities are live on THIS deployment.
 *
 * Reads the environment rather than a config file, because the environment is
 * what actually decides. No key values are returned, only whether each one is
 * present — this report is safe to show a signed-in customer, and it should be
 * shown to them, because "this deployment cannot do X" is information they are
 * entitled to before they spend an evening on it.
 */
export function capabilityStates(env: NodeJS.ProcessEnv = process.env): CapabilityState[] {
  const l = readLaunchEnv(env);
  const providers = configuredProviders();
  const anyAi = providers.length > 0;
  const imageCapable = Boolean((env.OPENAI_API_KEY || "").trim() || (env.GEMINI_API_KEY || "").trim());
  const emailReady = emailIsConfigured();
  const videoReady = videoGatewayConfigured();

  const state = (id: CapabilityId, live: boolean, because: string): CapabilityState => {
    const c = CAPABILITIES.find((x) => x.id === id)!;
    return { ...c, live, because };
  };

  return [
    state("ai_generation", anyAi, anyAi
      ? `${providers.length} provider${providers.length === 1 ? "" : "s"} configured: ${providers.join(", ")}.`
      : "No AI provider key is set on this deployment."),
    state("payments", Boolean(l.stripeSecretKey && l.stripeWebhookSecret), l.stripeSecretKey
      ? (l.stripeWebhookSecret ? "Stripe key and webhook secret are both set." : "A Stripe key is set but the webhook secret is not, so a payment would be taken and nothing credited.")
      : "No Stripe key is set."),
    state("persistence", Boolean(adminConfigured), adminConfigured
      ? "Firebase Admin is configured, so work is saved."
      : "Firebase Admin is not configured, so everything lives in one server's memory."),
    state("email_sending", emailReady, emailReady ? "A sending provider key is set." : "No email provider key is set."),
    state("image_generation", imageCapable, imageCapable ? "An image-capable provider is configured." : "No image-capable provider key is set."),
    state("video_render", videoReady, videoReady ? "A render provider key is set." : "No render provider key is set."),
    state("scheduling", Boolean(l.cronSecret), l.cronSecret ? "CRON_SECRET is set, so the scheduler can be recognised." : "CRON_SECRET is not set, so no caller can be recognised as the scheduler."),
  ];
}

export const isLive = (id: CapabilityId, env: NodeJS.ProcessEnv = process.env): boolean =>
  capabilityStates(env).find((c) => c.id === id)?.live === true;

/**
 * The honest sentence when a generative surface cannot run.
 *
 * It replaces "Live AI is activating — please retry in a moment", which was
 * wrong in the way that matters: it describes a transient condition, so the
 * customer retries, gets it again, and concludes the product is broken. A
 * missing key is not a glitch and telling somebody to wait it out wastes their
 * evening.
 *
 * The two cases are genuinely different and are worded differently:
 *   • no key at all — nothing to wait for, and here is what still works.
 *   • keys present, the call failed — a real transient, retry is genuine advice.
 */
export function aiUnavailableMessage(env: NodeJS.ProcessEnv = process.env): string {
  if (configuredProviders().length > 0) {
    return "Every AI provider on this deployment failed or timed out on that request. That is usually brief — try it again in a minute. Nothing was charged.";
  }
  const cap = CAPABILITIES.find((c) => c.id === "ai_generation")!;
  return [
    "This deployment has no AI provider configured, so nothing that writes or plans can run here. That is a missing setting rather than a fault, and retrying will not change it.",
    `What still works without it: ${cap.stillWorks}`,
    "Nothing was charged.",
  ].join(" ");
}

/** One line for the owner: how much of the product actually exists right now. */
export function capabilitySummary(env: NodeJS.ProcessEnv = process.env): { live: number; total: number; dark: CapabilityId[]; headline: string } {
  const states = capabilityStates(env);
  const dark = states.filter((s) => !s.live);
  const live = states.length - dark.length;
  return {
    live, total: states.length,
    dark: dark.map((d) => d.id),
    headline: dark.length === 0
      ? "Every capability on this deployment is live."
      : dark.some((d) => d.id === "ai_generation")
        ? `${live} of ${states.length} capabilities are live, and AI generation is not one of them — which is most of what a customer is paying for. ${CAPABILITIES.find((c) => c.id === "ai_generation")!.oneAction}`
        : `${live} of ${states.length} capabilities are live. Dark: ${dark.map((d) => d.label).join(", ")}.`,
  };
}

export const CAPABILITY_DOCTRINE = [
  "Never take somebody's effort for an outcome you cannot deliver. A surface that depends on a dark capability says so before the work, not after it.",
  "A missing key is not a transient failure and must never be described as one. Telling a customer to retry something that cannot succeed costs them their evening and costs us their trust.",
  "'Nothing works' is almost always false and saying it is its own kind of dishonesty. The audit, the ad canvas, the margin arithmetic and the payout engine need no key at all — a dark capability names what still works beside what does not.",
  "This report is safe to show a signed-in customer and should be. Whether the deployment they are using can do the thing they are about to attempt is information they are entitled to.",
];
