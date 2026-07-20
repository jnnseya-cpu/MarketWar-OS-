import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Terms of Service · MarketWar OS",
  description: "The terms governing use of the MarketWar OS platform.",
};

export default function TermsPage() {
  return (
    <MarketingShell kicker="Legal" title="Terms of Service" subtitle="Last updated 20 July 2026. These terms govern your access to and use of MarketWar OS. By creating an account you agree to them.">
      <Prose>
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px] text-emerald-100">
          This is a plain-English summary-style agreement provided as a starting template. Review with qualified legal
          counsel and localise for your jurisdiction before commercial launch.
        </p>

        <H2>1. The service</H2>
        <p>MarketWar OS (&quot;the Service&quot;, operated at marketwaros.com) is an AI-powered customer-acquisition platform. We grant you a limited, non-exclusive, non-transferable right to access and use the Service in accordance with these terms and your subscription plan.</p>

        <H2>2. Accounts & eligibility</H2>
        <p>You must provide accurate registration information, keep your credentials secure, and be authorised to bind your organisation. You are responsible for all activity under your account. You must be of legal age to form a binding contract.</p>

        <H2>3. Subscriptions, ACUs & billing</H2>
        <p>Platform access is sold as a subscription; AI usage is metered in ACUs (£1 = 100 ACUs). Each plan includes an automatic ACU allowance (20% of the price paid). Annual plans receive a 30% discount with ACUs released monthly. Top-ups are non-refundable once partially used. We may adjust ACU consumption rates when external provider costs change; your purchased ACU quantity remains unchanged, but future actions may require different ACU amounts. Fees are exclusive of taxes.</p>

        <H2>4. Acceptable use</H2>
        <p>You will not use the Service to send unlawful, deceptive or non-consensual marketing; to generate content that infringes third-party rights; to impersonate others; to build fabricated reviews, testimonials or endorsements; or to circumvent the platform's consent, frequency-cap, rights or claim-verification safeguards. See the <Link href="/policies" className="text-emerald-400 hover:text-emerald-300">Acceptable Use Policy</Link>.</p>

        <H2>5. Your content & data</H2>
        <p>You retain ownership of the content and data you provide. You grant us the limited licence needed to operate the Service (store, process, and generate outputs on your behalf). We process personal data per the <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300">Privacy Policy</Link>. Field-level encryption is applied per business; one tenant can never access another's data.</p>

        <H2>6. AI outputs</H2>
        <p>AI-generated outputs are provided as assistance, not guaranteed results. Scores and predictions are labelled estimates. You are responsible for reviewing outputs before publishing, and for ensuring any claims are substantiated. The Service blocks unsubstantiated superlatives and applies compliance checks, but final responsibility for published material is yours.</p>

        <H2>7. Third-party services</H2>
        <p>The Service may connect to third-party providers (AI models, payment, messaging, advertising). Your use of those is subject to their terms. External platforms are optional; the Service remains functional without them.</p>

        <H2>8. Availability & changes</H2>
        <p>We aim for high availability (see <Link href="/status" className="text-emerald-400 hover:text-emerald-300">Platform status</Link>) but do not guarantee uninterrupted service. We may modify or discontinue features with reasonable notice.</p>

        <H2>9. Suspension & termination</H2>
        <p>We may suspend or terminate access for breach, non-payment (after a grace period), or unlawful use. On termination your data is retained per the retention policy, then deleted. Purchased top-up ACUs remain valid within their validity window.</p>

        <H2>10. Warranties & liability</H2>
        <p>The Service is provided &quot;as is&quot; to the extent permitted by law. To the maximum extent permitted, our aggregate liability is limited to the fees you paid in the twelve months preceding the claim. We are not liable for indirect or consequential losses.</p>

        <H2>11. Governing law</H2>
        <p>These terms are governed by the laws of England and Wales, unless a mandatory local law applies to you. Disputes are subject to the exclusive jurisdiction of the courts of England and Wales.</p>

        <H2>12. Contact</H2>
        <p>Questions about these terms: <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">contact us</Link>.</p>
      </Prose>
    </MarketingShell>
  );
}
