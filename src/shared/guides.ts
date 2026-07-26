// Guide registry — the content behind the in-product Guide Wizard. For every
// dashboard module it answers: what you achieve, exactly what to input and where,
// the steps, and whether it's ready now or needs a key/data source. Status is
// truthful (matches docs/REAL-VS-SCAFFOLD.md): "ready" = works now, no setup;
// "key" = works now (demo) and turns fully real with a provider key; "data" =
// shows modelled estimates until a measured data source is connected.
//
// Pure data + a lookup helper — no backend imports, safe on the client.

export type GuideStatus = "ready" | "key" | "data";
export type Guide = {
  title: string;
  goal: string;                 // one line: what you walk away with
  status: GuideStatus;
  statusNote?: string;          // what unlocks full function (for key/data)
  steps: string[];              // concrete, references the real inputs/buttons
  tip?: string;
  next?: { label: string; href: string };
};

const R = "ready" as const, K = "key" as const, D = "data" as const;

export const GUIDES: Record<string, Guide> = {
  // ── Command / overview ────────────────────────────────────────────────
  "": { title: "Command Center", goal: "See the one next action that makes money today.", status: R,
    steps: ["Pick your brand in the top-left switcher.", "Read the War Report — it ranks moves by speed-to-cash from your real results.", "Click the top move to jump straight into the tool that does it."],
    tip: "Empty here? Import contacts in Customer Vault first — most engines feed off real data.", next: { label: "Import contacts", href: "/dashboard/customers" } },

  // ── Customer & data (fully live) ──────────────────────────────────────
  customers: { title: "Customer Vault", goal: "Turn a contact list into a scored, contactable asset.", status: R,
    steps: ["Click Upload CSV or Paste rows — any columns (email, name, company, trade, town…) are auto-detected.", "Every contact is scored instantly (LTV, churn, intent) — no setup.", "For company-only lists, click Find emails to discover a real email per company.", "Use Email / WhatsApp on any row to contact them in one click."],
    tip: "Find emails uses Apollo (if set) then a website scraper — nothing is invented.", next: { label: "Build segments", href: "/dashboard/segments" } },
  segments: { title: "Audience Segments", goal: "Group your real contacts into targetable segments.", status: R,
    steps: ["Make sure the Vault has contacts (import in Customer Vault).", "Segments build automatically from real scores — hot leads, at-risk, high-LTV.", "Open a segment to see who's in it, then send to it from Email or WhatsApp."],
    next: { label: "Email a segment", href: "/dashboard/email" } },
  recovery: { title: "Lead Recovery", goal: "Win back dormant customers and recover lost revenue.", status: R,
    steps: ["Import/refresh contacts so there's order history to work from.", "Recovery sorts contacts into win-back cohorts and shows £ recoverable.", "Send the suggested win-back message to a cohort from the email/WhatsApp engines."] },
  revenue: { title: "Revenue", goal: "See real attributed revenue + a forecast.", status: R,
    steps: ["Revenue reads your real results ledger — sales you (or Autopilot) logged.", "Log a win via the tools that produce revenue, and it appears here.", "The forecast is a deterministic projection off your actual trend."],
    tip: "Live Stripe payments on MarketWar checkouts auto-attribute here." },
  "money-ledger": { title: "Money Ledger", goal: "Know your true ROI across spend and results.", status: R,
    steps: ["It reads your real results ledger + logged spend.", "Read the ROI figure — it's computed, not estimated.", "Add spend entries to keep ROI accurate."] },
  "email-templates": { title: "Email Templates", goal: "Design reusable, personalised email templates.", status: R,
    steps: ["Click New template.", "Write content and drop in merge tokens (e.g. {{name}}) — they render per contact.", "Save; the template is now selectable when you send from Email Center."],
    next: { label: "Send with it", href: "/dashboard/email" } },

  // ── Growth & conversion ───────────────────────────────────────────────
  prospecting: { title: "LeadWar Room", goal: "Find real B2B prospects that match your ideal customer.", status: K, statusNote: "Live Google data is ON with your Serper key — real companies now.",
    steps: ["Fill your product, target industry, deal size and pain.", "Click to build the ICP, then discover prospects.", "Each prospect gets a Deal Probability score; save the good ones and start an outreach sequence."],
    tip: "Export the list or push contacts into the Vault to contact them." },
  discover: { title: "Discover", goal: "Spot local demand and opportunity gaps.", status: K, statusNote: "Real Google/Places data via your Serper key.",
    steps: ["Enter a niche + location.", "See real search/Places results and where competitors are weak.", "Use the gaps to aim a campaign or landing page."] },
  "first-customer": { title: "First Customer", goal: "Go from zero to your first paying customer, step by step.", status: K, statusNote: "Serper + Stripe are live; the AI copy step needs an AI provider key.",
    steps: ["Follow the guided steps — it finds leads (Serper), drafts outreach, and can take payment (Stripe).", "Fill each input as prompted; every step has an honest demo fallback.", "Complete the checkout step to log your first real sale."] },
  campaigns: { title: "Campaign Builder", goal: "Generate a full campaign structure + copy.", status: K, statusNote: "Add an AI provider key (Anthropic/OpenAI/Gemini) for real generation; demo otherwise.",
    steps: ["Fill business, offer, audience.", "Click Generate — get the campaign structure and copy.", "Send it to Publish or Email to launch."] },
  offers: { title: "Offer Forge", goal: "Design irresistible, margin-safe offers.", status: K, statusNote: "AI provider key upgrades to real generation.",
    steps: ["Describe your product and goal.", "Generate offer options (volume/margin/recovery).", "Take the winner into Landing Builder to make a page."],
    next: { label: "Make a landing page", href: "/dashboard/landing-builder" } },
  "landing-builder": { title: "Landing Page Builder", goal: "Publish a real, shareable landing page.", status: R,
    steps: ["Fill Business + Objective; paste your Offer in the box to turn it into the page.", "Optionally add a CTA button text and a Product / CTA link (your checkout/booking URL).", "Click Generate, then Publish live page — you get a real /b/… URL.", "Share it or run ads to it; form submissions land in the Vault."] },
  "landing-pages": { title: "Landing Pages", goal: "Manage every landing page you've published.", status: R,
    steps: ["See all your live pages with their conversion scores.", "Open one to view/copy its public URL.", "Create a new one in Landing Builder."] },
  "war-room": { title: "Campaign War Room", goal: "Get Stop / Fix / Scale verdicts on live activity.", status: R,
    steps: ["It reads your real results ledger.", "Read each verdict — stop what loses, scale what works.", "Act on the top verdict."] },
  warfare: { title: "Marketing Warfare", goal: "Design a multi-channel campaign ecosystem.", status: R,
    steps: ["Enter your objective and inputs.", "Get a deterministic campaign plan + AI Campaign Score.", "Execute the pieces via Publish / Email / WhatsApp."] },
  strategy: { title: "Strategy", goal: "Build your marketing avatar → battle plan.", status: R,
    steps: ["Answer the guided prompts (avatar, positioning, plan).", "The 7-step chain outputs a concrete battle plan.", "Take actions into the relevant execution tools."] },
  amplify: { title: "Amplify", goal: "Project virality (K-factor) and plan retargeting.", status: R,
    steps: ["Enter your reach/referral inputs.", "See the K-factor projection and retargeting frequency plan.", "Apply the caps in your ad/retargeting setup."] },
  autopilot: { title: "Autopilot", goal: "Let the OS run a daily growth cycle for you.", status: K, statusNote: "Cycle runs on real Vault counts; the nightly digest send needs an email key + CRON_SECRET.",
    steps: ["Ensure the Vault has contacts.", "Turn on the autonomy level you're comfortable with in Settings.", "Autopilot proposes/acts on the daily cycle; review its actions."] },

  // ── Content & creative ────────────────────────────────────────────────
  studio: { title: "Brand Studio (VisualStrike)", goal: "Make on-brand ad creatives from your logo + product.", status: R,
    steps: ["Upload/confirm your logo and product photo (uses your brand colours).", "Set the headline, offer and CTA; pick a format.", "Click generate — pick a variant, Download it, or Publish it.", "An OpenAI key upgrades backgrounds to photoreal; it works without one."],
    next: { label: "Publish it", href: "/dashboard/publish" } },
  video: { title: "AI Video Creator", goal: "Produce and edit short marketing video.", status: K, statusNote: "Clip engine + in-browser recorder/editor work now; MP4 render needs a Veo/Sora key; publishing needs a social key.",
    steps: ["Write your brief or record your screen in-browser.", "Trim/clip in the editor (works with no key).", "Render to MP4 (needs a video key) or paste a video URL, then publish."] },
  create: { title: "Create", goal: "Start from what you want and get routed to the right tool.", status: R,
    steps: ["Type what you want to make.", "It routes you to the right engine (or builds it via the AI agents).", "Follow through in that tool."] },
  content: { title: "Content Factory", goal: "Generate on-brand marketing copy at volume.", status: K, statusNote: "Add an AI provider key for real copy; deterministic demo otherwise.",
    steps: ["Fill the brief fields.", "Generate the content.", "Send it straight to Publish to post."] },
  blog: { title: "SEO Blog Studio", goal: "Draft SEO blog posts (admin).", status: K, statusNote: "Needs an AI provider key for real drafts; store/publish is real.",
    steps: ["Enter the topic/keyword.", "Generate the draft.", "Edit and publish; it persists for real."] },
  publish: { title: "Publish Center", goal: "Cross-post to your social channels.", status: K, statusNote: "Facebook/Instagram publish natively (connect once); other channels use Zernio; manual 'post it yourself' always works.",
    steps: ["Connect Facebook & Instagram at the top (Connect with Facebook, or paste a Page token).", "Connect other channels via Zernio if you use them.", "Write the post, pick channels, Publish — or use 'Post it yourself' with zero setup."] },
  "product-engine": { title: "Viral Product Engine", goal: "Turn a product into hooks, copy and a launch.", status: K, statusNote: "Copy/scoring needs an AI key; image/video/publish need their keys.",
    steps: ["Enter the product details.", "Generate hooks + angles + score.", "Send the winner to Studio/Video and Publish."] },
  approvals: { title: "Approvals", goal: "Route work through a review/approve workflow.", status: R,
    steps: ["Submit an item for approval.", "Reviewers move it through the states (real state machine, persisted).", "Approved items are cleared to ship."] },
  "ai-agents": { title: "AI Agents", goal: "Run a chained strategy-agent analysis.", status: K, statusNote: "Add an AI provider key for real output; deterministic preview otherwise.",
    steps: ["Pick/scope the agent run.", "Provide the brief inputs.", "Read the chained output and act on it."] },
  engines: { title: "Engines", goal: "Launcher for every engine in the OS.", status: R,
    steps: ["Browse the engine index.", "Click one to open its full tool.", "Use that tool's own guide for steps."] },

  // ── SEO / local / competitive ─────────────────────────────────────────
  omnirank: { title: "OMNIRANK", goal: "Plan your search-dominance strategy.", status: D, statusNote: "Scores are deterministic today; connect Search Console / a SERP source to rank on measured data.",
    steps: ["Enter your keywords/market.", "Read the dominion score + opportunities (modelled).", "Use the priorities to guide real SEO work."] },
  "search-dominance": { title: "Search Dominance", goal: "Map keyword intent and readiness.", status: D, statusNote: "Heuristic today; wire real keyword/rank data to measure.",
    steps: ["Enter your seed keywords.", "Read the intent/opportunity/readiness scores.", "Prioritise the gaps."] },
  organic: { title: "Organic", goal: "Audit your organic/local footprint.", status: D, statusNote: "Deterministic audit today; connect GBP/citation feeds for live data.",
    steps: ["Enter your business + location.", "Read the geo audit + citation radar.", "Fix the flagged gaps."] },
  "organic-dominance": { title: "Organic Dominance OS", goal: "Run an organic-growth intelligence pass.", status: K, statusNote: "AI onboarding works with a key; live metrics need Serper/Search Console.",
    steps: ["Complete the onboarding inputs.", "Review the strategy output.", "Connect a search-data source to light up live metrics."] },
  local: { title: "Local Domination", goal: "See your local-search presence and gaps.", status: D, statusNote: "Estimates today; connect Google Business Profile / map data to measure.",
    steps: ["Enter your business + area.", "Read the local presence estimate.", "Use it to prioritise citations/reviews."] },
  competitors: { title: "Competitor Spy", goal: "Build a competitor battlecard.", status: D, statusNote: "Signals are estimates ('never measured'); connect ad/SEO data feeds to measure.",
    steps: ["Enter competitors.", "Read the weakness board + battlecard.", "Aim your offer at their weak spots."] },
  "website-intel": { title: "Website Intel (SiteRaid)", goal: "Audit a website's DNA and issues.", status: D, statusNote: "Deterministic/rule-based today; a live crawler makes it measured.",
    steps: ["Enter the site URL.", "Read the DNA / truth-layer / audit / attack-map.", "Fix the highest-impact issues."] },
  reputation: { title: "Reputation", goal: "Analyse reviews and draft responses.", status: R,
    steps: ["Paste/import your reviews.", "Get trust score, sentiment and fake-review risk (really computed).", "Use the drafted responses to reply."] },

  // ── Money & comms ─────────────────────────────────────────────────────
  billing: { title: "Billing", goal: "Manage your plan and ACU wallet.", status: K, statusNote: "Top-ups create a real Stripe checkout — live with your Stripe key.",
    steps: ["Review your plan and wallet balance.", "Click top-up to add ACUs — it opens a real Stripe checkout.", "Payment reflects back automatically."] },
  inbox: { title: "Inbox", goal: "Handle inbound messages in one place.", status: K, statusNote: "Reads real inbound; sending replies needs an email key (Resend/SendGrid/SMTP).",
    steps: ["Read inbound messages (real per-brand store).", "Reply — delivery goes out once an email key is set.", "Triage and tag."] },
  email: { title: "Email Center", goal: "Send a real, hygiene-checked email campaign.", status: K, statusNote: "Vault sends + stats are real; delivery needs an email key (Resend/SendGrid/SMTP).",
    steps: ["Pick a segment (or a status segment for imported prospects).", "Choose a template and set the message.", "Send — it filters non-consented/invalid, and delivers once a sender key is set."] },
  whatsapp: { title: "WhatsApp Center", goal: "Run a WhatsApp sales funnel.", status: D, statusNote: "Demo funnel today; add WHATSAPP_TOKEN + a send UI for real send/receive.",
    steps: ["Review the funnel stages.", "Set WHATSAPP_TOKEN to enable real messaging.", "Use the composer links to message from your own number meanwhile."] },
  comms: { title: "Comms Catalogue", goal: "Browse the message/event catalogue (admin).", status: D, statusNote: "Static catalogue + demo deliveries; wire to the send engines to go live.",
    steps: ["Browse the event catalogue.", "Preview a message.", "Trigger it via the real send engines."] },
  roi: { title: "ROI Planner", goal: "Model channel ROI before you spend.", status: D, statusNote: "Uses baseline CAC/conversion models; connect ad-platform results for measured ROI.",
    steps: ["Enter channel + budget assumptions.", "Read the modelled ROI.", "Use it to plan; confirm against real results later."] },
  budget: { title: "Budget Protection", goal: "Set guardrails on ad spend.", status: D, statusNote: "Modelled estimates today; connect Meta/Google Ads for live spend.",
    steps: ["Enter your budget + targets.", "Read the verdict/guardrails.", "Apply the stop-loss rules in your ad accounts."] },

  // ── Admin / infra ─────────────────────────────────────────────────────
  "go-live": { title: "Go-Live Readiness", goal: "See exactly what's needed to take money.", status: R,
    steps: ["Read each check — green = ready, action = one config step (with the fix), off = not set.", "Do the money-path steps first (Stripe + Auth).", "Press Re-check after setting a key in Vercel."] },
  admin: { title: "Admin", goal: "Owner economics and platform controls.", status: R,
    steps: ["Owner-only: see real margins over the ACU ledger.", "Review platform health and controls.", "Use Go-Live for the money-path checklist."] },
  settings: { title: "Settings", goal: "Set brand details and autonomy level.", status: R,
    steps: ["Set brand info, logo and colours.", "Choose how much Autopilot can do on its own.", "Save — it persists per brand."] },
  integrations: { title: "Integrations", goal: "See what's connected and what a connector costs.", status: R,
    steps: ["See each connector's state (derived from real env keys).", "Read the ACU cost per connector (margin-protected).", "Connect what you need in the relevant tool."] },
  audit: { title: "Audit", goal: "Score your marketing readiness.", status: R,
    steps: ["Answer the intake questions.", "Get a real, deterministic readiness score.", "Fix the lowest-scoring areas first."] },
  briefing: { title: "Briefing", goal: "A daily brief from your real results.", status: K, statusNote: "The results panel is real; the strategist advisor needs an AI key.",
    steps: ["Read the recent-results panel (real ledger).", "Ask the strategist for guidance (needs AI key).", "Act on the top recommendation."] },
  command: { title: "Command Center", goal: "The speed-of-money strike queue.", status: R,
    steps: ["Read the ranked strike queue from your real results.", "Click the top strike.", "Execute it in the tool it opens."] },
  influencers: { title: "Influencers", goal: "Recruit and pay creators.", status: R,
    steps: ["Set up your programme (real ledger/payouts).", "Recruit creators (AI advisor needs a key).", "Track payouts and performance."] },
  "partner-network": { title: "Partner Network", goal: "Run your growth-partner programme.", status: R,
    steps: ["Configure the programme + commissions.", "Onboard partners (real subscription/ledger engine).", "Track earnings and payouts."] },
  "sending-domains": { title: "Sending Domains", goal: "Authenticate your email domain for deliverability.", status: R,
    steps: ["Enter your sending domain.", "Copy the exact DKIM/DNS records it generates.", "Add them at your DNS host, then click verify (real live DNS lookup)."] },
};

// Generic fallback for any route without a bespoke guide.
export const GENERIC_GUIDE: Guide = {
  title: "How to use this",
  goal: "Get value from this module in a few steps.",
  status: "ready",
  steps: ["Pick your brand in the top-left switcher.", "Fill the input fields on this page with your real details.", "Run the action — every engine has an honest demo fallback, so it always produces something.", "Check Go-Live to see which providers turn demo into fully-live."],
  next: { label: "Go-Live readiness", href: "/dashboard/go-live" },
};

// Resolve the guide for a dashboard pathname (e.g. "/dashboard/customers").
export function guideForPath(pathname: string): { key: string; guide: Guide } {
  const m = pathname.replace(/\/+$/, "").match(/^\/dashboard(?:\/([^/]+))?/);
  const key = m ? (m[1] || "") : "";
  return { key, guide: GUIDES[key] || GENERIC_GUIDE };
}
