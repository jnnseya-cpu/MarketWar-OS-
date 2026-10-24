// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// DATA-SUBJECT RIGHTS — THE REGISTER, THE EXPORT AND THE ERASURE.
//
// WHY THIS FILE EXISTS, AND IT IS NOT A HAPPY STORY. The Settings page carried
// two buttons, "Export my data" and "Request erasure", under copy that read
// "Erasure propagates everywhere — including analytics — under the GDPR erasure
// API". Neither button had a handler. There was no erasure API. There was no
// export. A person exercising a right the law gives them pressed a control that
// did nothing and got no feedback, and the page told them the propagation had
// happened. That is the worst class of defect this platform can ship: not a
// feature that is missing, but a claim that is false, on the one surface where
// being wrong is also being unlawful.
//
// So the claim is now the implementation.
//
// THE HARD PART IS NOT THE DELETE — IT IS KNOWING WHAT WE HOLD. Ninety
// Firestore collections are written by sixty backend modules. A hand-written
// list of them is stale the day someone adds the ninety-first, and a stale list
// makes an export that silently misses data while reporting success — which is
// this repository's oldest defect class (a value on one side of a boundary that
// never got carried across) wearing a compliance hat.
//
// So the register below is not documentation. It is the register, and
// `npm run check:register` FAILS if the backend touches a collection that is
// not in it. Completeness is enforced by a gate rather than asserted by a
// comment.
//
// THREE THINGS THE LAW DOES NOT LET US SIMPLY DELETE, and each is recorded
// against the store rather than decided in the moment:
//
//   • A SUPPRESSION LIST. Erasing someone's unsubscribe record would let the
//     platform mail them again — deleting the evidence of an objection
//     defeats the objection. Article 17(3)(b)/21 territory: the record is
//     RETAINED precisely in order to honour the right that created it.
//   • A FINANCIAL RECORD. Commission accruals, payouts, clawbacks and wallet
//     ledgers are kept under UK tax law (six years) and anti-fraud duty. They
//     are retained, and where they carry a name or an address that is not
//     needed for the accounting, that identifier is STRIPPED and the money
//     stays.
//   • A SECURITY AND AUDIT TRAIL. An audit log that the subject of the audit
//     can delete is not an audit log.
//
// Everything else goes.
//
// WHAT THIS CANNOT DO, STATED PLAINLY AND REPEATED IN THE RECEIPT. Some stores
// are keyed by something other than a brand — an account uid, a creator id, a
// recipient address, a hashed IP. A brand-scoped erasure cannot reach those,
// and the receipt names every one of them rather than quietly reporting a clean
// sweep. `docs/REQUIREMENTS-COVERAGE.md` §Gaps carries the same list.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

// Module-level readers, used in preference to a raw query where one exists:
// they decrypt, reconcile the memory store, and return the shape the feature
// itself uses — so a zero-config demo exports its real in-memory data instead
// of reporting an empty Firestore.
import { listContacts, clearContacts } from "@/backend/contacts";
import { listEvents, clearEvents } from "@/backend/ledger";
import { listInbound, clearInbound } from "@/backend/inbound";
import { brandEvents, suppressedEmails, pseudonymiseBrandEvents } from "@/backend/email-events";
import { listPages, clearPages } from "@/backend/landing-store";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** How a store's documents are reachable from a brand id. */
export type Scope =
  /** `where(field == brandId)`. */
  | { by: "field"; field: string }
  /** The document id IS the brand id. */
  | { by: "docId" }
  /** The document id starts with the brand id and a separator. */
  | { by: "docIdPrefix"; separator: string }
  /** Not reachable from a brand id at all — and why. */
  | { by: "unreachable"; why: string };

/** What erasure is allowed to do to a store, and on whose authority. */
export type Retention =
  /** Delete the documents outright. */
  | { mode: "erase" }
  /** Keep the document, remove these fields. */
  | { mode: "anonymise"; strip: readonly string[]; basis: string }
  /** Leave it alone — the law requires it kept. */
  | { mode: "retain"; basis: string };

export type DataStore = {
  collection: string;
  /** Plain English, for the transparency response. No jargon. */
  holds: string;
  /** Does it hold personal data as the UK GDPR means it? */
  personal: boolean;
  scope: Scope;
  retention: Retention;
};

const ERASE: Retention = { mode: "erase" };
const FINANCIAL = "Financial record — kept six years under UK tax law and anti-fraud duty (UK GDPR Art. 17(3)(b): compliance with a legal obligation).";
const AUDIT = "Security and audit trail — an audit record the audited party can delete is not an audit record.";
const OBJECTION = "Suppression record — kept in order to honour the objection that created it. Deleting it would permit contact again (UK GDPR Art. 21).";
const PLATFORM_OWN = "MarketWar's own operational data, not the tenant's — holds no personal data of this brand's subject.";

