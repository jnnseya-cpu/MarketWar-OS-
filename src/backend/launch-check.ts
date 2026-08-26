// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Are we actually safe to be public?
//
// /api/health/live already answers "which capabilities are wired", one variable
// at a time, and that list is genuinely useful. It cannot answer the question
// that matters the morning of a launch, because every dangerous state in this
// platform is a COMBINATION — each half looks fine on its own:
//
//   • A live Stripe key is good. No webhook secret is survivable. Together they
//     take a customer's £199 and credit them nothing: charged, and served
//     nothing, with no error anywhere for either side to see.
//   • Firebase Admin configured is good. No encryption key is survivable in
//     demo. Together, every PII write is refused fail-closed — correct, and
//     completely silent, because the callers are fire-and-forget. The customer's
//     agent history simply never exists.
//   • A test Stripe key is right for a rehearsal and wrong for a launch, and
//     nothing distinguishes those two situations except intent.
//
// So this reports CONSEQUENCES, not variables: what breaks, for whom, and what
// to set. A blocker means a real person gets hurt — money taken with nothing
// delivered, data lost, a promise in the Terms that the running code does not
// keep. A warning means something the owner should know before the doors open
// but that harms nobody on its own.
//
// It reads booleans out of process.env and NEVER a value. Nothing here can
// leak a key, and it makes no network calls — /api/health/stripe already probes
// Stripe properly, and a pre-flight that spends money or hangs is not one.

export type Severity = "blocker" | "warning" | "ok";

export type LaunchFinding = {
  id: string;
  severity: Severity;
  title: string;
  /** What actually happens to a real person if this ships as-is. */
  consequence: string;
  /** The exact thing to set or do. */
  fix: string;
};

export type LaunchReport = {
  goPublic: boolean;
  blockers: number;
  warnings: number;
  findings: LaunchFinding[];
  note: string;
};

/** The environment as this process sees it — injectable so the rules are testable. */
export type LaunchEnv = {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  firebaseAdminConfigured: boolean;
  fieldEncryptionKey: string;
  platformAdminEmails: string;
  aiKeys: { anthropic: boolean; openai: boolean; gemini: boolean };
  cronSecret: string;
  humanCheckSecret: string;
  aiMonthlyCeilingUsd: string;
  legalEntityName: string;
  legalEntityAddress: string;
  /** "production" | "preview" | "development" | "" */
  vercelEnv: string;
};

