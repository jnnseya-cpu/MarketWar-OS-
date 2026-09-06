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

export type SenderFields = { fromName: string; fromEmail: string; replyTo: string };

/**
 * Fill what the customer has not chosen for themselves.
 *
 * TWO THINGS LOOK IDENTICAL IN A TEXT INPUT AND MUST NOT BE TREATED THE SAME.
 *
 *   1. Text the customer typed. Theirs. A prefill that overwrites it is worse
 *      than no prefill at all — someone types a From name, switches brand to
 *      check something, comes back and finds their words replaced.
 *   2. Text THIS FUNCTION put there for a brand that is no longer selected.
 *      Not theirs, and not about the brand on the screen any more.
 *
 * "Is it empty?" cannot tell them apart, and that was the defect: switching from
 * VeryX to AxionOS left the From name reading "VeryX" and the From address on
 * `hello@veryxjnn.com` — VeryX's verified domain — while the header, the vault
 * sentence and the recipient list were all AxionOS. One screen, two brands, and
 * the send button underneath it. A campaign sent from there goes to one
 * company's customers wearing another company's name.
 *
 * So `previous` is what we last prefilled. A field still holding exactly that is
 * ours to replace; anything else is the customer's and survives. Omit `previous`
 * and the behaviour is the original fill-the-empties, which is right on a first
 * render because nothing has been prefilled yet.
 *
 * The replacement may well be EMPTY — a brand with no verified domain gets a
 * blank From address on purpose (see `emailIdentityDefaults`). Blanking a
 * carried-over address is the correct outcome, not a lost value: the alternative
 * is sending the new brand's mail from a domain it does not own.
 */
export function applyDefaults(
  current: SenderFields,
  defaults: EmailIdentity,
  previous?: Partial<SenderFields> | null,
): SenderFields {
  // Ours if the field is empty, or still carries exactly what we last put there.
  const oursToReplace = (value: string, lastPrefilled: string | undefined): boolean =>
    !value.trim() || (lastPrefilled !== undefined && value.trim() === String(lastPrefilled).trim());

  return {
    fromName: oursToReplace(current.fromName, previous?.fromName) ? defaults.fromName : current.fromName,
    fromEmail: oursToReplace(current.fromEmail, previous?.fromEmail) ? defaults.fromEmail : current.fromEmail,
    replyTo: oursToReplace(current.replyTo, previous?.replyTo) ? defaults.replyTo : current.replyTo,
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