// ---------------------------------------------------------------------------
// THE REGISTER — every collection the backend writes.
// Ordered alphabetically so a diff against the gate's output reads cleanly.
// ---------------------------------------------------------------------------
export const DATA_STORES: readonly DataStore[] = [
  { collection: "acquisition_prospects", holds: "Prospect companies and the contact details found for them", personal: true, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "ad_docs", holds: "Ad canvas documents — layers, copy, layout", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "agent_budget", holds: "Daily ACU spend per brand, for the agent budget ceiling", personal: false, scope: { by: "docIdPrefix", separator: "::" }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "agent_runs", holds: "Agent invocations — the input is encrypted at rest", personal: true, scope: { by: "unreachable", why: "Keyed by an auto-id; the brand reference sits inside the AES-256-GCM encrypted input blob and is not queryable. Erasing the brand's key would make every row unreadable, which is the practical erasure." }, retention: ERASE },
  { collection: "agent_spend", holds: "Per-agent ACU spend rows", personal: false, scope: { by: "field", field: "brandId" }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "ai_jobs", holds: "Continuing AI work — the effort-law job queue", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "ai_spend_months", holds: "Platform-wide monthly AI provider spend", personal: false, scope: { by: "unreachable", why: "A platform aggregate by calendar month, with no tenant dimension." }, retention: { mode: "retain", basis: PLATFORM_OWN } },
  { collection: "ai_visibility_runs", holds: "AI-visibility measurement runs for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "ai_visibility_schedules", holds: "Which brands are swept for AI visibility, and when", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "analytics_consent", holds: "Whether an account consented to product analytics", personal: true, scope: { by: "unreachable", why: "Keyed by the account uid, not by a brand — this is the ACCOUNT's consent record, erased with the account rather than with one of its brands." }, retention: { mode: "retain", basis: "Consent record — kept as the evidence that consent was given or refused, which is the controller's burden of proof (UK GDPR Art. 7(1))." } },
  { collection: "approval_items", holds: "Work waiting for the operator's approval", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "asset_versions", holds: "Version history of generated assets", personal: false, scope: { by: "unreachable", why: "Keyed by asset id; the brand reference lives on the asset, not on the version row." }, retention: ERASE },
  { collection: "audit_logs", holds: "Who did what in the platform", personal: true, scope: { by: "unreachable", why: "Keyed by entry id and written for the platform as a whole rather than per brand, so a brand-scoped sweep cannot select its rows." }, retention: { mode: "retain", basis: AUDIT } },
  { collection: "audit_quota_uses", holds: "Free-audit usage counted against a salted hash of the caller", personal: false, scope: { by: "unreachable", why: "Keyed by a salted SHA-256 of an account id or IP — by design there is no way back from the key to the person, which is what makes the quota privacy-preserving." }, retention: { mode: "retain", basis: "Already pseudonymised at the point of writing — the row cannot be tied back to a person, so there is nothing to erase." } },
  { collection: "audits", holds: "Website audit reports — the input is encrypted at rest", personal: true, scope: { by: "unreachable", why: "Keyed by an auto-id; the business reference sits inside the encrypted input blob and is not queryable." }, retention: ERASE },
  { collection: "blog_posts", holds: "MarketWar's own published marketing articles", personal: false, scope: { by: "unreachable", why: "The platform's own content, keyed by slug — not tenant data." }, retention: { mode: "retain", basis: PLATFORM_OWN } },
  { collection: "brand_chain_schedules", holds: "Scheduled agent chains for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "brand_chains", holds: "Saved agent chains for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "brand_connections", holds: "Connector tokens the brand granted (encrypted)", personal: false, scope: { by: "docIdPrefix", separator: "::" }, retention: ERASE },
  { collection: "brand_float", holds: "The brand's float ledger — money held and released", personal: false, scope: { by: "field", field: "brandId" }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "brand_google_oauth", holds: "The brand's own Google refresh token (encrypted)", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "brand_identities", holds: "Brand identity — voice, palette, positioning", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "brand_memory", holds: "What the agents have learned about the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "brand_postback_secrets", holds: "The brand's conversion-postback signing secret", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "brands", holds: "The brand record itself and who owns it", personal: true, scope: { by: "docId" }, retention: ERASE },
  { collection: "client_errors", holds: "Browser errors reported by the app, for debugging", personal: false, scope: { by: "unreachable", why: "Keyed by an error reference; rows are deliberately written without a tenant dimension so a crash report cannot profile a customer." }, retention: ERASE },
  { collection: "commission_accruals", holds: "Commission owed on referred revenue", personal: false, scope: { by: "unreachable", why: "Keyed by referral code against a CREATOR, who is a different data subject from the brand." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "contact_finder_jobs", holds: "Contact-discovery jobs and their results", personal: true, scope: { by: "docIdPrefix", separator: "::" }, retention: ERASE },
  { collection: "contact_source_policy", holds: "Which discovery sources a brand permits", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "contact_source_stats", holds: "Hit rates per discovery source", personal: false, scope: { by: "unreachable", why: "Platform-wide source quality statistics, keyed by source — no tenant dimension." }, retention: { mode: "retain", basis: PLATFORM_OWN } },
  { collection: "contact_suppressions", holds: "Addresses and numbers that must never be contacted again", personal: true, scope: { by: "unreachable", why: "Keyed by a hash of the address with its channel and scope, deliberately so the list can be checked without storing the address in the clear." }, retention: { mode: "retain", basis: OBJECTION } },
  { collection: "contacts", holds: "The brand's contact list — names, emails, phones, companies", personal: true, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "conversion_orders", holds: "Order ids already counted, so a conversion is never double-counted", personal: false, scope: { by: "unreachable", why: "An idempotency key set, keyed by the order reference, so a conversion that arrives twice is counted once. No customer data on the row." }, retention: { mode: "retain", basis: "Idempotency record — losing it would let a conversion be counted twice, which is a financial error." } },
  { collection: "creator_accounts", holds: "Creator accounts — name, payout details, access token", personal: true, scope: { by: "unreachable", why: "A CREATOR is a different data subject from a brand; their data is erased on their own request, not on a brand's." }, retention: ERASE },
  { collection: "creator_clawbacks", holds: "Commission reversed after a refund or a chargeback", personal: false, scope: { by: "unreachable", why: "Keyed against a creator. A creator is a separate data subject with their own rights, so their records are erased on their own request and not on a brand's." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "creator_ledger", holds: "Creator earnings events", personal: false, scope: { by: "unreachable", why: "Keyed against a creator. A creator is a separate data subject with their own rights, so their records are erased on their own request and not on a brand's." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "creator_payouts", holds: "Payments made to creators", personal: true, scope: { by: "unreachable", why: "Keyed against a creator. A creator is a separate data subject with their own rights, so their records are erased on their own request and not on a brand's." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "creator_programmes", holds: "The brand's creator programme — terms and commission", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "creator_subscriptions", holds: "Which creators joined which programme", personal: false, scope: { by: "unreachable", why: "Keyed by subscription id against a creator; the programme carries the brand, the subscription does not." }, retention: ERASE },
  { collection: "digest_subscriptions", holds: "Who receives the weekly digest, and where", personal: true, scope: { by: "unreachable", why: "Keyed by the owner's account uid — an ACCOUNT preference, erased with the account." }, retention: ERASE },
  { collection: "email_events", holds: "Sends, opens, clicks, bounces and complaints, with the recipient address", personal: true, scope: { by: "field", field: "brandId" }, retention: { mode: "anonymise", strip: ["email"], basis: "Deliverability and abuse defence — the event is kept so bounce and complaint rates stay honest, with the recipient's address replaced by a hash of itself so the row no longer identifies anybody while two events from the same person still match." } },
  { collection: "email_sends", holds: "Proof that a message left our sending pool — recipient, subject, provider id", personal: true, scope: { by: "unreachable", why: "The row carries the recipient address but no brand id, so a brand-scoped erasure cannot find it. Recorded as a gap in docs/REQUIREMENTS-COVERAGE.md §Gaps: the row needs a brandId before this store can be covered." }, retention: { mode: "retain", basis: "Delivery evidence — the record that answers 'did it send?' at the provider's support desk." } },
  { collection: "email_suppressions", holds: "Addresses that unsubscribed, bounced or complained for this brand", personal: true, scope: { by: "field", field: "brandId" }, retention: { mode: "retain", basis: OBJECTION } },
  { collection: "email_templates", holds: "The brand's saved email templates", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "email_warmup", holds: "Sending-volume warm-up state for the brand's domain", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "emergency_stops", holds: "Which lanes are halted, platform-wide or per brand", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "erasure_receipts", holds: "The receipt for each erasure this brand asked for — what was deleted, what was kept and why", personal: false, scope: { by: "docIdPrefix", separator: "__" }, retention: { mode: "retain", basis: "Evidence that the erasure was carried out. An erasure that deletes its own proof cannot be demonstrated to the person who asked for it, or to the ICO." } },
  { collection: "experiment_history", holds: "Experiment results for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "google_mappings", holds: "Which Google property maps to the brand", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "inbound_messages", holds: "Replies that came back — sender address, subject, body", personal: true, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "invites", holds: "Workspace invitations — the invited email address", personal: true, scope: { by: "unreachable", why: "Keyed by invitation token; an invite belongs to a workspace rather than to one brand." }, retention: ERASE },
  { collection: "landing_pages", holds: "Landing pages the brand published", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "likeness_consents", holds: "Consent to use a person's face or voice, and its evidence", personal: true, scope: { by: "field", field: "brandId" }, retention: { mode: "retain", basis: "Consent evidence — the record proving a likeness was used with permission. Erasing it destroys the defence to a complaint by the person depicted, who is a third party with their own rights." } },
  { collection: "market_exit_records", holds: "Markets the brand withdrew from, and why", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "memberships", holds: "Who has access to which workspace or brand", personal: true, scope: { by: "unreachable", why: "Keyed by membership id against an account uid; membership is a workspace fact, removed when the account or the workspace goes." }, retention: ERASE },
  { collection: "meta_connections", holds: "The brand's Meta page connection (encrypted token)", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "newsletter_issues", holds: "MarketWar's own newsletter issues", personal: false, scope: { by: "unreachable", why: "MarketWar's own published newsletter issues, keyed by issue — the platform's content, not any customer's data." }, retention: { mode: "retain", basis: PLATFORM_OWN } },
  { collection: "newsletter_optouts", holds: "Hashed addresses that opted out of MarketWar's newsletter", personal: true, scope: { by: "unreachable", why: "Keyed by a hash of the address, with no brand dimension — a platform-level objection." }, retention: { mode: "retain", basis: OBJECTION } },
  { collection: "opportunity_board", holds: "Opportunities surfaced for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "org_wallets", holds: "The brand's ACU balance, plan and billing cycle", personal: false, scope: { by: "docId" }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "page_stats", holds: "Page view and conversion counts for the brand's pages", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "partner_applications", holds: "Applications to the partner programme — name, email, company", personal: true, scope: { by: "unreachable", why: "An application to MarketWar itself, keyed by application id, made before any brand exists." }, retention: ERASE },
  { collection: "payout_attempts", holds: "Attempts to pay a creator, and what the rail said", personal: false, scope: { by: "unreachable", why: "Keyed against a creator. A creator is a separate data subject with their own rights, so their records are erased on their own request and not on a brand's." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "payout_disputes", holds: "Disputed payouts raised against the brand's programme", personal: false, scope: { by: "field", field: "brandId" }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "payout_identities", holds: "Creator identity checks for payouts", personal: true, scope: { by: "unreachable", why: "Keyed against a creator. A creator is a separate data subject with their own rights, so their records are erased on their own request and not on a brand's." }, retention: { mode: "retain", basis: "Anti-money-laundering and sanctions-screening record on a creator, kept under the duty that required the check." } },
  { collection: "platform_config", holds: "MarketWar's own platform configuration", personal: false, scope: { by: "unreachable", why: "Platform-wide configuration singletons such as the OAuth client. No tenant dimension and nothing about any customer in them." }, retention: { mode: "retain", basis: PLATFORM_OWN } },
  { collection: "portal_links", holds: "Which client-portal links were withdrawn", personal: false, scope: { by: "unreachable", why: "Keyed by the shared item id; the brand is carried inside the signed token rather than on the revocation row." }, retention: { mode: "retain", basis: "Revocation list — losing it would make a withdrawn share link work again." } },
  { collection: "processed_events", holds: "Payment events already applied, so money is never applied twice", personal: false, scope: { by: "unreachable", why: "An idempotency key set, keyed by the payment provider's event id, so a top-up webhook delivered twice credits once." }, retention: { mode: "retain", basis: "Idempotency record — losing it would let a top-up be credited twice." } },
  { collection: "promotable_products", holds: "The brand's products offered to creators", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "promotion_policies", holds: "The brand's promotion rules for creators", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "publications", holds: "What was published where, on the brand's behalf", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "referral_attributions", holds: "Which creator introduced which account", personal: false, scope: { by: "unreachable", why: "Keyed by the referred account id against a creator." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "referral_clicks", holds: "Clicks on referral links, counted per code", personal: false, scope: { by: "unreachable", why: "Keyed by referral code; no address or device identifier is stored on the row." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "results", holds: "The brand's results ledger — revenue events the OS recorded", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "review_asks", holds: "Review requests sent on the brand's behalf", personal: true, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "security_events", holds: "Refused requests, floods and anomalies — actor is a hashed IP or a uid", personal: false, scope: { by: "unreachable", why: "Written to a platform-wide ring and keyed by event id; the brand is an optional annotation, not the key." }, retention: { mode: "retain", basis: AUDIT } },
  { collection: "sending_domains", holds: "The brand's authenticated sending domains and DKIM keys", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "seo_autopilot", holds: "SEO autopilot state for the brand", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "seo_deployments", holds: "SEO changes deployed for the brand", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "settings", holds: "The brand's autonomy dial — how far the agents may act alone", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "share2earn_earnings", holds: "What sharers earned on the brand's missions", personal: false, scope: { by: "unreachable", why: "Keyed by creator and earning id; the mission carries the brand, the earning row does not." }, retention: { mode: "retain", basis: FINANCIAL } },
  { collection: "share2earn_missions", holds: "The brand's share-to-earn missions", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "site_facts", holds: "What the crawler learned about the brand's website", personal: false, scope: { by: "docId" }, retention: ERASE },
  { collection: "trend_watches", holds: "Trend sweeps run for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "video_jobs", holds: "Video renders for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "webhook_receipts", holds: "The last payment webhook we accepted, for monitoring", personal: false, scope: { by: "unreachable", why: "A single document recording the last payment webhook the platform accepted, for monitoring — it has no tenant dimension and holds nothing about any customer." }, retention: { mode: "retain", basis: PLATFORM_OWN } },
  { collection: "work_library", holds: "Everything the agents produced for the brand", personal: false, scope: { by: "field", field: "brandId" }, retention: ERASE },
  { collection: "workspaces", holds: "Workspaces and the brands inside them", personal: false, scope: { by: "unreachable", why: "A workspace can hold several brands, so erasing one brand must not remove it." }, retention: ERASE },
  { collection: "zernio_events", holds: "Publishing webhook events already processed", personal: false, scope: { by: "unreachable", why: "An idempotency key set, keyed by the publishing connector's event id, so a webhook delivered twice is applied once." }, retention: { mode: "retain", basis: "Idempotency record — losing it would let an already-processed publishing event be applied a second time." } },
  { collection: "zernio_posts", holds: "Published post state from the publishing connector", personal: false, scope: { by: "unreachable", why: "Keyed by the publishing connector's post id, which the brand reference does not appear on." }, retention: ERASE },
  { collection: "zernio_profiles", holds: "Which publisher profile belongs to the brand", personal: false, scope: { by: "docId" }, retention: ERASE },
];

export function storeFor(collection: string): DataStore | undefined {
  return DATA_STORES.find((s) => s.collection === collection);
}

/** Collections an export or erasure can actually reach from a brand id. */
export function brandScoped(): readonly DataStore[] {
  return DATA_STORES.filter((s) => s.scope.by !== "unreachable");
}

// ---------------------------------------------------------------------------
// Module readers — preferred over a raw query, because they decrypt, reconcile
// the in-memory store and return the feature's own shape.
// ---------------------------------------------------------------------------
const READERS: Record<string, ((brandId: string) => Promise<unknown[]>) | undefined> = {
  contacts: (b) => listContacts(b),
  results: (b) => listEvents(b),
  inbound_messages: (b) => listInbound(b, 1000),
  email_events: (b) => brandEvents(b, 10_000),
  landing_pages: (b) => listPages(b),
  email_suppressions: async (b) => [...(await suppressedEmails(b))].map((email) => ({ email })),
};

/**
 * Module erasers — used in preference to a raw delete wherever one exists.
 *
 * REQUIRED FOR ANY STORE THAT KEEPS AN IN-MEMORY COPY, and this was measured
 * rather than reasoned about. The first version of this file swept Firestore
 * generically: with persistence unconfigured it removed NOTHING, reported
 * `erased, 0 documents`, and a brand's revenue event was still readable
 * afterwards. A reported success that never happened, on a statutory right, in
 * the module written to stop exactly that.
 *
 * The four stores that hold the platform's plainest personal data each own
 * their own eraser now, so the receipt is true in both modes. A store with no
 * entry here and no configured database is reported as SKIPPED with the reason
 * — never as erased.
 */
const ERASERS: Record<string, ((brandId: string) => Promise<unknown>) | undefined> = {
  contacts: clearContacts,
  results: clearEvents,
  inbound_messages: clearInbound,
  landing_pages: clearPages,
};

/**
 * Module anonymisers, returning how many records they rewrote.
 *
 * REQUIRED, NOT AN OPTIMISATION. The generic path below deletes the named
 * fields from the document — which is wrong for any store whose DOCUMENT ID
 * contains the identifier, and `email_events` keys its rows
 * `brandId::type::email::at`. A field delete there would leave the recipient's
 * address in the primary key and collapse every unique-recipient count to one.
 * The driver caught exactly that: the receipt reported rows "anonymised" while
 * the address was still in a fresh export.
 *
 * A store with no entry here falls through to the generic field delete, which
 * is correct only when the id carries nothing identifying.
 */
const ANONYMISERS: Record<string, ((brandId: string) => Promise<number>) | undefined> = {
  email_events: pseudonymiseBrandEvents,
};

/**
 * Does this store own an eraser that works WITHOUT a configured database?
 *
 * Exported so the invariant can be tested from outside: with no database, a
 * store with no module eraser must be reported SKIPPED and never erased. A
 * test could otherwise not tell the two apart, because a store with no reader
 * shows nothing in the export either way — and a mutant that relabelled every
 * skipped store as "erased" passed until this was exported.
 */
export function hasModuleEraser(collection: string): boolean {
  return Boolean(ERASERS[collection]) || Boolean(ANONYMISERS[collection]);
}

// ---------------------------------------------------------------------------
// Export — Article 15/20, the right of access and the right to portability
// ---------------------------------------------------------------------------

export type ExportedStore = {
  collection: string;
  holds: string;
  personal: boolean;
  /** How this store was reached, in words, so the reader can audit the export. */
  reachedBy: string;
  count: number;
  records: unknown[];
  /** Present when the store could not be read, and why. */
  note?: string;
};

export type BrandExport = {
  brandId: string;
  generatedAt: string;
  /** "live" when Firestore is configured; "memory" in the zero-config demo. */
  persistence: "live" | "memory";
  storesRead: number;
  recordsExported: number;
  stores: ExportedStore[];
  /** Stores a brand-scoped export cannot reach, each with the reason. */
  notReachable: { collection: string; holds: string; why: string }[];
  readMe: string[];
};

const MAX_ROWS = 5_000;

async function rawRead(store: DataStore, brandId: string): Promise<unknown[]> {
  if (!adminDb) return [];
  const col = adminDb.collection(store.collection);
  if (store.scope.by === "field") {
    const snap = await col.where(store.scope.field, "==", brandId).limit(MAX_ROWS).get();
    return snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  }
  if (store.scope.by === "docId") {
    const doc = await col.doc(docSafe(brandId)).get();
    return doc.exists ? [{ _id: doc.id, ...doc.data() }] : [];
  }
  if (store.scope.by === "docIdPrefix") {
    const { FieldPath } = await import("firebase-admin/firestore");
    const start = `${docSafe(brandId)}${store.scope.separator}`;
    const snap = await col.orderBy(FieldPath.documentId()).startAt(start).endAt(`${start}`).limit(MAX_ROWS).get();
    return snap.docs.map((d) => ({ _id: d.id, ...d.data() }));
  }
  return [];
}

/** Firestore document ids may not contain a slash; the stores sanitise the same way. */
function docSafe(id: string): string {
  return id.replace(/\//g, "_");
}

function reachedBy(scope: Scope): string {
  if (scope.by === "field") return `documents where ${scope.field} is this brand`;
  if (scope.by === "docId") return "the document named after this brand";
  if (scope.by === "docIdPrefix") return `documents whose id starts with this brand and "${scope.separator}"`;
  return "not reachable from a brand id";
}

export async function exportBrandData(brandId: string): Promise<BrandExport> {
  const id = (brandId || "").trim();
  if (!id) throw new Error("exportBrandData needs a brandId");
  const persistence: "live" | "memory" = adminConfigured && adminDb ? "live" : "memory";
  const stores: ExportedStore[] = [];

  for (const store of DATA_STORES) {
    if (store.scope.by === "unreachable") continue;
    const reader = READERS[store.collection];
    let records: unknown[] = [];
    let note: string | undefined;
    try {
      records = reader ? await reader(id) : await rawRead(store, id);
      // A store with no module reader and no configured Firestore has nowhere
      // to read FROM. Saying so beats reporting zero rows as if that were a
      // measurement — an empty export that looks successful is the defect this
      // whole file exists to stop.
      if (!reader && persistence === "memory") {
        note = "Not read: this store has no in-memory reader and persistence is not configured, so there is nothing stored to export.";
      }
    } catch (err) {
      note = `Could not be read: ${err instanceof Error ? err.message : "store unavailable"}`;
    }
    stores.push({
      collection: store.collection, holds: store.holds, personal: store.personal,
      reachedBy: reachedBy(store.scope), count: records.length, records, ...(note ? { note } : {}),
    });
  }

  const notReachable = DATA_STORES
    .filter((s) => s.scope.by === "unreachable")
    .map((s) => ({ collection: s.collection, holds: s.holds, why: s.scope.by === "unreachable" ? s.scope.why : "" }));

  return {
    brandId: id,
    generatedAt: new Date().toISOString(),
    persistence,
    storesRead: stores.filter((s) => !s.note).length,
    recordsExported: stores.reduce((n, s) => n + s.count, 0),
    stores,
    notReachable,
    readMe: [
      "This is everything MarketWar OS holds under this brand, read store by store at the moment you asked.",
      persistence === "live"
        ? "Persistence is configured, so these records come from the database."
        : "This workspace is running without a configured database, so these records come from the running process. Nothing is stored on a disk anywhere.",
      `${notReachable.length} stores cannot be reached from a brand id. Every one is listed under notReachable with the reason — they are not silently omitted.`,
      "Fields that were encrypted at rest are returned decrypted. Treat this file as you would the data itself.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Erasure — Article 17, the right to be forgotten, with its exceptions
// ---------------------------------------------------------------------------

export type ErasedStore = {
  collection: string;
  action: "erased" | "anonymised" | "retained" | "skipped";
  documents: number;
  /** For a retained store, the law or duty that keeps it. */
  basis?: string;
  note?: string;
};

export type ErasureReceipt = {
  brandId: string;
  requestedAt: string;
  completedAt: string;
  dryRun: boolean;
  persistence: "live" | "memory";
  documentsErased: number;
  documentsAnonymised: number;
  storesRetained: number;
  stores: ErasedStore[];
  notReachable: { collection: string; holds: string; why: string }[];
  statement: string[];
};

async function deleteWhere(store: DataStore, brandId: string, dryRun: boolean): Promise<number> {
  if (!adminDb) return 0;
  const rows = await rawRead(store, brandId);
  if (dryRun || rows.length === 0) return rows.length;
  const col = adminDb.collection(store.collection);
  let done = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = adminDb.batch();
    for (const row of rows.slice(i, i + 400)) {
      const docId = (row as { _id?: string })._id;
      if (!docId) continue;
      batch.delete(col.doc(docId));
      done++;
    }
    await batch.commit();
  }
  return done;
}

async function anonymiseWhere(store: DataStore, brandId: string, strip: readonly string[], dryRun: boolean): Promise<number> {
  if (!adminDb) return 0;
  const rows = await rawRead(store, brandId);
  if (dryRun || rows.length === 0) return rows.length;
  const { FieldValue } = await import("firebase-admin/firestore");
  const col = adminDb.collection(store.collection);
  let done = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const batch = adminDb.batch();
    for (const row of rows.slice(i, i + 400)) {
      const docId = (row as { _id?: string })._id;
      if (!docId) continue;
      const patch: Record<string, unknown> = { anonymisedAt: new Date().toISOString() };
      for (const field of strip) {
        if (Object.prototype.hasOwnProperty.call(row, field)) patch[field] = FieldValue.delete();
      }
      batch.set(col.doc(docId), patch, { merge: true });
      done++;
    }
    await batch.commit();
  }
  return done;
}

/**
 * Erase everything this brand's subject may have erased, anonymise what must
 * stay for a reason, and leave what the law requires kept — with a receipt
 * that names every store and every reason.
 *
 * `dryRun` counts without changing anything, which is how the UI can tell a
 * person what is about to happen before they confirm it.
 */
export async function eraseBrandData(brandId: string, opts: { dryRun?: boolean } = {}): Promise<ErasureReceipt> {
  const id = (brandId || "").trim();
  if (!id) throw new Error("eraseBrandData needs a brandId");
  const dryRun = opts.dryRun === true;
  const requestedAt = new Date().toISOString();
  const persistence: "live" | "memory" = adminConfigured && adminDb ? "live" : "memory";
  const stores: ErasedStore[] = [];

  for (const store of DATA_STORES) {
    if (store.scope.by === "unreachable") continue;

    if (store.retention.mode === "retain") {
      stores.push({ collection: store.collection, action: "retained", documents: 0, basis: store.retention.basis });
      continue;
    }

    try {
      if (store.retention.mode === "anonymise") {
        const module_ = ANONYMISERS[store.collection];
        let n: number;
        if (module_) {
          // Counted from the reader in dry-run so the preview and the receipt
          // cannot disagree, and run for real otherwise.
          if (dryRun) {
            const reader = READERS[store.collection];
            n = (await (reader ? reader(id) : rawRead(store, id))).length;
          } else {
            n = await module_(id);
          }
        } else {
          n = await anonymiseWhere(store, id, store.retention.strip, dryRun);
        }
        stores.push({ collection: store.collection, action: "anonymised", documents: n, basis: store.retention.basis });
        continue;
      }
      const eraser = ERASERS[store.collection];
      if (eraser) {
        // The module's own eraser clears BOTH its memory store and Firestore,
        // which a raw delete cannot do — so in demo mode this is the only path
        // that actually removes anything. Counted before erasing, by the same
        // reader in both modes, so the preview and the receipt cannot disagree.
        const reader = READERS[store.collection];
        const before = (await (reader ? reader(id) : rawRead(store, id))).length;
        if (!dryRun) await eraser(id);
        stores.push({ collection: store.collection, action: "erased", documents: before });
        continue;
      }
      // NO ERASER AND NO DATABASE MEANS NOTHING WAS REMOVED, AND THE RECEIPT
      // SAYS SO. Reporting `erased, 0` here is what made the first version of
      // this file lie: zero is a true count of what a Firestore sweep deleted
      // and a false account of what happened to the data.
      if (!adminDb) {
        stores.push({
          collection: store.collection, action: "skipped", documents: 0,
          note: "Not erased: no database is configured, so this store's only copy is in the running process and it has no in-memory eraser. That copy is never written to disk and is lost when the process restarts — but nothing was removed by this request.",
        });
        continue;
      }
      stores.push({ collection: store.collection, action: "erased", documents: await deleteWhere(store, id, dryRun) });
    } catch (err) {
      stores.push({
        collection: store.collection, action: "skipped", documents: 0,
        note: `Failed: ${err instanceof Error ? err.message : "store unavailable"}. Nothing was removed from this store.`,
      });
    }
  }

  const notReachable = DATA_STORES
    .filter((s) => s.scope.by === "unreachable")
    .map((s) => ({ collection: s.collection, holds: s.holds, why: s.scope.by === "unreachable" ? s.scope.why : "" }));

  const documentsErased = stores.filter((s) => s.action === "erased").reduce((n, s) => n + s.documents, 0);
  const documentsAnonymised = stores.filter((s) => s.action === "anonymised").reduce((n, s) => n + s.documents, 0);
  const failed = stores.filter((s) => s.action === "skipped");

  const receipt: ErasureReceipt = {
    brandId: id,
    requestedAt,
    completedAt: new Date().toISOString(),
    dryRun,
    persistence,
    documentsErased,
    documentsAnonymised,
    storesRetained: stores.filter((s) => s.action === "retained").length,
    stores,
    notReachable,
    statement: [
      dryRun
        ? "Nothing was changed. This is what an erasure would do, counted against the data as it stands now."
        : `Erasure ran. ${documentsErased} documents were deleted and ${documentsAnonymised} were stripped of identifying fields.`,
      `${stores.filter((s) => s.action === "retained").length} stores were kept on a stated legal basis — each one names it, and suppression lists are among them BECAUSE erasing an unsubscribe record would permit contact again.`,
      `${notReachable.length} stores are not reachable from a brand id and were not touched. Each is listed with the reason.`,
      failed.length
        ? `${failed.length} stores were NOT erased and are listed as skipped, each with the reason. ${persistence === "memory" ? "In this workspace that is because no database is configured, so those stores hold nothing durable — but the request did not remove what is in the running process." : "This erasure is INCOMPLETE until they succeed."}`
        : "No store was skipped.",
      persistence === "memory"
        ? "This workspace has no configured database, so the only data that existed was in the running process."
        : "Deletion was applied to the database directly.",
    ],
  };

  // The receipt is itself a record the regulator may ask for, so it is stored —
  // but never in a store this erasure would then delete.
  if (!dryRun && adminDb) {
    try {
      await adminDb.collection("erasure_receipts").doc(`${docSafe(id)}__${requestedAt}`).set(receipt);
    } catch { /* the response still carries it; a lost receipt must not fail the erasure */ }
  }

  return receipt;
}

/**
 * The transparency answer: what the platform holds, how it is keyed, and what
 * erasure would do to each store — with no tenant data in it, so it can be
 * served to anybody who asks what we keep.
 */
export function dataRegister(): {
  stores: number; personalStores: number; brandScoped: number; unreachable: number;
  erase: number; anonymise: number; retain: number;
  entries: { collection: string; holds: string; personal: boolean; reachedBy: string; onErasure: string; basis?: string }[];
} {
  const entries = DATA_STORES.map((s) => ({
    collection: s.collection,
    holds: s.holds,
    personal: s.personal,
    reachedBy: reachedBy(s.scope),
    onErasure:
      s.scope.by === "unreachable" ? "not reachable from a brand id"
      : s.retention.mode === "erase" ? "deleted"
      : s.retention.mode === "anonymise" ? `kept, with ${s.retention.strip.join(", ")} removed`
      : "kept",
    ...(s.retention.mode !== "erase" ? { basis: s.retention.basis } : {}),
  }));
  return {
    stores: DATA_STORES.length,
    personalStores: DATA_STORES.filter((s) => s.personal).length,
    brandScoped: brandScoped().length,
    unreachable: DATA_STORES.length - brandScoped().length,
    erase: DATA_STORES.filter((s) => s.retention.mode === "erase").length,
    anonymise: DATA_STORES.filter((s) => s.retention.mode === "anonymise").length,
    retain: DATA_STORES.filter((s) => s.retention.mode === "retain").length,
    entries,
  };
}
