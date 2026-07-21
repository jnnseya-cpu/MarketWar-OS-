"use client";

// Generator + one-click publish. Renders an AgentRunner and, below it, the
// PublishToChannels action seeded with whatever the agent just produced — so
// generated content flows straight into cross-posting through the Zernio gateway.
// A thin client wrapper so server-component pages can keep rendering it inline.

import { useState } from "react";
import AgentRunner, { type AgentField } from "@/components/AgentRunner";
import PublishToChannels from "@/components/PublishToChannels";
import type { AgentResult } from "@/shared/types";

export default function GenerateAndPublish({
  agentId,
  buttonLabel,
  fields,
  publishSourceLabel,
}: {
  agentId: string;
  buttonLabel: string;
  fields: AgentField[];
  publishSourceLabel?: string;
}) {
  const [generated, setGenerated] = useState("");
  return (
    <>
      <AgentRunner agentId={agentId} buttonLabel={buttonLabel} fields={fields} onResult={(r: AgentResult) => setGenerated(r.output)} />
      <PublishToChannels defaultText={generated} sourceLabel={publishSourceLabel} />
    </>
  );
}
