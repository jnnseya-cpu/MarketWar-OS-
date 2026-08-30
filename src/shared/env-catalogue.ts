// EVERY ENVIRONMENT VARIABLE THIS PLATFORM READS — ONE REGISTRY.
//
// THE PROBLEM THIS EXISTS TO END. `/api/health/live` reported `envPresent` from
// a hand-typed list of 35 names. The codebase actually reads 133. So 91
// variables — including RESEND_API_KEY, APOLLO_API_KEY, COMPANIES_HOUSE_API_KEY,
// ONFIDO_API_TOKEN, WHATSAPP_TOKEN, FB_APP_SECRET, the Google OAuth trio and
// every webhook secret — were invisible to the one diagnostic that answers
// "what does this deployment actually hold?". A key you cannot see is a key you
// cannot tell is missing, and this platform lost a day to exactly that shape of
// blindness.
//
// A hand-maintained list drifts the moment somebody adds a variable and forgets.
// So a TEST walks every environment read in the source and fails if it is not in
// this file or in one of the two explicit exclusion lists below. A variable
// added tomorrow is documented tomorrow, or CI says so.
//
// WHAT IS DELIBERATELY NOT HERE: no values, ever. This is a catalogue of NAMES,
// what each unlocks and where to obtain it. `/api/health/live` reports presence
// as booleans and never echoes a value.

export type EnvGroup =
  | "AI" | "Firebase" | "Payments" | "Email" | "Scheduling"
  | "Security" | "Data" | "Media" | "Publishing" | "Identity" | "Legal" | "Site";

export type EnvVar = {
  name: string;
  group: EnvGroup;
  /** True when the value is a credential. Never rendered, never logged. */
  secret: boolean;
  /** What stops working without it, in the customer's terms. */
  unlocks: string;
  /** Where the owner actually obtains it. */
  where: string;
};

