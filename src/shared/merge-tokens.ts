// Merge tokens — ONE definition, used by the editor, the writer and the sender.
//
// This lives in shared/ rather than backend/ because the template editor renders
// a live preview in the browser and must apply exactly the same grammar the send
// path applies. When the two were separate, the editor could show a clean
// preview for a template that merged badly on the real list — which is how
// "Dear {{ firstName }} {{ name }}" reached a customer's screen looking fine and
// went out as "Dear MarieMarie Jolaine".

/** The merge tokens a template may use, and where each is sourced from a contact. */
export const MERGE_VARS: { token: string; label: string }[] = [
  { token: "firstName", label: "First name" },
  { token: "name", label: "Full name" },
  { token: "email", label: "Email" },
  { token: "company", label: "Company" },
  { token: "trade", label: "Trade / sector" },
  { token: "town", label: "Town / city" },
  { token: "area", label: "Area / region" },
  { token: "brand", label: "Your brand name" },
];

const KNOWN = new Map(MERGE_VARS.map((v) => [v.token.toLowerCase(), v.token]));

// Names a model reaches for that mean a token we DO have. Rewriting these is
// strictly better than deleting them — the intent was right, the spelling was not.
export const TOKEN_ALIASES: Record<string, string> = {
  first_name: "firstName", firstname: "firstName", fname: "firstName", forename: "firstName",
  full_name: "name", fullname: "name", customer: "name", customer_name: "name", contact: "name",
  company_name: "company", business: "brand", business_name: "brand", brand_name: "brand",
  sender: "brand", your_business: "brand", organisation: "company", organization: "company",
  city: "town", location: "town", region: "area", county: "area",
  sector: "trade", industry: "trade", profession: "trade",
  email_address: "email",
};

// A token with no fallback renders as nothing when the contact's field is
// blank — "Hi ," or "for  to get more work". Every token that can plausibly be
// missing gets a default fallback so the sentence still reads.
const DEFAULT_FALLBACK: Record<string, string> = {
  firstName: "there",
  name: "there",
  company: "your business",
  trade: "your trade",
  town: "your area",
  area: "your area",
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export type TokenFix = {
  text: string;
  used: string[];
  rewritten: { from: string; to: string }[];
  removed: string[];
  fallbacksAdded: string[];
};

/**
 * Canonicalise every merge token in a piece of text:
 *   known token      → kept, with a fallback added if it had none
 *   known alias      → rewritten to the real token
 *   anything else    → removed (replaced by its fallback, or nothing)
 */
export function fixTokens(text: string): TokenFix {
  const used = new Set<string>();
  const rewritten: { from: string; to: string }[] = [];
  const removed: string[] = [];
  const fallbacksAdded = new Set<string>();

  const out = (text || "").replace(TOKEN_RE, (_m, rawKey: string, fallback?: string) => {
    const key = rawKey.toLowerCase();
    let token = KNOWN.get(key);
    if (!token) {
      const aliasTarget = TOKEN_ALIASES[key];
      const alias = aliasTarget && KNOWN.get(aliasTarget.toLowerCase());
      if (alias) {
        token = alias;
        rewritten.push({ from: rawKey, to: alias });
      }
    }
    if (!token) {
      // Unknown token: the send engine would merge it to empty for EVERY
      // recipient. Keep the fallback text if the model supplied one, otherwise
      // drop it entirely — a visible gap is better than an invisible one.
      removed.push(rawKey);
      return (fallback ?? "").trim();
    }
    used.add(token);
    const fb = (fallback ?? "").trim() || DEFAULT_FALLBACK[token];
    if (!fallback?.trim() && fb) fallbacksAdded.add(token);
    return fb ? `{{ ${token} | ${fb} }}` : `{{ ${token} }}`;
  });

  return {
    // Collapse the double spaces a removed token leaves behind.
    text: out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1"),
    used: [...used],
    rewritten,
    removed,
    fallbacksAdded: [...fallbacksAdded],
  };
}

/** Problems that are legal but produce a bad email on a real list. */
export function tokenWarnings(text: string): string[] {
  const warnings: string[] = [];
  const t = text || "";

  // "Dear {{ firstName }} {{ name }}" → "Dear Marie Marie Jolaine".
  if (/\{\{\s*firstName[^}]*\}\}[\s,]*\{\{\s*name[^}]*\}\}/i.test(t) ||
      /\{\{\s*name[^}]*\}\}[\s,]*\{\{\s*firstName[^}]*\}\}/i.test(t)) {
    warnings.push("First name and full name are used next to each other — every recipient sees their name twice. Keep one.");
  }

  const counts = new Map<string, number>();
  for (const m of t.matchAll(TOKEN_RE)) {
    const k = (KNOWN.get(m[1].toLowerCase()) || m[1]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const [token, n] of counts) {
    if (n >= 4) warnings.push(`{{ ${token} }} appears ${n} times — repeated personalisation reads as automated, not personal.`);
  }
  return warnings;
}

/**
 * Merge `{{ token }}` (optionally `{{ token | fallback }}`) against a value map.
 *
 * Unknown tokens resolve to their fallback or an empty string — never left raw,
 * because a literal "{{ salesRep }}" arriving in someone's inbox is worse than a
 * gap. The same function backs the editor preview and the real send, so what is
 * previewed is what is delivered.
 */
export function mergeTokens(text: string, values: Record<string, string>): string {
  return (text || "").replace(TOKEN_RE, (_m, rawKey: string, fallback?: string) => {
    const v = values[rawKey.toLowerCase()];
    return (v && v.length ? v : (fallback ?? "")).toString();
  });
}

/** Which known tokens actually appear in a piece of text. */
export function usedTokens(text: string): string[] {
  const found = new Set<string>();
  for (const m of (text || "").matchAll(TOKEN_RE)) {
    const canon = KNOWN.get(m[1].toLowerCase());
    if (canon) found.add(canon);
  }
  return [...found];
}
