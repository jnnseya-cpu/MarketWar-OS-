// Who this email is from — filled in, because the platform already knows.
//
// The Email Centre asked for three things every time: a From name, a From
// address and a Reply-to inbox. It knew all three. The brand's name is on the
// screen, the account's own email address signed the request, and any domain
// the customer has authenticated for sending is in Sending Domains. Three empty
// boxes with placeholders in them is the platform asking a question it can
// answer, on every campaign, forever.
//
// ONE OF THE THREE IS NOT SAFE TO GUESS, AND THAT IS THE POINT OF THIS FILE.
//
// A From address only works if its domain is DKIM-authenticated. Prefilling
// `hello@theirdomain.com` because it looks right would produce mail that
// spam-folders or bounces, and the customer would have no idea why — the field
// looked filled in, so it looked correct. So the From address is prefilled ONLY
// from a domain this brand has actually VERIFIED. With none verified the field
// stays empty and the reason is shown, which is the honest state: the send falls
// back to the platform's own authenticated address, which does reach the inbox.
//
// The other two carry no such risk. A From name is a label. A Reply-to is an
// address the customer already reads — it is where replies land, and getting it
// wrong loses a reply rather than the whole send.

export type SendingDomainLike = { domain: string; status: "pending" | "verified" | string };

export type EmailIdentity = {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  /** Why the From address is what it is — shown, never left to be guessed at. */
  fromNote: string;
};

/** Local part for a prefilled From address. Conventional, and editable. */
const DEFAULT_LOCAL = "hello";

const verified = (domains: SendingDomainLike[] | null | undefined): string => {
  const hit = (domains ?? []).find((d) => d.status === "verified");
  return hit ? String(hit.domain || "").trim().toLowerCase() : "";
};

/**
 * What the three sender fields should start as.
 *
 * @param brandName   The active brand — the From name a recipient sees.
 * @param userEmail   The signed-in account's address; where replies should land.
 * @param domains     This brand's sending domains, verified or not.
 * @param platformFrom The address the send uses when From is left blank, for
 *                     the explanation only — never prefilled into the field,
 *                     because it is MarketWar's address and not the customer's.
 */
export function emailIdentityDefaults(input: {
  brandName?: string | null;
  userEmail?: string | null;
  domains?: SendingDomainLike[] | null;
  platformFrom?: string | null;
}): EmailIdentity {
  const brandName = String(input.brandName ?? "").trim();
  const userEmail = String(input.userEmail ?? "").trim().toLowerCase();
  const domain = verified(input.domains);
  const pending = (input.domains ?? []).filter((d) => d.status !== "verified").length;
  const platformFrom = String(input.platformFrom ?? "").trim();

  const fromEmail = domain ? `${DEFAULT_LOCAL}@${domain}` : "";

  const fromNote = domain
    ? `Sending as your own verified domain (${domain}). Change the part before the @ to anything you like — the domain is what has to stay authenticated.`
    : pending
      ? `You have ${pending} sending domain${pending === 1 ? "" : "s"} added but not verified yet, so this is left blank on purpose: sending from an unauthenticated domain lands in spam. Finish the DNS records in Sending Domains and it fills in.${platformFrom ? ` Until then mail goes out as ${platformFrom}, which is authenticated and does reach the inbox.` : ""}`
      : `Left blank on purpose — you have not authenticated a domain of your own yet, and sending from one that is not authenticated lands in spam.${platformFrom ? ` Mail goes out as ${platformFrom} instead, which is authenticated and does reach the inbox.` : ""} Add your domain in Sending Domains to send as yourself.`;

  return {
    fromName: brandName,
    fromEmail,
    // Replies should reach a person, and the signed-in account is the one
    // address we know a person actually reads.
    replyTo: userEmail,
    fromNote,
  };
}

/**
 * Fill only what is still empty.
 *
 * A prefill that overwrites is worse than no prefill: someone types a From name
 * for one campaign, switches brand to check something, and comes back to find
 * their text replaced. Anything the customer has touched is theirs.
 */
export function applyDefaults(
  current: { fromName: string; fromEmail: string; replyTo: string },
  defaults: EmailIdentity,
): { fromName: string; fromEmail: string; replyTo: string } {
  return {
    fromName: current.fromName.trim() ? current.fromName : defaults.fromName,
    fromEmail: current.fromEmail.trim() ? current.fromEmail : defaults.fromEmail,
    replyTo: current.replyTo.trim() ? current.replyTo : defaults.replyTo,
  };
}

/**
 * Is this From address safe to send from?
 *
 * Answered against the SAME verified list the prefill uses, so a value the
 * customer typed by hand gets the check the prefilled one never needed.
 */
export function fromAddressWarning(
  fromEmail: string,
  domains: SendingDomainLike[] | null | undefined,
): string {
  const value = String(fromEmail ?? "").trim().toLowerCase();
  if (!value) return "";
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return "That does not look like an email address.";
  const domain = value.slice(at + 1);
  const list = domains ?? [];
  if (list.some((d) => String(d.domain).toLowerCase() === domain && d.status === "verified")) return "";
  if (list.some((d) => String(d.domain).toLowerCase() === domain)) {
    return `${domain} is added but not verified yet — mail from it will be filtered. Finish its DNS records in Sending Domains.`;
  }
  return `${domain} is not authenticated for sending here, so mail from it will land in spam or bounce. Add and verify it in Sending Domains, or clear this field to send from the platform's authenticated address.`;
}
