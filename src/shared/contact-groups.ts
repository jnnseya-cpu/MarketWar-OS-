// NAMED GROUPS IN THE CUSTOMER VAULT — send to a list, not to everyone.
//
// THE GAP THIS CLOSES. A campaign went to the whole vault or to nothing. The only
// narrowing available was `statusFilter`, a free-text box matched against the
// prospect `status` column — which is an import artefact ("new", "contacted"),
// not something a person chose, and typing it wrong silently selected nobody.
// So a customer with one list of buyers, one of newsletter subscribers and one of
// cold prospects had to mail all three or none.
//
// WHY "GROUP" AND NOT "SEGMENT". `/dashboard/segments` already exists and means
// something different: segments are COMPUTED — RFM, LTV, churn risk, intent —
// and nobody types them. A group is the opposite: a label a person puts on
// contacts on purpose. Two concepts, two words, and this file never touches the
// other one.
//
// A CONTACT CAN BE IN SEVERAL GROUPS. Somebody who subscribed to the newsletter
// and then bought is in both, and forcing a choice would make one of the two
// lists wrong. So `Contact.groups` is an array, absent means ungrouped, and
// nothing here mutates a contact that was not named.
//
// UNGROUPED IS ITSELF SELECTABLE, and that is a requirement rather than a
// convenience: every newsletter signup and every audit lead arrives with no
// group, and they are exactly the people worth mailing first. A bucket you can
// see but not target would be a worse answer than no buckets at all.

/**
 * The reserved selection token for "contacts that are in no group at all".
 *
 * It is not a group anybody owns — it is a view over the absence of one — so it
 * carries a character no group name may contain (see `normaliseGroupName`), and
 * a real group can never collide with it.
 */
export const UNGROUPED = "__ungrouped__";

/** How a group is shown and counted. */
export type GroupSummary = {
  /** The display name, in the casing the person typed. `UNGROUPED` for the bucket. */
  name: string;
  /** Everyone carrying the label. */
  count: number;
  /** …of whom this many have an email AND have not opted out. */
  sendable: number;
  /** True for the ungrouped bucket, so a UI can label it rather than print the token. */
  isUngrouped: boolean;
};

/** The minimum shape this module needs. Anything with more fields is fine. */
export type GroupableContact = {
  email?: string;
  consent?: boolean;
  groups?: string[];
};

/** Longer than this is a paste accident, not a name. */
export const MAX_GROUP_NAME = 48;

/**
 * A group name, cleaned — or "" if it is not a usable name.
 *
 * Whitespace is collapsed and trimmed so " VIP  buyers " and "VIP buyers" are one
 * group rather than two that look identical in a list. Underscores at both ends
 * are refused, which is what keeps `UNGROUPED` unforgeable: no name a person can
 * type will ever equal the reserved token, so selecting it is never ambiguous.
 */
export function normaliseGroupName(raw: unknown): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || s.length > MAX_GROUP_NAME) return "";
  if (/^__.*__$/.test(s)) return "";        // reserved shape
  return s;
}

/** Case-insensitive identity. "Newsletter" and "newsletter" are ONE group. */
export const sameGroup = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The groups on a contact, cleaned and de-duplicated case-insensitively. */
export function groupsOf(contact: GroupableContact): string[] {
  const out: string[] = [];
  for (const raw of contact.groups ?? []) {
    const name = normaliseGroupName(raw);
    if (name && !out.some((k) => sameGroup(k, name))) out.push(name);
  }
  return out;
}

/** Is this contact in no group at all? */
export const isUngrouped = (contact: GroupableContact): boolean => groupsOf(contact).length === 0;

/**
 * Can this contact actually be mailed?
 *
 * The SAME rule the send path uses — an address, and not an explicit opt-out —
 * so a group's "sendable" count and what the campaign actually attempts can never
 * disagree. `consent !== false` rather than `consent === true`, because an
 * imported contact with no consent field recorded is not the same as one who
 * refused, and the vault display has always counted it that way.
 */
export const isSendable = (c: GroupableContact): boolean => Boolean(c.email) && c.consent !== false;

/**
 * Every group in a brand's vault, with counts, plus the ungrouped bucket.
 *
 * Named groups come first, alphabetically, so the list does not reorder itself as
 * counts change; ungrouped is last because it is a remainder rather than a
 * choice. The bucket is included EVEN WHEN EMPTY only if something is in it —
 * an empty remainder is noise, but a populated one is the newsletter pile.
 */
