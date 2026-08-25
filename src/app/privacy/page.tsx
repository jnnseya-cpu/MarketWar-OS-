import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import CookieSettingsLink from "@/components/CookieSettingsLink";
import { SIGNUP_WINDOW_DAYS } from "@/shared/signup-attribution";

export const metadata: Metadata = {
  title: "Privacy Policy · MarketWar OS",
  description: "How MarketWar OS collects, uses, protects and shares personal data.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell kicker="Legal" title="Privacy Policy" subtitle="Last updated 2 August 2026. How we collect, use, protect and share personal data — written to align with UK GDPR and equivalent regimes.">
      <Prose>
        <H2>1. Who we are</H2>
        <p>MarketWar OS (marketwaros.com) is the data controller for account and marketing data, and a data processor for the customer data you upload and process through the platform. Contact our privacy team via the <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">contact page</Link>.</p>

        <H2>2. Data we collect</H2>
        <ul className="space-y-1.5">
          {[
            "Account data: name, email, organisation, authentication identifiers.",
            "Billing data: plan, ACU ledger, payment metadata (card details are held by our payment processor, not us).",
            "Usage data: features used, AI jobs, request/idempotency ids, audit logs, device/IP for security and rate limiting.",
            "Customer data you upload: contacts, campaigns, assets, website/product inputs — processed on your behalf.",
            "Email delivery events: when a message you send is opened or a link in it is clicked, plus the requesting user agent — recorded per recipient so the platform can report your campaign results and stop sending to addresses that bounce or complain.",
          ].map((x) => <li key={x} className="flex items-start gap-2 text-[14px] text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> {x}</li>)}
        </ul>
        <p className="text-[14px] text-slate-400">
          <strong className="text-slate-200">How email tracking works, stated plainly.</strong> Campaigns sent through the
          platform carry a 1&times;1 image that records an open, and every link is rewritten through a redirector that
          records a click before forwarding to the original address. Both are keyed to the individual recipient, and the
          user agent is stored so that automated security scanners can be told apart from people. Where you send to your
          own contacts you are the controller for that tracking and are responsible for disclosing it in your own privacy
          notice; we are your processor. The same mechanism is used on the marketing email we send you, under the consent
          or opt-out described above. Every message carries a one-click unsubscribe, and bounces, complaints and
          unsubscribes are added to a suppression ledger that is never re-sent to.
        </p>

        <H2>3. Lawful bases</H2>
        <p>We process account and billing data to perform our contract with you; usage/security data under legitimate interests; and marketing communications under consent or legitimate interests, with an easy opt-out. Where you use the platform to market to your own contacts, you are the controller and are responsible for your lawful basis (consent or a completed Legitimate Interest Assessment) — the platform records lawful-basis status per contact and enforces suppression and frequency caps.</p>

        <H2>4. How we use data</H2>
        <p>To provide and secure the Service, meter ACUs and bill you, prevent fraud and abuse, provide support, improve the product, and communicate with you. AI actions route through our gateway; provider cost is used internally only and never exposed to you or your customers.</p>

        <H2>5. Sharing</H2>
        <p>We share data with sub-processors strictly to run the Service: cloud hosting (Vercel), backend and storage (Firebase / Google Cloud, EU region where configured), payment processing (Stripe), and AI providers (OpenAI, Anthropic, Google) for the specific request you initiate. We do not sell personal data. Restricted-category workloads may be limited to specific providers or regions.</p>

        <H2>6. International transfers</H2>
        <p>Where data is processed outside the UK/EU, we rely on appropriate safeguards (adequacy decisions or standard contractual clauses). Our Realtime Database and, where configured, Firestore/Storage are hosted in an EU region.</p>

        <H2>7. Retention</H2>
        <p>We keep personal data only as long as needed for the purposes above and to meet legal obligations. On account closure, data is retained for a defined period then deleted or anonymised. Financial/audit records are kept as required by law.</p>

        <H2>8. Security</H2>
        <p>Field-level AES-256 encryption per business, tenant isolation, App Check, least-privilege secrets in managed storage, append-only financial ledgers, and client rules that block direct manipulation of balances or audit data.</p>

        <H2>9. Your rights</H2>
        <p>Subject to law, you may access, correct, delete, restrict, port or object to processing of your personal data, and withdraw consent at any time. To exercise these rights, <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">contact us</Link>. You may also complain to your supervisory authority (in the UK, the ICO).</p>

        <H2>10. Cookies</H2>
        <p><strong>Essential cookies</strong> — authentication and security — are always on. They are what makes staying signed in possible, so there is no version of the product that works without them, and we do not ask for consent we would not honour a refusal of.</p>
        <p><strong>Analytics cookies</strong> are set only if you accept them. We use Google Tag Manager to understand which pages help and which do not. Nothing analytical loads until you choose: not on page load, not while the banner is open, and not if you ignore the banner and carry on reading. No choice means no analytics. Rejecting is a single click, in a button the same size and prominence as the one that accepts, and rejecting changes nothing about how the product behaves for you.</p>
        <p><strong>Referral cookie</strong> (<code>mw_ref</code>) — set only if you accept cookies, and only if you arrived on a creator&rsquo;s referral link. It holds one thing: the referral code and the time you clicked it. It is not an identifier for you, it is never shared with anyone, and it is read only when an account is created, so that the creator who introduced you is credited. It lasts {SIGNUP_WINDOW_DAYS} days from your most recent click. If you refuse cookies nothing is stored on your device at all — the code travels in the web address for that visit only, and refusing changes nothing about the price you pay or how the product works for you. This is affiliate attribution rather than a necessary cookie, which is exactly why it waits for your answer instead of assuming it.</p>
        <p>You can <CookieSettingsLink /> at any time. See also the Cookie Policy in <Link href="/policies" className="text-emerald-400 hover:text-emerald-300">All policies</Link>.</p>

        <H2>11. Changes</H2>
        <p>We will post updates here and, for material changes, notify you. Continued use after an update means you accept it.</p>
      </Prose>
    </MarketingShell>
  );
}