export function readLaunchEnv(env: NodeJS.ProcessEnv = process.env): LaunchEnv {
  const s = (k: string) => (env[k] || "").trim();
  return {
    stripeSecretKey: s("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: s("STRIPE_WEBHOOK_SECRET"),
    // Both halves of the Admin credential are needed; one alone configures
    // nothing, and reporting "Firebase is on" from a lone client email would
    // send the owner looking in the wrong place.
    firebaseAdminConfigured: Boolean(s("FIREBASE_CLIENT_EMAIL") && s("FIREBASE_PRIVATE_KEY")),
    fieldEncryptionKey: s("FIELD_ENCRYPTION_MASTER_KEY"),
    platformAdminEmails: s("PLATFORM_ADMIN_EMAILS"),
    aiKeys: { anthropic: Boolean(s("ANTHROPIC_API_KEY")), openai: Boolean(s("OPENAI_API_KEY")), gemini: Boolean(s("GEMINI_API_KEY")) },
    cronSecret: s("CRON_SECRET"),
    humanCheckSecret: s("HUMAN_CHECK_SECRET"),
    aiMonthlyCeilingUsd: s("AI_MONTHLY_CEILING_USD"),
    legalEntityName: s("NEXT_PUBLIC_LEGAL_ENTITY_NAME"),
    // READ THE NAME THE PAGE READS.
    //
    // This checked NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED_ADDRESS and told the
    // owner to set it, while `components/LegalEntity.tsx` — the thing that
    // actually prints the trader's details — reads NEXT_PUBLIC_REGISTERED_ADDRESS.
    // Following the instruction exactly would have turned this blocker green
    // while the footer still said the trader is not named: a go-live check
    // passing for a reason unrelated to what it tests, on the one finding whose
    // whole point is a legal obligation. The rendered name comes first; the
    // longer spelling is still accepted so anyone who already set it is not
    // punished for having read the old instruction.
    legalEntityAddress: s("NEXT_PUBLIC_REGISTERED_ADDRESS") || s("NEXT_PUBLIC_LEGAL_ENTITY_REGISTERED_ADDRESS"),
    vercelEnv: s("VERCEL_ENV"),
  };
}

const isLiveKey = (k: string) => /^(sk|rk)_live/.test(k);
const isTestKey = (k: string) => /^(sk|rk)_test/.test(k);

export function launchReport(env: LaunchEnv): LaunchReport {
  const f: LaunchFinding[] = [];
  const publicLaunch = env.vercelEnv === "production";

  // --- Money ---------------------------------------------------------------

  if (!env.stripeSecretKey) {
    f.push({
      id: "stripe-missing", severity: publicLaunch ? "blocker" : "warning",
      title: "No Stripe key — nothing can be sold",
      consequence: "Choosing a paid plan returns 503 and no subscription is ever created. On a production deployment that is a shop with the till removed: visitors can browse and sign up free, and every attempt to pay fails.",
      fix: "Set STRIPE_SECRET_KEY in Vercel → Settings → Environment Variables (Production), then redeploy.",
    });
  } else if (isTestKey(env.stripeSecretKey) && publicLaunch) {
    f.push({
      id: "stripe-test-in-production", severity: "blocker",
      title: "Stripe is in TEST mode on a production deployment",
      consequence: "Checkout looks completely normal and takes no money. Real customers enter real card details on a page that will never charge them, then get a plan they never paid for — and the first anyone notices is when the bank statement is empty.",
      fix: "Replace STRIPE_SECRET_KEY with the live key (sk_live_…) from Stripe → Developers → API keys, and redeploy.",
    });
  }

  if (env.stripeSecretKey && !env.stripeWebhookSecret) {
    f.push({
      id: "stripe-webhook-missing", severity: "blocker",
      title: "Payments are taken but nothing is credited",
      consequence: "Stripe charges the card, the webhook that credits ACUs and activates the plan is refused (production fails closed on an unsigned event), and the customer is left paid-up with a Free-plan wallet. They have been charged and served nothing, and neither side gets an error.",
      fix: "Stripe → Developers → Webhooks → add endpoint https://marketwaros.com/api/webhooks/stripe → copy its signing secret into STRIPE_WEBHOOK_SECRET, then redeploy.",
    });
  }

  // --- Data ----------------------------------------------------------------

  if (env.firebaseAdminConfigured && env.fieldEncryptionKey.length < 32) {
    f.push({
      id: "encryption-key-missing", severity: "blocker",
      title: "Personal data cannot be stored, and nothing says so",
      consequence: "Persistence is live, so writes are real, and the encryption layer refuses every PII write rather than store contact details in plaintext against what the Terms promise. That refusal is correct — but the callers are fire-and-forget, so it is completely silent: agent history and audit reports simply never appear, and the first sign is a customer asking where their work went.",
      fix: "Set FIELD_ENCRYPTION_MASTER_KEY to 32+ random characters (openssl rand -hex 32) and redeploy. Choose it once — rotating it makes existing encrypted fields unreadable.",
    });
  }

  if (env.firebaseAdminConfigured && !env.platformAdminEmails) {
    f.push({
      id: "no-admin", severity: "warning",
      title: "Nobody can reach the admin surfaces",
      consequence: "Accounts are enforced and no bootstrap admin is named, so the owner's own sign-in has no role. The billing, economics and invite screens will refuse them from their own platform until a custom claim is set out of band.",
      fix: "Set PLATFORM_ADMIN_EMAILS to the owner's address (comma-separated for more). It only takes effect on an address Firebase has verified.",
    });
  }

  // --- The product itself --------------------------------------------------

  const anyAi = env.aiKeys.anthropic || env.aiKeys.openai || env.aiKeys.gemini;
  if (!anyAi) {
    f.push({
      id: "no-ai", severity: "blocker",
      title: "No AI provider — the agents cannot run",
      consequence: "Every generative surface returns the honest failure instead of work. The deterministic engines still calculate, but the thing customers are paying for does not exist on this deployment.",
      fix: "Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY. Two or more also buys failover when one provider is slow.",
    });
  } else if ([env.aiKeys.anthropic, env.aiKeys.openai, env.aiKeys.gemini].filter(Boolean).length === 1) {
    f.push({
      id: "single-ai-provider", severity: "warning",
      title: "One AI provider, no failover",
      consequence: "The gateway falls back across providers when one is slow or down. With a single key there is nothing to fall back to, so that provider having a bad afternoon reads to the customer as the product being broken.",
      fix: "Add a second provider key. The gateway uses the cheapest-first order and only reaches the others on failure, so a spare key costs nothing while it is not needed.",
    });
  }

  // --- Scheduled work ------------------------------------------------------

  if (!env.cronSecret) {
    f.push({
      id: "no-cron-secret", severity: "warning",
      title: "Scheduled work is not running",
      consequence: "The nightly autopilot, the daily blog, the weekly trend watch and the AI-visibility sweep all check CRON_SECRET (or a Vercel cron header) before doing anything. Without it they refuse every call, so the recurring value the plans promise quietly never happens.",
      fix: "Set CRON_SECRET to a random string and configure it on the scheduler. Vercel Cron entries in vercel.json are also accepted via their own header.",
    });
  }

  if (!env.humanCheckSecret) {
    f.push({
      id: "no-human-check-secret", severity: "warning",
      title: "Signup challenges break across instances",
      consequence: "Challenges are signed with a per-process key, so a customer served by one serverless instance and answering on another is told their correct answer did not match — and cannot claim the free allowance. It looks like a broken signup, at the worst possible moment.",
      fix: "Set HUMAN_CHECK_SECRET to a random string so every instance signs the same way.",
    });
  }

  // --- The platform's own spend -------------------------------------------

  if (!(Number(env.aiMonthlyCeilingUsd) > 0)) {
    f.push({
      id: "no-spend-ceiling", severity: "warning",
      title: "No ceiling on the platform's own AI spend",
      consequence: "Customer work is covered by their ACUs. Everything else — crons, demo traffic, the owner's testing, a loop that misbehaves at 3am — bills to the owner with nothing stopping it. One quiet month already reached $33 on one provider against no revenue.",
      fix: "Set AI_MONTHLY_CEILING_USD (e.g. 50). It only ever stops UNPAID work; a paying customer's run is exempt and always goes through.",
    });
  }

  // --- Who are we, legally -------------------------------------------------

  if (publicLaunch && !(env.legalEntityName && env.legalEntityAddress)) {
    f.push({
      id: "no-legal-entity", severity: "blocker",
      title: "The trader behind the site is not named",
      consequence: "A UK site selling to the public must identify the trader — legal name, geographic address, company number where one exists — before the customer is bound. The Terms currently say those details are not published here, which is honest but is not compliance, and it is also the first thing a cautious buyer looks for before entering a card.",
      fix: "Set NEXT_PUBLIC_LEGAL_ENTITY_NAME and NEXT_PUBLIC_REGISTERED_ADDRESS (plus NEXT_PUBLIC_COMPANY_NUMBER and NEXT_PUBLIC_VAT_NUMBER if they apply), then redeploy. These are the exact names components/LegalEntity.tsx reads — setting any other spelling satisfies nothing.",
    });
  }

  const blockers = f.filter((x) => x.severity === "blocker").length;
  const warnings = f.filter((x) => x.severity === "warning").length;

  return {
    goPublic: blockers === 0,
    blockers, warnings,
    findings: f,
    note: blockers === 0
      ? (warnings === 0
          ? "Nothing found that takes money without delivering, loses data, or breaks a promise the Terms make. Safe to open the doors."
          : `No blockers. ${warnings} thing(s) worth knowing before the doors open — none of them harms a customer on its own.`)
      : `${blockers} blocker(s). Each one means a real person gets charged with nothing delivered, loses data, or is told something the running code does not do. Fix these before going public.`,
  };
}
