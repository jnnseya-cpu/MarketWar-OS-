if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// RightsGuard (VideoDominance Gap 12) — content rights & consent matrix.
// House doctrine: never assume consent. Publishing is BLOCKED whenever any
// required right for the intended use is missing. All outputs are deterministic
// and demo-safe (no Date.now / new Date / Math.random).

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export const RIGHTS_FIELDS = [
  "source_ownership",
  "upload_permission",
  "music_licence",
  "stock_licence",
  "creator_consent",
  "model_release",
  "voice_consent",
  "face_consent",
  "location_release",
  "product_trademark",
  "territory",
  "permitted_platforms",
  "paid_ad_rights",
  "organic_only_rights",
  "modification_rights",
  "generative_ai_rights",
  "expiry",
] as const;

export type RightsField = (typeof RIGHTS_FIELDS)[number];

export type RightsValue = boolean | string;

export interface CheckRightsInput {
  assetId: string;
  rights?: Record<string, RightsValue>;
  usesMusic?: boolean;
  usesCreator?: boolean;
  usesVoiceClone?: boolean;
  usesGenerativeAi?: boolean;
  targetPlatforms?: string[];
  paidAd?: boolean;
}

export interface RightsResult {
  assetId: string;
  required: string[];
  satisfied: string[];
  missing: string[];
  cleared: boolean;
  blockers: string[];
  note: string;
}

export interface RightsGuardDemo {
  doctrine: string;
  partiallyCleared: RightsResult;
  fullyCleared: RightsResult;
}

// A required field counts as SATISFIED only when present with an affirmative
// value: boolean true, or a non-empty string that is not an explicit negation.
const isSatisfied = (value: RightsValue | undefined): boolean => {
  if (value === undefined) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalised = value.trim().toLowerCase();
  if (normalised.length === 0) {
    return false;
  }
  return normalised !== "no" && normalised !== "false" && normalised !== "none" && normalised !== "unknown";
};

// Determine which rights fields are required for the intended use. Baseline
// ownership/permission fields are always required; use-specific fields are
// added only when the intended use triggers them. Never assume consent.
const requiredFieldsFor = (input: CheckRightsInput): string[] => {
  const required: string[] = [
    "source_ownership",
    "upload_permission",
    "modification_rights",
    "territory",
    "permitted_platforms",
    "expiry",
  ];

  if (input.usesMusic) {
    required.push("music_licence");
    required.push("stock_licence");
  }

  if (input.usesCreator) {
    required.push("creator_consent");
    required.push("model_release");
    required.push("face_consent");
    required.push("location_release");
    required.push("product_trademark");
  }

  if (input.usesVoiceClone) {
    required.push("voice_consent");
  }

  if (input.usesGenerativeAi) {
    required.push("generative_ai_rights");
  }

  if (input.paidAd) {
    required.push("paid_ad_rights");
  } else {
    required.push("organic_only_rights");
  }

  // Preserve canonical field ordering and drop any duplicates.
  return RIGHTS_FIELDS.filter((field) => required.includes(field));
};

export function checkRights(input: CheckRightsInput): RightsResult {
  const rights: Record<string, RightsValue> = input.rights ?? {};
  const required = requiredFieldsFor(input);

  const satisfied: string[] = [];
  const missing: string[] = [];

  for (const field of required) {
    if (isSatisfied(rights[field])) {
      satisfied.push(field);
    } else {
      missing.push(field);
    }
  }

  const cleared = missing.length === 0;

  const blockers: string[] = missing.map(
    (field) => `Missing required right: ${field} — publishing blocked until documented consent/licence is on file`,
  );

  const note = cleared
    ? "ESTIMATE: all required rights for the intended use are documented; publishing is permitted. Verify licence expiry and territory before each send."
    : `ESTIMATE: ${missing.length} required right(s) unresolved for asset ${input.assetId} (ref ${seed(input.assetId + required.join(","))}). Publishing is BLOCKED — never assume consent.`;

  return {
    assetId: input.assetId,
    required,
    satisfied,
    missing,
    cleared,
    blockers,
    note,
  };
}

export function demoRightsGuard(): RightsGuardDemo {
  // Partially-cleared asset: music + creator + generative AI + paid ad use,
  // but several consents are missing → BLOCKED.
  const partiallyCleared = checkRights({
    assetId: "asset-demo-partial",
    usesMusic: true,
    usesCreator: true,
    usesVoiceClone: true,
    usesGenerativeAi: true,
    paidAd: true,
    targetPlatforms: ["tiktok", "youtube"],
    rights: {
      source_ownership: true,
      upload_permission: true,
      modification_rights: true,
      territory: "worldwide",
      permitted_platforms: "tiktok,youtube",
      expiry: "2027-01-01",
      music_licence: true,
      stock_licence: false,
      creator_consent: true,
      model_release: false,
      face_consent: true,
      // location_release missing
      // product_trademark missing
      voice_consent: false,
      generative_ai_rights: true,
      paid_ad_rights: false,
    },
  });

  // Fully-cleared asset: organic-only, owned footage, all required rights on file.
  const fullyCleared = checkRights({
    assetId: "asset-demo-cleared",
    usesMusic: false,
    usesCreator: false,
    usesVoiceClone: false,
    usesGenerativeAi: false,
    paidAd: false,
    targetPlatforms: ["instagram"],
    rights: {
      source_ownership: true,
      upload_permission: true,
      modification_rights: true,
      territory: "worldwide",
      permitted_platforms: "instagram",
      expiry: "2028-06-30",
      organic_only_rights: true,
    },
  });

  return {
    doctrine:
      "RightsGuard blocks publishing whenever any required right for the intended use is missing. Never assume consent; only affirmative, documented rights clear an asset. Scores and notes are ESTIMATES, not legal advice.",
    partiallyCleared,
    fullyCleared,
  };
}
