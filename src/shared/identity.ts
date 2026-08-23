// TURNING A FOLLOWER INTO A CUSTOMER IS AN IDENTITY PROBLEM.
//
// A follower is a handle. A customer is an email address on an invoice. They are
// the same human, and nothing in the platform could say so — which is why a
// brand could not tell that the person who commented "price" in March is the
// person who paid in April, and therefore could not tell which post earned the
// money.
//
// This resolves one person across channels. It is pure, so every merge rule can
// be tested without a database.
//
// THE RULE THAT MATTERS MOST: A WRONG MERGE IS WORSE THAN NO MERGE.
//
// Merging two records fuses two people's histories, conversations and revenue
// into one. It is close to unrecoverable, it corrupts every number computed
// afterwards, and under UK GDPR it means showing one person another person's
// data. So identity is only ever joined on evidence that CANNOT reasonably
// belong to two people:
//
//   • the same platform handle on the same platform — the platform enforces this
//   • the same verified email address
//   • the same phone number in international form
//
// A matching NAME is not evidence. There are many John Smiths, and "same first
// name and same city" is how a merge engine quietly ruins a database. Names
// raise a SUGGESTION for a human, never an automatic merge.

export type IdentityChannel = "instagram" | "facebook" | "whatsapp" | "tiktok" | "email" | "phone" | "web";

/** One proven way to reach one person. */
export type IdentityKey = {
  channel: IdentityChannel;
  /** Handle, address or number — normalised by `normaliseKey` before storing. */
  value: string;
  /**
   * How we know. Kept because a merge is only as good as its evidence, and
   * somebody will eventually have to justify one.
   */
  source: string;
  firstSeenISO: string;
};

/** Everything known about one person, across every channel. */
export type Identity = {
  id: string;
  brandId: string;
  keys: IdentityKey[];
  /** Their own words and names — never used to merge, only to display. */
  displayName?: string;
  /** The prospect record in the acquisition pipeline, once they become one. */
  prospectId?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The canonical form of a key. Case, spacing, "@" and phone punctuation are
 * presentation; two records differing only by those are the same person, and
 * failing to normalise is the most common reason a duplicate survives.
 */
export function normaliseKey(channel: IdentityChannel, raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (channel === "email") return v.toLowerCase();
  if (channel === "phone") {
    // Digits only, with a leading + preserved. Anything shorter than 7 digits is
    // not a phone number and must not become an identity key.
    const digits = v.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    return digits.replace(/[^\d]/g, "").length >= 7 ? digits : "";
  }
  // Social handles: no leading @, case-insensitive, no surrounding URL.
  return v.replace(/^https?:\/\/[^/]+\//i, "").replace(/^@/, "").replace(/\/$/, "").toLowerCase();
}

/** A key is only usable if it survives normalisation. */
export function keyId(channel: IdentityChannel, raw: string): string | null {
  const v = normaliseKey(channel, raw);
  return v ? `${channel}:${v}` : null;
}

export type MergeVerdict =
  | { merge: true; on: string; reason: string }
  | { merge: false; suggest: boolean; reason: string };

/**
 * Should these two identities be treated as one person?
 *
 * Returns `suggest` when there is a hint worth a human's attention but not
 * enough to act on — which is the honest middle the platform's rules require,
 * rather than guessing in either direction.
 */
export function shouldMerge(a: Identity, b: Identity): MergeVerdict {
  if (a.brandId !== b.brandId) {
    // Never across tenants, whatever the evidence. Two brands can both know the
    // same person, and joining them would leak one customer's contact into
    // another customer's account.
    return { merge: false, suggest: false, reason: "Different brands — identities are never joined across tenants." };
  }
  const aKeys = new Set(a.keys.map((k) => keyId(k.channel, k.value)).filter(Boolean) as string[]);
  for (const k of b.keys) {
    const id = keyId(k.channel, k.value);
    if (id && aKeys.has(id)) {
      return { merge: true, on: id, reason: `Both records hold ${id}, which one platform account cannot share with another person.` };
    }
  }
  // A shared display name is a hint and nothing more.
  const an = (a.displayName || "").trim().toLowerCase();
  const bn = (b.displayName || "").trim().toLowerCase();
  if (an && an === bn) {
    return {
      merge: false, suggest: true,
      reason: `Both are called "${a.displayName}", which is not evidence — merging on a name fuses two people and cannot be undone. A human decides.`,
    };
  }
  return { merge: false, suggest: false, reason: "No shared handle, address or number." };
}

/**
 * Fold b into a. Keys are unioned; the earliest sighting of each key wins, so
 * "when did we first meet this person" survives the merge.
 */
export function mergeIdentities(a: Identity, b: Identity, nowISO: string): Identity {
  const byId = new Map<string, IdentityKey>();
  for (const k of [...a.keys, ...b.keys]) {
    const id = keyId(k.channel, k.value);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || k.firstSeenISO < existing.firstSeenISO) byId.set(id, { ...k, value: normaliseKey(k.channel, k.value) });
  }
  return {
    ...a,
    keys: [...byId.values()].sort((x, y) => x.firstSeenISO.localeCompare(y.firstSeenISO)),
    displayName: a.displayName || b.displayName,
    // A prospect record already in the pipeline is never dropped by a merge.
    prospectId: a.prospectId || b.prospectId,
    createdAt: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
    updatedAt: nowISO,
  };
}

// ---------------------------------------------------------------------------
// The follower → customer ladder.
// ---------------------------------------------------------------------------

export const LADDER = ["follower", "engaged", "lead", "qualified", "customer"] as const;
export type LadderStage = (typeof LADDER)[number];

/**
 * Where this person stands, computed from what they have ACTUALLY done.
 *
 * Never from a guess and never from a score: each rung has a fact behind it, so
 * a brand can always be told why somebody is where they are. `reason` is the
 * point of this function as much as the stage is.
 */
export function ladderStage(input: {
  followed?: boolean;
  engagements?: number;      // comments, story replies, DMs received
  hasContactDetail?: boolean; // an email or phone we may use
  qualifiedAnswers?: number;  // answers given to qualifying questions
  paidGbp?: number;
}): { stage: LadderStage; reason: string; nextAction: string } {
  const paid = input.paidGbp ?? 0;
  if (paid > 0) {
    return { stage: "customer", reason: `They have paid £${paid}.`, nextAction: "Keep them — ask for the review while the work is fresh." };
  }
  if ((input.qualifiedAnswers ?? 0) >= 2 && input.hasContactDetail) {
    return { stage: "qualified", reason: "They answered qualifying questions and left a way to reach them.", nextAction: "A person should make the offer now." };
  }
  if (input.hasContactDetail) {
    return { stage: "lead", reason: "They gave a contact detail, which is consent to be contacted about this.", nextAction: "Ask the two questions that decide whether this is worth a call." };
  }
  if ((input.engagements ?? 0) > 0) {
    return { stage: "engaged", reason: "They have replied or commented, so they are reachable in the DM.", nextAction: "Answer what they actually asked, then ask for the email." };
  }
  if (input.followed) {
    return { stage: "follower", reason: "They follow the account and nothing more.", nextAction: "Give them something worth replying to — do not pitch a follower." };
  }
  return { stage: "follower", reason: "Nothing has happened yet.", nextAction: "Nothing to do until they do something." };
}
