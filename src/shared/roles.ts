// MarketWar OS — account roles (client-safe, pure data).
//
// The platform has two sides:
//   • Staff (MarketWar's own team) — run the business: the owner/executive,
//     commercial director, sales manager, sales reps and support. Their
//     discount/waiver authority is enforced in src/backend/admin-billing.ts
//     (DISCOUNT_AUTHORITY) — the role names here are the SAME so a single
//     identity drives both access and commercial authority.
//   • Tenants (customers using the OS) — the business owner and their team.
//
// A user's role is stored as a Firebase custom claim ("role") and mirrored on
// their Firestore profile. Scopes below are the coarse capability gates the UI
// and APIs check; fine-grained financial authority stays in admin-billing.

export type AccountSide = "staff" | "tenant";

export type Role =
  | "executive"          // owner / super-admin — everything
  | "commercial_director"
  | "sales_manager"
  | "sales_rep"
  | "support"
  | "business_owner"     // tenant account owner
  | "team_member";       // tenant teammate (limited)

export type Scope =
  | "platform_admin"     // owner economics, all tenants, system config
  | "admin_billing"      // change plans, offers, discount codes, waivers
  | "tenant_manage"      // manage assigned tenant accounts
  | "support_view"       // read tenants for support, no financial writes
  | "workspace_owner"    // full control of own workspace
  | "workspace_use";     // use engines in own workspace, no destructive/billing

export type RoleDef = {
  role: Role;
  side: AccountSide;
  label: string;
  summary: string;
  scopes: Scope[];
};

export const ROLES: RoleDef[] = [
  { role: "executive", side: "staff", label: "Executive / Owner", summary: "Super-admin. Full platform: owner economics, every tenant, system config, unlimited discount authority.", scopes: ["platform_admin", "admin_billing", "tenant_manage", "support_view"] },
  { role: "commercial_director", side: "staff", label: "Commercial Director", summary: "Runs revenue. Admin billing, offers and discount codes up to 20% authority, all tenants.", scopes: ["admin_billing", "tenant_manage", "support_view"] },
  { role: "sales_manager", side: "staff", label: "Sales Manager", summary: "Manages the sales team. Billing + offers up to 10% authority, assigned tenants.", scopes: ["admin_billing", "tenant_manage", "support_view"] },
  { role: "sales_rep", side: "staff", label: "Sales Rep", summary: "Front-line sales. Discount authority up to 5%, assigned tenants only.", scopes: ["tenant_manage", "support_view"] },
  { role: "support", side: "staff", label: "Support", summary: "Customer support. Read tenant workspaces to help; no financial writes.", scopes: ["support_view"] },
  { role: "business_owner", side: "tenant", label: "Business Owner (tenant)", summary: "The customer. Full control of their own workspace — every engine, their billing and their team.", scopes: ["workspace_owner", "workspace_use"] },
  { role: "team_member", side: "tenant", label: "Team Member (tenant)", summary: "A teammate in a tenant workspace. Use engines; no billing or destructive actions.", scopes: ["workspace_use"] },
];

export const ROLE_BY_NAME: Record<Role, RoleDef> = Object.fromEntries(ROLES.map((r) => [r.role, r])) as Record<Role, RoleDef>;

export function hasScope(role: Role, scope: Scope): boolean {
  return ROLE_BY_NAME[role]?.scopes.includes(scope) ?? false;
}

export function isStaff(role: Role): boolean {
  return ROLE_BY_NAME[role]?.side === "staff";
}

// The default set of accounts a fresh deployment seeds for testing — one per
// role, plus the owner. Emails are on the platform domain; passwords are NOT
// stored here (the seed script sets them from env / prompts). See
// scripts/seed-accounts.mjs and docs/REAL-TESTING.md.
export const SEED_ACCOUNTS: { email: string; role: Role; displayName: string }[] = [
  { email: "owner@marketwaros.com", role: "executive", displayName: "Platform Owner" },
  { email: "director@marketwaros.com", role: "commercial_director", displayName: "Commercial Director" },
  { email: "manager@marketwaros.com", role: "sales_manager", displayName: "Sales Manager" },
  { email: "rep@marketwaros.com", role: "sales_rep", displayName: "Sales Rep" },
  { email: "support@marketwaros.com", role: "support", displayName: "Support Agent" },
  { email: "tenant@marketwaros.com", role: "business_owner", displayName: "Test Business Owner" },
  { email: "teammate@marketwaros.com", role: "team_member", displayName: "Test Team Member" },
];
