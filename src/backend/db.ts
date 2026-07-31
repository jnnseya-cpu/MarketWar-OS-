// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Persistence facade. Writes go to Firestore when the Admin SDK is
// configured and become no-ops otherwise, so every feature works in demo
// mode and starts persisting the moment Firebase env vars are added.
//
// Every write passes through the E2E encryption layer first: PII fields are
// AES-256-GCM-encrypted with the tenant's derived key (src/backend/crypto.ts)
// so plaintext contact data never reaches Firestore.

import { adminDb } from "@/backend/firebase-admin";
import { encryptPii } from "@/backend/crypto";
import type { AuditInput } from "@/backend/audit";
import type { AgentResult, AuditReport } from "@/shared/types";

// Tenant scope for key derivation. Until multi-tenant auth lands, runs are
// keyed by the business name supplied in the input (demo default otherwise).
function tenantId(input: Record<string, string>): string {
  return input.businessId || input.business || "demo-tenant";
}

export async function saveAuditReport(
  input: AuditInput,
  report: AuditReport
): Promise<string | null> {
  if (!adminDb) return null;
  const record = input as unknown as Record<string, string>;
  const doc = await adminDb.collection("audits").add({
    // adminDb is non-null here (guarded above), so this write is real:
    // persistenceLive=true makes a missing master key throw instead of
    // silently storing contact details in plaintext.
    input: encryptPii(record, tenantId(record), true),
    report,
    createdAt: new Date().toISOString(),
  });
  return doc.id;
}

export async function logAgentRun(
  result: AgentResult,
  input: Record<string, string>
): Promise<void> {
  if (!adminDb) return;
  await adminDb.collection("agent_runs").add({
    agentId: result.agentId,
    mode: result.mode,
    input: encryptPii(input, tenantId(input), true),
    output: result.output,
    generatedAt: result.generatedAt,
  });
}