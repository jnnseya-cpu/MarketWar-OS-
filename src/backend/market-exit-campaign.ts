// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE CAPTURE CAMPAIGN (§5) — what actually gets built once a closure is proved.
//
// WHAT THIS IS NOT. It is not a second page builder. `programmatic-seo.ts` has
// generated location, service-area and comparison pages with duplicate-content
// control since long before this engine existed, and it keeps doing it here —
// this file supplies the axes and the constraints, and takes the specs back.
// One source of truth per concept.
//
// THE ONE RULE THAT SHAPES EVERY ASSET. A displaced customer is searching for a
// business that no longer exists, and the page that meets them is one word away
// from claiming to BE that business. So every piece of copy this file produces
// goes through `screenPublication` before it is returned, and an asset that
// fails is not returned with a warning attached — it is not returned. A campaign
// that ships with a violation flagged on it is a campaign that ships with a
// violation.
//
// Outreach is separated from everything else deliberately. Pages and ads meet
// people who came looking; outreach goes to people who did not ask, so it is
// gated on a recorded consent and comes back empty rather than unsent.

import { buildPage, type PageSpec } from "@/backend/programmatic-seo";
import {
  screenPublication, REQUIRED_DISCLOSURE,
  type DemandOpportunity, type ReplacementMatch, type ControlFinding,
} from "@/shared/market-exit";

export type CampaignAssetKind =
  | "alternative_landing_page"
  | "local_seo_page"
  | "comparison_page"
  | "search_ad"
  | "social_ad"
  | "lead_form"
  | "outreach_message";

export type CampaignAsset = {
  kind: CampaignAssetKind;
  headline: string;
  body: string;
  /** Present for the three page kinds; the SEO engine's own spec, unmodified. */
  page?: PageSpec;
  /** Where a customer goes next. Never a link to the closed business. */
  callToAction: string;
  /** The disclosure, carried on the asset rather than assumed to be nearby. */
  disclosure: string;
};

export type CampaignPlan = {
  opportunity: string;
  replacement: string;
  assets: CampaignAsset[];
  /** Assets the controls refused, and why. Named, never silently dropped. */
  refused: { kind: CampaignAssetKind; findings: ControlFinding[] }[];
  /** Things a person must supply or decide before this runs. */
  blockers: string[];
  note: string;
};

/**
 * The safe way to name a closed business: as the thing the customer was looking
 * for, never as the sender and never as a relationship. "Alternative to X" is a
 * statement about the reader's search. "X's new home" is a claim about X.
 */
function alternativeHeadline(closedName: string, replacementName: string): string {
  return `Looking for an alternative to ${closedName}? ${replacementName} covers the same area.`;
}

