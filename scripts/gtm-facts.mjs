// Facts for the go-to-market document, READ OUT OF THE CODEBASE.
//
// The price table in a plan document is exactly the sort of number that is
// correct on the day it is typed and wrong a month later. So it is not typed:
// it is parsed from src/backend/subscription.ts, which is the authoritative
// commercial model, and the derived figures use that file's own published
// rules (annual = 30% off twelve months; monthly ACUs = price × 20% × 100).
//
// If the parse finds nothing, this throws rather than falling back to a
// remembered table. A document that silently prints stale prices is worse than
// a build that fails.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SUBSCRIPTION = join(here, "..", "src", "backend", "subscription.ts");

const src = readFileSync(SUBSCRIPTION, "utf8");

const constant = (name, fallbackPattern) => {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([0-9.]+)`));
  if (!m) throw new Error(`gtm-facts: could not read ${name} from subscription.ts${fallbackPattern ?? ""}`);
  return Number(m[1]);
};

export const ACU_PER_GBP = constant("ACU_PER_GBP");
export const ACU_ALLOCATION_RATE = constant("ACU_ALLOCATION_RATE");
export const ANNUAL_DISCOUNT = constant("ANNUAL_DISCOUNT");
export const MIN_TOPUP_GBP = constant("MIN_TOPUP_GBP");

const gbp = (n) => (n === 0 ? "£0" : `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`);

const rows = [...src.matchAll(
  /\{\s*id:\s*"([a-z]+)",\s*name:\s*"([^"]+)",\s*monthlyGbp:\s*([0-9.]+),\s*brands:\s*([0-9]+|"custom"),\s*users:\s*([0-9]+|"custom")/g
)];
if (rows.length < 5) throw new Error(`gtm-facts: parsed only ${rows.length} plans from subscription.ts — the shape changed, fix the parser rather than the document`);

export const PLANS = rows.map(([, id, name, monthlyGbp, brands, users]) => {
  const monthly = Number(monthlyGbp);
  const annual = Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));
  return {
    id,
    name,
    monthly: gbp(monthly),
    annual: monthly === 0 ? "£0" : `${gbp(annual)}/yr`,
    brands: brands.replace(/"/g, ""),
    users: users.replace(/"/g, ""),
    monthlyAcus: Math.round(monthly * ACU_ALLOCATION_RATE * ACU_PER_GBP).toLocaleString("en-GB"),
  };
});
