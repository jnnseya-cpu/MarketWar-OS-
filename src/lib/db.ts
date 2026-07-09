// Persistence facade. Writes go to Firestore when the Admin SDK is
// configured and become no-ops otherwise, so every feature works in demo
// mode and starts persisting the moment Firebase env vars are added.

import { adminDb } from "@/lib/firebase/admin";
import type { AuditInput } from "@/lib/ai/audit";
import type { AgentResult, AuditReport } from "@/lib/types";

export async function saveAuditReport(
  input: AuditInput,
  report: AuditReport
): Promise<string | null> {
  if (!adminDb) return null;
  const doc = await adminDb.collection("audits").add({
    input,
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
    input,
    output: result.output,
    generatedAt: result.generatedAt,
  });
}