export function buildCampaign(input: {
  opportunity: DemandOpportunity;
  match: ReplacementMatch;
  /** Consent for outreach. Its absence removes the outreach asset entirely. */
  consentRecorded?: boolean;
  /** Where the lead form posts. Without it there is no campaign, only copy. */
  destinationUrl?: string;
}): CampaignPlan {
  const o = input.opportunity;
  const closed = o.closedBusiness;
  const brand = input.match.name;
  const service = o.services[0] || closed.category;
  const location = `${closed.city} ${closed.postcodePrefix}`.trim();

  const blockers: string[] = [];
  if (!input.destinationUrl) {
    blockers.push("No destination URL for the lead form. Pages that capture nothing are content, not a campaign.");
  }
  if (o.displacedDemand.customersPerMonth === null) {
    blockers.push("Displaced demand is unmeasured, so there is no counted basis for a budget. " + (o.displacedDemand.missing[0] ?? ""));
  }

  const cta = input.destinationUrl
    ? `Get a quote from ${brand}`
    : `Get a quote from ${brand} (destination not set)`;

  const candidates: CampaignAsset[] = [];

  // 1. The landing page the search actually lands on.
  candidates.push({
    kind: "alternative_landing_page",
    headline: alternativeHeadline(closed.name, brand),
    body: `${closed.name} in ${location} has closed. ${brand} works in the same area and offers ${o.services.length ? o.services.slice(0, 3).join(", ") : closed.category.toLowerCase()}. ${input.match.reasons.slice(0, 3).join(" ")}`,
    page: buildPage("comparison", { brand, a: `Alternative to ${closed.name}`, b: brand, service, location }),
    callToAction: cta,
    disclosure: REQUIRED_DISCLOSURE,
  });

  // 2. The local page for people searching the service rather than the name.
  candidates.push({
    kind: "local_seo_page",
    headline: `${service} in ${location}`,
    body: `${brand} covers ${location}. ${input.match.reasons.slice(0, 2).join(" ")}`,
    page: buildPage("service_area", { brand, service, location }),
    callToAction: cta,
    disclosure: REQUIRED_DISCLOSURE,
  });

  // 3. The comparison page, which is where the affiliation risk is highest and
  //    where the disclosure earns its place.
  candidates.push({
    kind: "comparison_page",
    headline: `${closed.name} vs ${brand}`,
    body: `${closed.name} has closed. This page sets out what ${brand} offers in ${location} for anyone who used to go there.`,
    page: buildPage("comparison", { brand, a: closed.name, b: brand, service, location }),
    callToAction: cta,
    disclosure: REQUIRED_DISCLOSURE,
  });

  // 4 & 5. Paid. Short by necessity, which is exactly when copy starts implying
  //        things it has no room to qualify — so the disclosure rides along.
  candidates.push({
    kind: "search_ad",
    headline: `Alternative to ${closed.name} in ${closed.city}`.slice(0, 90),
    body: `${brand} — ${service} in ${location}. ${REQUIRED_DISCLOSURE}`,
    callToAction: cta,
    disclosure: REQUIRED_DISCLOSURE,
  });
  candidates.push({
    kind: "social_ad",
    headline: `${closed.name} has closed. ${brand} covers ${closed.city}.`,
    body: `${input.match.reasons.slice(0, 2).join(" ")} ${REQUIRED_DISCLOSURE}`,
    callToAction: cta,
    disclosure: REQUIRED_DISCLOSURE,
  });

  // 6. The form. The only asset that captures anything.
  candidates.push({
    kind: "lead_form",
    headline: `Tell ${brand} what you need`,
    body: `Your postcode, what the job is, and how to reach you. It goes to ${brand} and nobody else. ${REQUIRED_DISCLOSURE}`,
    callToAction: input.destinationUrl ? `Send to ${input.destinationUrl}` : "No destination set — this form captures nothing yet.",
    disclosure: REQUIRED_DISCLOSURE,
  });

  // 7. Outreach — ONLY with a recorded consent, and absent rather than blocked
  //    without one. An unsent message in a plan is a message somebody sends.
  if (input.consentRecorded === true) {
    candidates.push({
      kind: "outreach_message",
      headline: `About ${closed.name}`,
      body: `You asked us to let you know about ${service} in ${location}. ${closed.name} has closed; ${brand} covers the same area. ${REQUIRED_DISCLOSURE}`,
      callToAction: cta,
      disclosure: REQUIRED_DISCLOSURE,
    });
  } else {
    blockers.push("No recorded consent, so no outreach message was produced. Displaced customers are strangers to this business and a closure is not a lawful basis for contacting them.");
  }

  // EVERY ASSET THROUGH THE CONTROLS. Including the ones this file wrote itself
  // — especially those. The generator is not exempt from the screen just because
  // it was written by somebody who had read the rules.
  const assets: CampaignAsset[] = [];
  const refused: CampaignPlan["refused"] = [];
  for (const a of candidates) {
    const copy = `${a.headline} ${a.body} ${a.disclosure}`;
    const screen = screenPublication({
      copy,
      closedBusinessName: closed.name,
      isOutreach: a.kind === "outreach_message",
      consentRecorded: input.consentRecorded,
    });
    if (screen.ok) assets.push(a);
    else refused.push({ kind: a.kind, findings: screen.refusals });
  }

  return {
    opportunity: o.id,
    replacement: brand,
    assets,
    refused,
    blockers,
    note: refused.length > 0
      ? `${assets.length} assets built, ${refused.length} refused by the mandatory controls. A refused asset is not returned with a warning — it is not returned.`
      : `${assets.length} assets built for ${brand}, each carrying the disclosure.${blockers.length ? ` ${blockers.length} ${blockers.length === 1 ? "thing" : "things"} still needed before it runs.` : ""}`,
  };
}
