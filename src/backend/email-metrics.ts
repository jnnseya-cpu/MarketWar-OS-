// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE EMAIL COMMAND CENTER'S HEADLINE FIGURES — counted off the real vault.
//
// WHAT THIS FILE USED TO BE, because the replacement only makes sense next to it.
//
// It computed every headline number from `seed(business)` — an FNV-1a hash of
// the brand's NAME — bit-shifted into "1.40–3.79% invalid syntax", "0.50–1.79%
// disposable", a projected bounce rate, a projected complaint rate, and a
// "Projected inbox rate" printed as 96.8%. The only real input was the contact
// count; every ratio applied to it came out of the letters in the company's
// name. The 14-day chart was `peakSend * weekdayWeight[dow] * jitter`, with the
// jitter from the same hash, captioned "projection".
//
// It defended itself in a comment: "Every figure here is a clearly-labelled
// ESTIMATE derived deterministically from the inputs." Deterministic is not the
// same as derived — a hash is deterministic and carries no information about the
// thing it names. And the screen it fed said, in its own empty state,
// "computed per brand — never a fake number".
//
// WHAT MADE IT INDEFENSIBLE RATHER THAN MERELY WRONG: the true numbers were
// already being computed twenty lines down the same page. The send preview runs
// the send's own `filterList` + `suppressedEmails` (§116). On the owner's vault
// it reported 70 sendable of 87 consented — 17 refused — while the panel above
// showed an invented "6 filtered of 88" and 93% list health against a true 80%.
// Somebody reading that screen would conclude their list was in good order.
//
// SO NOW IT COUNTS. Same two functions the send uses, over the same addresses,
// with the arithmetic in `shared/list-health.ts` where it can be tested against
// lists built on purpose.
//
// WHAT IS NO LONGER OFFERED AT ALL: a projected inbox, spam or complaint rate.
// Not because they are unimportant — they are the whole product — but because
// nothing here can compute one. Where placement IS measurable this platform
// measures it: `/api/placement` sends a probe to mailboxes we own and reads back
// the folder (§140), and `/api/postmaster` asks Gmail what it thinks of the
// domain (§142). A card pointing at a real measurement beats a number pointing
// at nothing.

import { listContacts } from "@/backend/contacts";
import { validateAddress } from "@/backend/email";
import { suppressedEmails, brandEvents } from "@/backend/email-events";
import {
  listHealth, sendSeries, type ListHealth, type SendSeries, type HygieneVerdictLike,
} from "@/shared/list-health";

export type EmailPostureReport = {
  business: string;
  brandId: string;
  /** Addresses examined — contacts that HAVE an email address. */
  listSize: number;
  /** Vault rows with no email address at all. Counted, because they are not sendable either. */
  withoutEmail: number;
  health: ListHealth;
  series: SendSeries;
  /**
   * Where placement is actually measured, and whether it has been. Replaces the
   * projected inbox rate: a pointer to a measurement, not a modelled figure.
   */
  placement: { measured: false; where: string };
  /** Kept for callers that branched on it. Now always false — nothing here is modelled. */
  isEstimate: false;
  measuredAt: string;
};

/**
 * Count this brand's list.
 *
 * READS THE ADDRESSES, NOT A SIZE. The old signature took `listSize?: number`
 * from the CLIENT and modelled everything from it, which is what allowed the
 * page to pass a real count and receive invented ratios. A caller cannot supply
 * a number here, because there is no number that would let this answer without
 * looking.
 */
export async function emailPosture(brandId: string, business: string, days = 14): Promise<EmailPostureReport> {
  const contacts = await listContacts(brandId);
  const withEmail = contacts.filter((c) => String(c.email || "").trim());
  const withoutEmail = contacts.length - withEmail.length;

  // `validateAddress` is the send's own verdict, per address, and it is what
  // `filterList` is built from (`rawList.map(validateAddress)`), so the
  // breakdown and the send cannot disagree about why somebody was refused.
  // Calling it directly rather than `filterList` is only because the breakdown
  // needs the per-address `checks`, which the split discards.
  const verdicts: HygieneVerdictLike[] = withEmail.map((c) => {
    const v = validateAddress(String(c.email));
    // `consent !== false` is the preview's own test, copied exactly rather than
    // re-expressed: a contact imported without the field is treated as
    // consented there, and a stricter reading here would report a smaller
    // sendable count than the send delivers — the same disagreement in the
    // other direction.
    return { email: v.email, checks: v.checks, consented: c.consent !== false };
  });

  // NO CATCH. A failed suppression read must not become "nobody is suppressed" —
  // that is the exact defect fixed in the preview, and here it would report a
  // list as healthier than it is on the strength of a database error.
  const suppressed = await suppressedEmails(brandId);
  const health = listHealth(verdicts, suppressed);

  const events = await brandEvents(brandId).catch(() => []);
  const series = sendSeries(events, days);

  return {
    business: business || "your brand",
    brandId,
    listSize: withEmail.length,
    withoutEmail,
    health,
    series,
    placement: {
      measured: false,
      where: "Where a message LANDS is not modelled here and never will be — no arithmetic over a contact list can "
        + "know it. It is measured: /api/placement sends a probe through the ordinary bulk path to mailboxes you own "
        + "and reads back the folder and the Gmail tab (set MW_SEED_MAILBOXES), and /api/postmaster asks Gmail what "
        + "it thinks of the sending domain once there is enough volume for Google to answer.",
    },
    isEstimate: false,
    measuredAt: new Date().toISOString(),
  };
}