export const ENV_CATALOGUE: EnvVar[] = [
  { name: "ANTHROPIC_API_KEY", group: "AI", secret: true, unlocks: "Every AI agent and engine. Without any AI key the whole platform runs in deterministic demo mode.", where: "console.anthropic.com → API keys" },
  { name: "OPENAI_API_KEY", group: "AI", secret: true, unlocks: "Photoreal image backgrounds (gpt-image-1), Sora video, Whisper transcription, and AI fallback.", where: "platform.openai.com → API keys. Needs credit on the account, not just a key." },
  { name: "GEMINI_API_KEY", group: "AI", secret: true, unlocks: "Veo video rendering, and AI fallback.", where: "aistudio.google.com → Get API key" },
  { name: "AI_GATEWAY_ORDER", group: "AI", secret: false, unlocks: "The order providers are tried in, so you control which one carries the cost first.", where: "Your choice, e.g. anthropic,openai,gemini." },
  { name: "AI_MONTHLY_CEILING_USD", group: "AI", secret: false, unlocks: "A hard ceiling on the platform's OWN AI spend — crons, demos, your testing. A paying customer's run is never blocked by it.", where: "Your choice, e.g. 50." },
  { name: "ANTHROPIC_MODEL", group: "AI", secret: false, unlocks: "Pins which Claude model every agent runs on, instead of the default.", where: "A Claude model id from the Anthropic docs." },
  { name: "OPENAI_MODEL", group: "AI", secret: false, unlocks: "Pins which OpenAI text model the gateway uses, instead of the default.", where: "An OpenAI model id your account can use." },
  { name: "GEMINI_MODEL", group: "AI", secret: false, unlocks: "Pins which Gemini text model the gateway uses, instead of the default.", where: "A Gemini model id from Google AI Studio." },
  { name: "OPENAI_IMAGE_MODEL", group: "AI", secret: false, unlocks: "Pins which image model generates photoreal backgrounds, instead of the default.", where: "An OpenAI image model id. Defaults to gpt-image-1." },
  { name: "OPENAI_TRANSCRIBE_MODEL", group: "AI", secret: false, unlocks: "Pins the transcription model the Caption Engine and Clip Finder use.", where: "An OpenAI transcription model id." },
  { name: "OPENAI_VIDEO_MODEL", group: "AI", secret: false, unlocks: "Pins the Sora model, which must be one your OpenAI account has access to.", where: "A Sora model id your OpenAI account has access to." },
  { name: "GEMINI_VIDEO_MODEL", group: "AI", secret: false, unlocks: "Pins the Veo tier - the quality and price dial for every video render.", where: "A Veo model id from Google AI Studio." },
  { name: "FIREBASE_CLIENT_EMAIL", group: "Firebase", secret: true, unlocks: "Firebase Admin: all persistence, auth enforcement, storage, tenant isolation. Without it the platform runs unauthenticated in demo mode.", where: "Firebase console → Project settings → Service accounts → Generate new private key. Use client_email from the JSON." },
  { name: "FIREBASE_PRIVATE_KEY", group: "Firebase", secret: true, unlocks: "The other half of Firebase Admin.", where: "Same JSON, private_key field. Keep the \\n escapes." },
  { name: "FIREBASE_PROJECT_ID", group: "Firebase", secret: false, unlocks: "Which Firebase project the Admin SDK connects to for data, auth and storage.", where: "Same JSON, project_id." },
  { name: "FIREBASE_SERVICE_ACCOUNT", group: "Firebase", secret: true, unlocks: "The whole service-account JSON in one variable, instead of three separate fields.", where: "The downloaded JSON, as a single line or base64." },
  { name: "FIREBASE_STORAGE_BUCKET", group: "Firebase", secret: false, unlocks: "Media hosting — attachable images and video. Currently FALSE on your deployment.", where: "Firebase console → Storage. Looks like your-project.appspot.com." },
  { name: "NEXT_PUBLIC_FIREBASE_API_KEY", group: "Firebase", secret: false, unlocks: "Browser sign-up and login. Public by design.", where: "Firebase console → Project settings → Your apps → Web app." },
  { name: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", group: "Firebase", secret: false, unlocks: "The domain browser sign-in redirects through. Login fails without it.", where: "Same web-app config." },
  { name: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", group: "Firebase", secret: false, unlocks: "Tells the browser SDK which Firebase project to sign users in against.", where: "Same web-app config." },
  { name: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", group: "Firebase", secret: false, unlocks: "Lets the browser upload straight to storage, so large files never cross our servers.", where: "Same web-app config." },
  { name: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", group: "Firebase", secret: false, unlocks: "Part of the browser Firebase config; messaging will not initialise without it.", where: "Same web-app config." },
  { name: "NEXT_PUBLIC_FIREBASE_APP_ID", group: "Firebase", secret: false, unlocks: "Identifies this web app to Firebase; the browser SDK will not start without it.", where: "Same web-app config." },
  { name: "NEXT_PUBLIC_FIREBASE_DATABASE_URL", group: "Firebase", secret: false, unlocks: "The Realtime Database address. Deliberately unused - its rules are deny-all.", where: "Firebase console, only if you enable Realtime Database." },
  { name: "GOOGLE_APPLICATION_CREDENTIALS", group: "Firebase", secret: true, unlocks: "A path to a service-account file, as an alternative to the Firebase variables.", where: "A file path on the host." },
  { name: "GOOGLE_APPLICATION_CREDENTIALS_JSON", group: "Firebase", secret: true, unlocks: "The same service-account credentials supplied inline rather than as a file.", where: "The service-account JSON." },
  { name: "GCLOUD_PROJECT", group: "Firebase", secret: false, unlocks: "Identifies the Google Cloud project when the host sets it rather than you.", where: "Usually set by the host; otherwise your Google Cloud project id." },
  { name: "GOOGLE_CLOUD_PROJECT", group: "Firebase", secret: false, unlocks: "The same project id under the spelling some Google runtimes use instead.", where: "Usually set by the host; otherwise your Google Cloud project id." },
  { name: "STRIPE_SECRET_KEY", group: "Payments", secret: true, unlocks: "Taking money at all. Without it choosing a paid plan returns 503.", where: "dashboard.stripe.com → Developers → API keys." },
  { name: "STRIPE_WEBHOOK_SECRET", group: "Payments", secret: true, unlocks: "Crediting a wallet after payment. Without it Stripe charges the card and nothing is credited.", where: "Stripe → Developers → Webhooks → your endpoint → Signing secret (whsec_…)." },
  { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", group: "Payments", secret: false, unlocks: "The browser half of Stripe checkout.", where: "Same API keys page, pk_… ." },
  { name: "BITRIPAY_API_KEY", group: "Payments", secret: true, unlocks: "BitriPay payouts to creators in the Creator Engine.", where: "Your BitriPay account." },
  { name: "SMTP_HOST", group: "Email", secret: false, unlocks: "Sending email at all — audit reports, campaigns, receipts.", where: "Your mail host." },
  { name: "SMTP_USER", group: "Email", secret: true, unlocks: "The mailbox that authenticates.", where: "Your mail host." },
  { name: "SMTP_PASS", group: "Email", secret: true, unlocks: "That mailbox's own password — per mailbox, not per domain.", where: "Your mail host." },
  { name: "SMTP_PORT", group: "Email", secret: false, unlocks: "The port the mail relay listens on. Defaults to 587 (submission).", where: "Your mail host's documentation. 587 unless they say otherwise." },
  { name: "SMTP_SECURE", group: "Email", secret: false, unlocks: "Forces implicit TLS, which port 465 requires and 587 does not.", where: "Set true only for port 465." },
  { name: "SMTP_CONCURRENCY", group: "Email", secret: false, unlocks: "How many SMTP sessions run in parallel, deciding how fast a campaign sends.", where: "Your choice, within your mail host's connection limit." },
  { name: "EMAIL_FROM", group: "Email", secret: false, unlocks: "The visible From address. Must be one the relay is allowed to send as.", where: "An address on your own domain." },
  { name: "RESEND_API_KEY", group: "Email", secret: true, unlocks: "Sending via Resend instead of SMTP.", where: "resend.com → API keys." },
  { name: "SENDGRID_API_KEY", group: "Email", secret: true, unlocks: "Sending via SendGrid instead of SMTP.", where: "sendgrid.com → Settings → API keys." },
  { name: "MW_SENDING_POOL", group: "Email", secret: true, unlocks: "A JSON array of sending nodes, for rotating across several. Overrides the single SMTP_* node.", where: "Written by you; see docs/DEPLOYMENT.md." },
  { name: "MW_BOUNCE_ADDRESS", group: "Email", secret: false, unlocks: "The envelope return path. Must be a mailbox that EXISTS or failure notices vanish.", where: "A real mailbox you own." },
  { name: "EMAIL_WEBHOOK_SECRET", group: "Email", secret: true, unlocks: "Verifying inbound delivery webhooks from the mail provider.", where: "Your mail provider's webhook settings." },
  { name: "EMAIL_TRACKING_SECRET", group: "Email", secret: true, unlocks: "Signing open/click tracking links so they cannot be forged.", where: "Generate a random string." },
  { name: "NEWSLETTER_SECRET", group: "Email", secret: true, unlocks: "Authorising the weekly newsletter cron.", where: "Generate a random string." },
  { name: "CRON_SECRET", group: "Scheduling", secret: true, unlocks: "ALL scheduled work: nightly autopilot, daily blog, weekly trends, AI-visibility sweep. Without it every scheduled run refuses. Currently FALSE on your deployment.", where: "Generate a random string and set it on the scheduler too." },
  { name: "BLOG_DAILY_ENABLED", group: "Scheduling", secret: false, unlocks: "Turns the daily blog writer on. It also needs CRON_SECRET, or it refuses every run.", where: "Your choice - set to 1 to enable." },
  { name: "HUMAN_CHECK_SECRET", group: "Security", secret: true, unlocks: "Enforces the human gate. Without it the gate observes but blocks nothing.", where: "Generate a random string. You have this set." },
  { name: "HUMAN_CHECK_BITS", group: "Security", secret: false, unlocks: "Proof-of-work difficulty on the human check. Higher costs a bot more, and a visitor too.", where: "Your choice. 18 is the default and is already effective." },
  { name: "FIELD_ENCRYPTION_MASTER_KEY", group: "Security", secret: true, unlocks: "Encrypts PII at rest. Without it PII writes are refused in silence.", where: "Generate a 32-byte random key." },
  { name: "AUDIT_QUOTA_SALT", group: "Security", secret: true, unlocks: "Salts the hash of a visitor's IP in the free-audit quota. Without it the hash is reversible by enumerating the IPv4 space.", where: "Generate a random string — see below." },
  { name: "PORTAL_LINK_SECRET", group: "Security", secret: true, unlocks: "Signs client approval portal links. Falls back to HUMAN_CHECK_SECRET.", where: "Generate a random string, 16+ chars." },
  { name: "CONNECTIONS_SECRET", group: "Security", secret: true, unlocks: "Encrypts third-party connector credentials.", where: "Generate a random string." },
  { name: "CREATOR_LEDGER_SECRET", group: "Security", secret: true, unlocks: "Authorises creator-ledger operations.", where: "Generate a random string." },
  { name: "POSTBACK_ROOT_SECRET", group: "Security", secret: true, unlocks: "Signs conversion postbacks so they cannot be forged.", where: "Generate a random string." },
  { name: "PLATFORM_ADMIN_EMAILS", group: "Security", secret: false, unlocks: "Makes these addresses platform admins, and an admin is never charged ACUs.", where: "Comma-separated addresses. Set once." },
  { name: "NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS", group: "Security", secret: false, unlocks: "Shows admin-only screens in the browser. Enforcement is always server-side.", where: "Same addresses." },
  { name: "NEXT_PUBLIC_RECAPTCHA_SITE_KEY", group: "Security", secret: false, unlocks: "Turns on Firebase App Check in the browser, blocking scripted use of your API.", where: "Google reCAPTCHA console." },
  { name: "SEED_PASSWORD", group: "Security", secret: true, unlocks: "The password the development seed script sets. Never set this in production.", where: "Your choice, for local development only." },
  { name: "SERPER_API_KEY", group: "Data", secret: true, unlocks: "Live prospect and market search. Without it LeadWar Room returns nothing rather than inventing prospects.", where: "serper.dev → API key." },
  { name: "APOLLO_API_KEY", group: "Data", secret: true, unlocks: "Verified business emails in the contact waterfall.", where: "apollo.io → Settings → API." },
  { name: "COMPANIES_HOUSE_API_KEY", group: "Data", secret: true, unlocks: "UK company registry — free, and the second free source in the contact waterfall.", where: "developer.company-information.service.gov.uk — free." },
  { name: "SCRAPER_API_URL", group: "Data", secret: false, unlocks: "A scraping endpoint that raises the hit rate of the free email-finding source.", where: "Your ScraperAPI or equivalent endpoint." },
  { name: "GOOGLE_SERVICE_ACCOUNT_JSON", group: "Data", secret: true, unlocks: "Google Search Console data for the SEO engines.", where: "Google Cloud → service account with Search Console access." },
  { name: "GOOGLE_OAUTH_CLIENT_ID", group: "Data", secret: false, unlocks: "Reads Search Console AND Business Profile as you, which a service account cannot.", where: "Google Cloud → OAuth client." },
  { name: "GOOGLE_OAUTH_CLIENT_SECRET", group: "Data", secret: true, unlocks: "The secret half of that OAuth client; the refresh token is useless without it.", where: "Same OAuth client." },
  { name: "GOOGLE_OAUTH_REFRESH_TOKEN", group: "Data", secret: true, unlocks: "Keeps that Google access alive without anybody signing in again.", where: "Obtained once via the OAuth flow." },
  { name: "ELEVENLABS_API_KEY", group: "Media", secret: true, unlocks: "Voiceovers, voice cloning and dubbing in the Audio Studio.", where: "elevenlabs.io → Profile → API key. Check the key's SCOPES, not just its value." },
  { name: "ELEVENLABS_VOICE_ID", group: "Media", secret: false, unlocks: "The voice used when the customer has not chosen one of their own.", where: "ElevenLabs - the voice id shown beside each voice in your library." },
  { name: "ELEVENLABS_MODEL", group: "Media", secret: false, unlocks: "Pins which ElevenLabs model produces speech, instead of the default.", where: "ElevenLabs - a model id from their model list." },
  { name: "VIDEO_WORKER_SECRET", group: "Media", secret: true, unlocks: "The self-hosted render worker (trim, clips, burned captions, upscale). Set on both sides. Currently FALSE on your deployment.", where: "Generate a random string; set the same value on the worker." },
  { name: "FFMPEG_CLOUD_API_KEY", group: "Media", secret: true, unlocks: "A hosted renderer instead of your own worker — a new supplier and a new bill.", where: "Your FFmpeg-cloud provider." },
  { name: "FFMPEG_CLOUD_URL", group: "Media", secret: false, unlocks: "The endpoint of the hosted renderer, when you use one instead of your own worker.", where: "Your hosted-renderer provider's API endpoint." },
  { name: "RENDER_COST_PER_MIN_GBP", group: "Media", secret: false, unlocks: "What a render minute costs you, so pricing stays above the margin floor.", where: "From your invoice." },
  { name: "VIDEO_COST_PER_SECOND_GBP", group: "Media", secret: false, unlocks: "Default video cost per second.", where: "From your invoice." },
  { name: "VIDEO_COST_PER_SECOND_GBP_VEO", group: "Media", secret: false, unlocks: "Veo's real cost per second — set it to match the tier you pinned.", where: "From your Google invoice." },
  { name: "VIDEO_COST_PER_SECOND_GBP_SORA", group: "Media", secret: false, unlocks: "Sora's real cost per second.", where: "From your OpenAI invoice." },
  { name: "ZERNIO_API_KEY", group: "Publishing", secret: true, unlocks: "Social publishing to 15 channels.", where: "Your Zernio account." },
  { name: "ZERNIO_WEBHOOK_SECRET", group: "Publishing", secret: true, unlocks: "Verifying Zernio's callbacks.", where: "Zernio webhook settings." },
  { name: "FB_APP_ID", group: "Publishing", secret: false, unlocks: "Identifies your Facebook app, which Instagram and Facebook publishing both run through.", where: "developers.facebook.com → your app." },
  { name: "FB_APP_SECRET", group: "Publishing", secret: true, unlocks: "The secret half of that Facebook app, without which no Meta publishing authorises.", where: "Same app → Settings → Basic." },
  { name: "META_VERIFY_TOKEN", group: "Publishing", secret: true, unlocks: "The token Meta echoes back when verifying your webhook.", where: "Your choice; enter the same value in Meta." },
  { name: "META_GRAPH_VERSION", group: "Publishing", secret: false, unlocks: "Pins the Meta Graph API version, instead of following the current default.", where: "The Meta Graph API changelog, e.g. v21.0." },
  { name: "WHATSAPP_TOKEN", group: "Publishing", secret: true, unlocks: "Sending WhatsApp messages to customers from the automation and inbox surfaces.", where: "Meta Business → WhatsApp → API access." },
  { name: "SHOPIFY_WEBHOOK_SECRET", group: "Publishing", secret: true, unlocks: "Verifying Shopify order webhooks for commission.", where: "Shopify admin → Notifications → Webhooks." },
  { name: "WOO_WEBHOOK_SECRET", group: "Publishing", secret: true, unlocks: "Verifying WooCommerce order webhooks.", where: "WooCommerce → Settings → Advanced → Webhooks." },
  { name: "ONFIDO_API_TOKEN", group: "Identity", secret: true, unlocks: "Identity verification before a payout.", where: "onfido.com dashboard." },
  { name: "PERSONA_API_KEY", group: "Identity", secret: true, unlocks: "Identity verification, alternative provider.", where: "withpersona.com dashboard." },
  { name: "SANCTIONS_API_KEY", group: "Identity", secret: true, unlocks: "Sanctions screening before a payout.", where: "Your screening provider." },
  { name: "NEXT_PUBLIC_LEGAL_ENTITY_NAME", group: "Legal", secret: false, unlocks: "Names the trader on the site. A UK site selling to the public MUST do this — it is currently a launch BLOCKER.", where: "Your registered company or trading name." },
  { name: "NEXT_PUBLIC_REGISTERED_ADDRESS", group: "Legal", secret: false, unlocks: "The trader's geographic address. Part of the same blocker.", where: "Your registered address." },
  { name: "NEXT_PUBLIC_COMPANY_NUMBER", group: "Legal", secret: false, unlocks: "Shows the company number, which UK trading law requires where one exists.", where: "Companies House - the 8-character number on your incorporation record." },
  { name: "NEXT_PUBLIC_VAT_NUMBER", group: "Legal", secret: false, unlocks: "Shows the VAT number on invoices and the site, required once registered.", where: "Your HMRC VAT registration certificate." },
  { name: "NEXT_PUBLIC_APP_URL", group: "Site", secret: false, unlocks: "The site's own address as the browser uses it, for links and share URLs.", where: "Your own domain, including https://." },
  { name: "NEXT_PUBLIC_PRODUCTION_URL", group: "Site", secret: false, unlocks: "The canonical address used in sitemaps, canonical tags and structured data.", where: "Your own domain, including https://." },
  { name: "APP_URL", group: "Site", secret: false, unlocks: "The site's own address as the server sees it, used when building links in email.", where: "Your own domain, including https://." },
  { name: "MW_SITE_HOST", group: "Site", secret: false, unlocks: "The host used whenever an absolute link has to be built outside a request.", where: "Your own domain, without the scheme." },
  { name: "MW_TRACK_HOST", group: "Site", secret: false, unlocks: "The host that open and click tracking links point at, on a domain you control.", where: "A subdomain you control, e.g. links.yourdomain.com, with DNS pointed here." },
  { name: "MW_TRACK_URL", group: "Site", secret: false, unlocks: "The base URL that open and click tracking links are built from.", where: "The https:// form of that same tracking subdomain." },
  { name: "MW_REPLY_HOST", group: "Site", secret: false, unlocks: "The host replies are addressed to, so a customer's answer reaches the inbox.", where: "A subdomain you control, with MX pointed at your mail host." },
  { name: "MW_MX_HOST", group: "Site", secret: false, unlocks: "The MX host shown in the DNS records the platform tells you to publish.", where: "Your mail provider's MX hostname." },
  { name: "MW_SENDING_HOST", group: "Site", secret: false, unlocks: "The hostname the sending node introduces itself with (HELO), which relays check.", where: "The hostname of your sending node." },
  { name: "MW_SENDING_IP", group: "Site", secret: false, unlocks: "The sending node's address, used to build the SPF record you publish.", where: "The public IP of your sending node." },
  { name: "MW_SPF_INCLUDE", group: "Site", secret: false, unlocks: "An extra SPF include added to the DNS records the platform tells you to publish.", where: "Your mail provider's documented SPF include." },
  { name: "MW_BOUNCE_HOST", group: "Site", secret: false, unlocks: "The host bounces are routed to, so a failure notice reaches a mailbox that exists instead of vanishing.", where: "A subdomain you control, with MX pointed at your mail host." },
  { name: "MW_DMARC_RUA", group: "Site", secret: false, unlocks: "The mailbox DMARC aggregate reports go to, so delivery problems are visible.", where: "A mailbox you actually read, e.g. dmarc@yourdomain.com." },
  { name: "MW_NODE_DAILY_CAP", group: "Site", secret: false, unlocks: "Caps how much one sending node may send per day, protecting its reputation.", where: "Your choice - start low on a new IP and raise it as reputation builds." },
  { name: "NEXT_PUBLIC_GTM_ID", group: "Site", secret: false, unlocks: "Loads Google Tag Manager, so your own analytics and tags run on the site.", where: "Google Tag Manager - your container id (GTM-XXXXXXX)." },
  { name: "NEXT_PUBLIC_META_PIXEL_ID", group: "Site", secret: false, unlocks: "Loads the Meta Pixel, so Facebook campaigns can measure conversions.", where: "Meta Events Manager - your pixel id." },
];

/**
 * Read but not worth reporting: timeouts, concurrency, model pins and
 * test-harness variables. Every one has a working default, and listing them in
 * a readiness report would bury the fourteen that actually gate a feature.
 */
export const ENV_TUNING: string[] = [
  "AGENT_DAILY_CAP_ACU",
  "AI_CITATION_BUDGET_MS",
  "AI_GATEWAY_ORDER_FAST",
  "AI_PROVIDER_COOLDOWN_MS",
  "AI_REQUEST_TIMEOUT_MS",
  "AI_SOURCES_BUDGET_MS",
  "AI_TOTAL_TIMEOUT_MS",
  "AI_VISIBILITY_BUDGET_MS",
  "AI_VISIBILITY_CONCURRENCY",
  "BRAND_KIT_BUDGET_MS",
  "EMAIL_SEND_BUDGET_MS",
  "POLL_MS",
  "WORKER_ID",
  "SMOKE_BASE",
  "SMOKE_BASE_URL",
];

/** Set by the host, not by the owner. Nothing to obtain and nothing to fix. */
export const ENV_PLATFORM: string[] = [
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_MESSAGE",
  "VERCEL_DEPLOYMENT_ID",
  "CLOUD_RUN_REVISION",
  "K_REVISION",
  "GITHUB_SHA",
  "COMMIT_SHA",
  "SOURCE_COMMIT",
  "GIT_COMMIT",
  "PORT",
];

/** Everything the owner might need to set, in one list. */
export const ENV_NAMES: string[] = ENV_CATALOGUE.map((e) => e.name);

export const envByGroup = (g: EnvGroup): EnvVar[] => ENV_CATALOGUE.filter((e) => e.group === g);
