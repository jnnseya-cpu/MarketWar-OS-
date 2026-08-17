// MarketWar OS — workspace roles and permissions (client-safe, pure data).
//
// THE PROBLEM THIS SOLVES, WHICH IS NOT THE ONE THE SPEC ASKED ABOUT.
//
// `resolveBrandAccess` grants a brand to exactly one uid: the one that claimed
// it. Everybody else is denied. So `team_member` — a role this platform has
// declared in `shared/roles.ts` since the beginning — cannot open their own
// company's brand. The role exists, the label exists, and there has never been a
// path that honours it.
//
// The agency hierarchy the spec asks for is the same gap seen from further out.
// An agency is a company whose people work on brands they do not personally own,
// which is exactly what a teammate is.
//
// TWO KINDS OF ROLE, DELIBERATELY SEPARATE.
//
// `shared/roles.ts` holds ACCOUNT roles — who you are to MarketWar: staff or
// tenant, what commercial authority you carry. This file holds WORKSPACE roles —
// what you may do to a particular brand. A support agent and a strategist are
// not points on one scale, and collapsing them into one enum is how somebody
// ends up with billing access because they were made a reviewer.
//
// THE HIERARCHY IS A CHAIN OF GRANTS, NOT A NEW TENANCY MODEL.
//
//   Organisation → Workspace → Client → Brand → Campaign
//
// Rebuilding tenancy around that would put per-brand isolation — a
// non-negotiable — through a rewrite for a feature nobody has yet asked to use.
// So a workspace GROUPS brands and a membership may be granted at either level;
// a workspace grant is inherited by its brands. The brand owner stays the owner
// and can never be locked out of their own brand by any grant anybody makes.

export const WORKSPACE_ROLES = [
  "owner", "admin", "strategist", "creative", "marketing_manager",
  "analyst", "sales", "reviewer", "client", "read_only",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** §68's list, by its own names. */
export const PERMISSIONS = [
  "create", "edit", "approve", "publish", "spend",
  "connect_channels", "manage_billing", "invite_users", "access_leads", "export_data",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_MEANING: Record<Permission, string> = {
  create: "Make new campaigns, creatives and content.",
  edit: "Change work that already exists.",
  approve: "Move something through the approval queue.",
  publish: "Send it out — to a channel, an inbox or the public.",
  spend: "Commit money: ad budget, paid distribution.",
  connect_channels: "Link or unlink a social, ad or email account.",
  manage_billing: "Change the plan, the card or the ACU balance.",
  invite_users: "Add somebody else to this workspace or brand.",
  access_leads: "See contact details of real people.",
  export_data: "Take data out of the platform.",
};

export type WorkspaceRoleDef = {
  role: WorkspaceRole;
  label: string;
  summary: string;
  permissions: Permission[];
};

/**
 * Who may do what.
 *
 * Two of these are worth defending because they look wrong until you consider
 * what they protect:
 *
 *   • A STRATEGIST cannot spend. Planning a budget and committing it are
 *     different acts, and the person who designs the campaign should not be the
 *     one who releases the money against it.
 *   • A CLIENT can approve and nothing else. That is the whole point of a client
 *     — they say yes or no to work an agency did, and giving them `edit` turns a
 *     sign-off into a second production cycle nobody scoped.
 *
 * `access_leads` is deliberately narrow. It is real people's contact details,
 * and a role that only needs to look at charts does not need their phone
 * numbers.
 */
export const WORKSPACE_ROLE_DEFS: WorkspaceRoleDef[] = [
  {
    role: "owner", label: "Owner",
    summary: "The account that owns the brand. Everything, always — no grant can remove this.",
    permissions: [...PERMISSIONS],
  },
  {
    role: "admin", label: "Admin",
    summary: "Runs the workspace day to day. Everything except changing the billing arrangement.",
    permissions: ["create", "edit", "approve", "publish", "spend", "connect_channels", "invite_users", "access_leads", "export_data"],
  },
  {
    role: "strategist", label: "Strategist",
    summary: "Plans campaigns and approves work. Designs the budget; does not release money against it.",
    permissions: ["create", "edit", "approve", "access_leads", "export_data"],
  },
  {
    role: "creative", label: "Creative",
    summary: "Makes the work. Cannot approve their own output or publish it.",
    permissions: ["create", "edit"],
  },
  {
    role: "marketing_manager", label: "Marketing Manager",
    summary: "Owns delivery: approves, schedules, publishes and commits the agreed budget.",
    permissions: ["create", "edit", "approve", "publish", "spend", "connect_channels", "access_leads"],
  },
  {
    role: "analyst", label: "Analyst",
    summary: "Reads the numbers and takes them away. Changes nothing and sees no contact details.",
    permissions: ["export_data"],
  },
  {
    role: "sales", label: "Sales",
    summary: "Works the pipeline. Sees and contacts leads; does not touch campaigns or money.",
    permissions: ["access_leads", "create", "export_data"],
  },
  {
    role: "reviewer", label: "Reviewer",
    summary: "Checks work before it goes out. Approves or sends it back; edits nothing.",
    permissions: ["approve"],
  },
  {
    role: "client", label: "Client",
    summary: "Says yes or no to work done for them. Approval only — an editing client is a second production cycle nobody scoped.",
    permissions: ["approve"],
  },
  {
    role: "read_only", label: "Read-only",
    summary: "Can look. Can do nothing at all.",
    permissions: [],
  },
];

export const WORKSPACE_ROLE_BY_NAME: Record<WorkspaceRole, WorkspaceRoleDef> =
  Object.fromEntries(WORKSPACE_ROLE_DEFS.map((r) => [r.role, r])) as Record<WorkspaceRole, WorkspaceRoleDef>;

export function isWorkspaceRole(v: string): v is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(v);
}

/** May this role do this? The single question every gate asks. */
export function can(role: WorkspaceRole, permission: Permission): boolean {
  return WORKSPACE_ROLE_BY_NAME[role]?.permissions.includes(permission) ?? false;
}

/** Everything a role may do, for a surface that has to show it. */
export function permissionsOf(role: WorkspaceRole): Permission[] {
  return [...(WORKSPACE_ROLE_BY_NAME[role]?.permissions ?? [])];
}

/**
 * The rank used ONLY to resolve two grants for the same person.
 *
 * Not a hierarchy of trust: a sales person is not "less" than an analyst, they
 * do different jobs. When somebody holds a workspace grant and a brand grant,
 * the one with more permissions wins, because the narrower grant was almost
 * certainly the older one and locking somebody out of work they were just given
 * is the worse failure.
 */
export function widerRole(a: WorkspaceRole, b: WorkspaceRole): WorkspaceRole {
  if (a === "owner" || b === "owner") return "owner";
  return permissionsOf(a).length >= permissionsOf(b).length ? a : b;
}

export const WORKSPACE_DOCTRINE = [
  "Account roles and workspace roles are separate. A support agent and a strategist are not points on one scale, and collapsing them is how somebody gets billing access because they were made a reviewer.",
  "The brand owner can never be locked out of their own brand by any grant anybody makes.",
  "A strategist plans a budget and cannot release money against it. Designing the spend and committing it are different acts.",
  "A client can approve and nothing else. An editing client turns a sign-off into a second production cycle nobody scoped.",
  "Seeing real people's contact details is its own permission. A role that reads charts does not need phone numbers.",
];
