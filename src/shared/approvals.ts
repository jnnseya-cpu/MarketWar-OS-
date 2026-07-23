// Collaboration & Approvals — the shared workflow state machine (no key needed).
// Pure + deterministic so BOTH the API and the UI reason about the same rules:
// what state an item is in, who acts next, and which actions are legal.
//
// Pipeline (owner spec): creator → editor → manager → client → publish. An item
// moves through review states; anyone in the chain can request changes (bounce
// it back) or approve (advance it). Nothing here talks to a provider.

export type ApprovalState =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "published";

export type ApprovalAction =
  | "submit"          // draft / changes_requested → in_review
  | "approve"         // in_review → approved
  | "request_changes" // in_review → changes_requested
  | "reject"          // in_review → rejected
  | "publish"         // approved → published
  | "reopen";         // rejected / published → draft

export type ApprovalEvent = {
  action: ApprovalAction;
  actor: string;      // display name / email of who acted
  role?: string;      // creator | editor | manager | client
  note?: string;
  at: string;         // ISO
  from: ApprovalState;
  to: ApprovalState;
};

export type ApprovalItem = {
  id: string;
  brandId: string;
  title: string;
  description: string;
  assetUrl?: string;  // link/data-url of the thing under review (optional)
  state: ApprovalState;
  createdBy: string;
  history: ApprovalEvent[];
  createdAt: string;
  updatedAt: string;
};

// Allowed transitions: action → the states it may be applied from, and the
// resulting state. A transition not listed here is rejected by the engine.
export const TRANSITIONS: Record<ApprovalAction, { from: ApprovalState[]; to: ApprovalState }> = {
  submit: { from: ["draft", "changes_requested"], to: "in_review" },
  approve: { from: ["in_review"], to: "approved" },
  request_changes: { from: ["in_review"], to: "changes_requested" },
  reject: { from: ["in_review"], to: "rejected" },
  publish: { from: ["approved"], to: "published" },
  reopen: { from: ["rejected", "published"], to: "draft" },
};

export function canApply(action: ApprovalAction, state: ApprovalState): boolean {
  return TRANSITIONS[action]?.from.includes(state) ?? false;
}

// The actions legal from a given state (for rendering the right buttons).
export function actionsFor(state: ApprovalState): ApprovalAction[] {
  return (Object.keys(TRANSITIONS) as ApprovalAction[]).filter((a) => canApply(a, state));
}

export const STATE_META: Record<ApprovalState, { label: string; tone: "neutral" | "info" | "warn" | "good" | "bad" }> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  changes_requested: { label: "Changes requested", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  published: { label: "Published", tone: "good" },
};

export const ACTION_META: Record<ApprovalAction, { label: string; tone: "primary" | "good" | "warn" | "bad" | "neutral" }> = {
  submit: { label: "Submit for review", tone: "primary" },
  approve: { label: "Approve", tone: "good" },
  request_changes: { label: "Request changes", tone: "warn" },
  reject: { label: "Reject", tone: "bad" },
  publish: { label: "Publish", tone: "good" },
  reopen: { label: "Reopen", tone: "neutral" },
};

// The role pipeline, for display.
export const PIPELINE = ["creator", "editor", "manager", "client", "publish"] as const;
