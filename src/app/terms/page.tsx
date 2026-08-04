import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import LegalEntity from "@/components/LegalEntity";

export const metadata: Metadata = {
  title: "Terms of Service · MarketWar OS",
  description: "The terms governing use of the MarketWar OS platform.",
};

export default function TermsPage() {
  return (
    <MarketingShell kicker="Legal" title="Terms of Service" subtitle="Last updated 2 August 2026. These terms govern your access to and use of MarketWar OS. By creating an account you agree to them.">
      <Prose>
        <H2>1. The service</H2>
        <p>MarketWar OS (&quot;the Service&quot;, operated at marketwaros.com) is an AI-powered customer-acquisition platform. We grant you a limited, non-exclusive, non-transferable right to access and use the Service in accordance with these terms and your subscription plan.</p>

        <H2>2. Accounts & eligibility</H2>
        <p>You must provide accurate registration information, keep your credentials secure, and be authorised to bind your organisation. You are responsible for all activity under your account. You must be of legal age to form a binding contract.</p>

        <H2>3. Subscriptions, ACUs & billing</H2>
        <p>Platform access is sold as a subscription; AI usage is metered in ACUs (£1 = 100 ACUs). Each plan includes an automatic ACU allowance (20% of the price paid). Annual plans receive a 30% discount with ACUs released monthly. Top-up refunds are covered in section 4. We may adjust ACU consumption rates when external provider costs change; your purchased ACU quantity remains unchanged, but future actions may require different ACU amounts. Fees are exclusive of taxes.</p>

        <H2>4. Cancelling, and getting money back</H2>
        <p><strong>Everyone.</strong> You can cancel a subscription at any time from the Billing page. Cancellation takes effect at the end of the period you have already paid for; you keep full access until then, and you are not charged again. We do not require notice, a phone call, or a reason.</p>
        <p><strong>If you are a consumer</strong> (buying as an individual rather than for a business), you have a statutory right under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 to cancel within <strong>14 days</strong> of the contract being made, and to be refunded. To use it, just tell us — the <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">contact page</Link> is enough, and no particular form of words is needed.</p>
        <p>Because the platform starts working the moment you sign in, you are asking us to begin supplying the service inside that 14-day window. Two consequences follow, and we would rather state them plainly than bury them: we may keep an amount proportionate to what was actually supplied before you cancelled, and ACUs you have already spent are not refundable — those are provider costs we have genuinely incurred on your behalf and cannot recover. Everything else is refunded, including your unused ACU balance and any part of the period you did not use. Refunds go back to the original payment method within 14 days of us being told.</p>
        <p><strong>If you are a business</strong>, the 14-day statutory right does not apply, but the cancel-any-time term above still does.</p>
        <p>Unused top-up ACUs are refundable on request within 14 days of purchase. Partially used top-ups are refunded pro rata on the unused balance.</p>

        <H2>5. Acceptable use</H2>
        <p>You will not use the Service to send unlawful, deceptive or non-consensual marketing; to generate content that infringes third-party rights; to impersonate others; to build fabricated reviews, testimonials or endorsements; or to circumvent the platform's consent, frequency-cap, rights or claim-verification safeguards. See the <Link href="/policies" className="text-emerald-400 hover:text-emerald-300">Acceptable Use Policy</Link>.</p>

        <H2>6. Your content & data</H2>
        <p>You retain ownership of the content and data you provide. You grant us the limited licence needed to operate the Service (store, process, and generate outputs on your behalf). We process personal data per the <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300">Privacy Policy</Link>. Personal data fields (contact names, emails, phone numbers) are encrypted at rest with AES-256-GCM under a key derived per business, so one business&rsquo;s key does not decrypt another&rsquo;s records. The platform refuses to store personal data at all if that encryption is not configured.</p>

        <H2>7. AI outputs</H2>
        <p>AI-generated outputs are provided as assistance, not guaranteed results. Scores and predictions are labelled estimates. You are responsible for reviewing outputs before publishing, and for ensuring any claims are substantiated. The Service blocks unsubstantiated superlatives and applies compliance checks, but final responsibility for published material is yours.</p>

        <H2>8. Automation, schedules and unattended work</H2>
        <p>Parts of the Service can run without you present: agent chains on a cadence you set, and scheduled reports. Three things govern that, and we state them here because they are promises about your money and your customers, not features.</p>
        <p><strong>Nothing is sent, published or spent unattended.</strong> Every step of an automated run declares what performing it would do. Only steps that produce a draft for you to read are permitted to run on their own. A step that would contact a person, publish something publicly or commit spend is converted into an item awaiting your approval, with the draft attached — and this applies equally to runs that happen overnight.</p>
        <p><strong>Unattended usage is metered and capped.</strong> Work the platform performs on its own initiative consumes ACUs from your balance in the same way work you start yourself does, and is additionally subject to a fixed daily ceiling per brand, reserved before each step rather than reconciled afterwards. When the ceiling is reached the remaining steps do not run and are reported as skipped. The ceiling limits only automated work; anything you start yourself is governed by your balance alone.</p>
        <p><strong>You can switch it off.</strong> Schedules are per brand and per chain, off by default, and can be disabled at any time from the dashboard. Email digests are opt-in and go only to the address on your own account.</p>

        <H2>9. Third-party services</H2>
        <p>The Service may connect to third-party providers (AI models, payment, messaging, advertising). Your use of those is subject to their terms. External platforms are optional; the Service remains functional without them.</p>

        <H2>10. Availability & changes</H2>
        <p>We aim for high availability (see <Link href="/status" className="text-emerald-400 hover:text-emerald-300">Platform status</Link>) but do not guarantee uninterrupted service. We may modify or discontinue features with reasonable notice.</p>

        <H2>11. Suspension & termination</H2>
        <p>We may suspend or terminate access for breach, non-payment (after a grace period), or unlawful use. On termination your data is retained per the retention policy, then deleted. Purchased top-up ACUs remain valid within their validity window.</p>

        <H2>12. Warranties & liability</H2>
        <p>The Service is provided &quot;as is&quot; to the extent permitted by law. To the maximum extent permitted, our aggregate liability is limited to the fees you paid in the twelve months preceding the claim. We are not liable for indirect or consequential losses.</p>

        <H2>13. Governing law</H2>
        <p>These terms are governed by the laws of England and Wales, unless a mandatory local law applies to you. Disputes are subject to the exclusive jurisdiction of the courts of England and Wales.</p>

        <H2>14. Who you are contracting with</H2>
        <LegalEntity />

        <H2>15. Contact</H2>
        <p>Questions about these terms: <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">contact us</Link>.</p>
      </Prose>
    </MarketingShell>
  );
}
