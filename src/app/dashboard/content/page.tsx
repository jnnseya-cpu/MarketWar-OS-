import GenerateAndPublish from "@/components/GenerateAndPublish";
import { PageHeader } from "@/components/ui";

export default function ContentFactoryPage() {
  return (
    <div>
      <PageHeader
        kicker="AI Content Factory"
        title="Manufacture conversion content"
        subtitle="Calendars, reels scripts and posts — every asset engineered to route attention into WhatsApp and channels you own. No posting for posting's sake."
      />
      <GenerateAndPublish
        agentId="content-factory"
        buttonLabel="Generate my strike plan"
        publishSourceLabel="content"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Location", defaultValue: "Brixton, London" },
          { key: "product", label: "Product / service", defaultValue: "Flame-grilled meals and family platters", textarea: true },
          { key: "offer", label: "Offer to push", defaultValue: "Feed 4 for £25, Fridays only" },
          { key: "platforms", label: "Platforms", defaultValue: "Instagram, TikTok, Facebook, WhatsApp" },
        ]}
      />
    </div>
  );
}
