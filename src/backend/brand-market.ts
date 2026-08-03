// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// One place every module asks "where does this brand sell?".
//
// Modules already took a `location` string — prospecting searches in it, local
// lead discovery searches in it, the AI-visibility questions are asked about
// it. What none of them had was a DEFAULT: leave the field blank and
// prospecting searched "United Kingdom" because that string is hardcoded in
// its fallback, whoever the customer was and wherever they sell.
//
// The brand now carries a real market, so this resolves it once and every
// module reads the same answer.
//
// AN EXPLICIT VALUE ALWAYS WINS. A customer typing "Manchester" into a search
// box means Manchester, even if their market is the whole UK — narrowing a
// single search is a normal thing to want, and silently overriding it with
// their account setting would make the box a lie.

import { getBrandById } from "@/backend/brand-store";
import { geoQualifier, marketDefined, EMPTY_MARKET, type TargetMarket } from "@/shared/market";

/**
 * The brand's stored market, or null.
 *
 * Null in demo, where there is no Admin SDK and the brand lives in the client's
 * localStorage — callers fall back to whatever the request carried, which is
 * safe there precisely because there are no accounts to confuse.
 */
export async function brandMarket(brandId: string | undefined | null): Promise<TargetMarket | null> {
  const id = (brandId || "").trim();
  if (!id) return null;
  const brand = await getBrandById(id);
  return brand?.targetMarket ?? null;
}

/**
 * The location string a search should use.
 *
 * Order: what the caller explicitly asked for → the brand's own market → "".
 *
 * Empty rather than a guess. "United Kingdom" as a hardcoded fallback is how a
 * business in Lagos got prospects in Leeds, and a search that returns the wrong
 * country is worse than one that asks where to look.
 */
export async function marketLocation(
  brandId: string | undefined | null,
  explicit?: string | null,
  fallbackMarket?: TargetMarket | null,
): Promise<string> {
  const typed = String(explicit ?? "").trim();
  if (typed) return typed;
  const stored = await brandMarket(brandId);
  const market = stored ?? fallbackMarket ?? EMPTY_MARKET;
  return marketDefined(market) ? geoQualifier(market) : "";
}