export function summariseGroups(contacts: GroupableContact[]): GroupSummary[] {
  // Keyed case-insensitively; the first spelling seen wins as the display name.
  const named = new Map<string, GroupSummary>();
  let ungroupedCount = 0;
  let ungroupedSendable = 0;

  for (const c of contacts) {
    const gs = groupsOf(c);
    if (!gs.length) {
      ungroupedCount++;
      if (isSendable(c)) ungroupedSendable++;
      continue;
    }
    for (const name of gs) {
      const key = name.toLowerCase();
      const row = named.get(key) ?? { name, count: 0, sendable: 0, isUngrouped: false };
      row.count++;
      if (isSendable(c)) row.sendable++;
      named.set(key, row);
    }
  }

  const out = [...named.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (ungroupedCount > 0) {
    out.push({ name: UNGROUPED, count: ungroupedCount, sendable: ungroupedSendable, isUngrouped: true });
  }
  return out;
}

/**
 * The contacts a selection resolves to.
 *
 * AN EMPTY SELECTION IS EVERYONE, and that is deliberate rather than lazy: every
 * campaign sent before groups existed passed no selection, and this platform does
 * not change what an existing call does. Choosing a group is opting IN to
 * narrowing.
 *
 * Selections are OR-ed. Picking "Buyers" and "Newsletter" means everybody in
 * either, each appearing once — asking for the intersection of two lists you
 * built by hand is not a thing anybody wants from a send screen.
 */
export function selectByGroups<T extends GroupableContact>(contacts: T[], selected: string[]): T[] {
  const wanted = (selected ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!wanted.length) return contacts;

  const wantUngrouped = wanted.some((w) => w === UNGROUPED);
  const names = wanted.filter((w) => w !== UNGROUPED).map((w) => w.toLowerCase());

  return contacts.filter((c) => {
    const gs = groupsOf(c);
    if (!gs.length) return wantUngrouped;
    return gs.some((g) => names.includes(g.toLowerCase()));
  });
}

/**
 * The contact with `name` added. Returns the SAME object when nothing changes, so
 * a caller can tell a real edit from a no-op and skip the write.
 */
export function addToGroup<T extends GroupableContact>(contact: T, name: string): T {
  const clean = normaliseGroupName(name);
  if (!clean) return contact;
  const gs = groupsOf(contact);
  if (gs.some((g) => sameGroup(g, clean))) return contact;
  return { ...contact, groups: [...gs, clean] };
}

/** The contact with `name` removed. The same object when it was not in it. */
export function removeFromGroup<T extends GroupableContact>(contact: T, name: string): T {
  const clean = String(name ?? "").trim();
  if (!clean) return contact;
  const gs = groupsOf(contact);
  const next = gs.filter((g) => !sameGroup(g, clean));
  if (next.length === gs.length) return contact;
  return { ...contact, groups: next };
}

/**
 * The contact with one group renamed.
 *
 * A rename that collides with a group the contact is already in MERGES rather
 * than duplicating — renaming "VIP" to "Buyers" on somebody already in "Buyers"
 * must leave them in "Buyers" once, not twice.
 */
export function renameGroup<T extends GroupableContact>(contact: T, from: string, to: string): T {
  const target = normaliseGroupName(to);
  if (!target) return contact;
  const gs = groupsOf(contact);
  if (!gs.some((g) => sameGroup(g, from))) return contact;
  const kept = gs.filter((g) => !sameGroup(g, from) && !sameGroup(g, target));
  return { ...contact, groups: [...kept, target] };
}

/**
 * What a selection will actually send to, in words, before anybody presses send.
 *
 * The whole point of the feature is knowing you are not mailing everyone, so the
 * number has to be on the screen with the button — and it is the SENDABLE count,
 * not the raw one, because "412 contacts" beside a send that reaches 180 is the
 * kind of number this platform exists to stop printing.
 */
export function describeSelection(contacts: GroupableContact[], selected: string[]): string {
  const chosen = (selected ?? []).filter(Boolean);
  const picked = selectByGroups(contacts, chosen);
  const sendable = picked.filter(isSendable).length;
  const label = (n: string) => (n === UNGROUPED ? "not in any group" : `“${n}”`);

  if (!chosen.length) {
    return `Everyone in the vault — ${sendable} of ${contacts.length} can be emailed.`;
  }
  const names = chosen.length === 1
    ? label(chosen[0])
    : `${chosen.slice(0, -1).map(label).join(", ")} and ${label(chosen[chosen.length - 1])}`;
  if (sendable === 0) {
    return `Nothing to send: ${picked.length} contact(s) in ${names}, but none of them has an email address we are allowed to use.`;
  }
  return `${names} — ${sendable} of ${picked.length} can be emailed${chosen.length > 1 ? ", counted once each" : ""}.`;
}
