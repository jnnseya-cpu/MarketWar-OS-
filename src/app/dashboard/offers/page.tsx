"use client";

import { useState } from "react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader } from "@/components/ui";

export default function OffersPage() {
  const [tab, setTab] = useState<"offers" | "pain">("offers");
  return (
    <div>
      <PageHeader
        kicker="Offer Builder Engine"
        title="Engineer an irresistible offer"
        subtitle="Discounts, bundles, guarantees, urgency, referral rewards — each engineered against your margin and your customer's real objections."
      />

      <div className="mb-6 flex gap-2 border-b border-ink-700">
        {(
          [
            ["offers", "Offer Builder"],
            ["pain", "Customer Pain Intel"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === key ? "border-emerald-500 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "offers" ? (
        <AgentRunner
          agentId="offer-builder"
          buttonLabel="Engineer my offers"
          fields={[
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "product", label: "Product / service", defaultValue: "Flame-grilled meals, family platters, office catering", textarea: true },
            { key: "price", label: "Current price", defaultValue: "£9.50 average order" },
            { key: "margin", label: "Rough gross margin (%)", defaultValue: "58" },
            { key: "targetCustomer", label: "Target customer", defaultValue: "Local families and young professionals" },
          ]}
        />
      ) : (
        <AgentRunner
          agentId="customer-pain"
          buttonLabel="Extract pains & triggers"
          fields={[
            { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
            { key: "location", label: "Location", defaultValue: "Brixton, London" },
            { key: "product", label: "Product / service", defaultValue: "Flame-grilled family meals and office catering", textarea: true },
            { key: "targetCustomer", label: "Target customer", defaultValue: "Local families and young professionals" },
          ]}
        />
      )}
    </div>
  );
}
