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

        <H2>8. Synthetic faces and voices, and other people&rsquo;s advertising</H2>
        <p>The Service can produce video with a synthetic presenter, and can analyse advertising that other businesses are running. Both touch other people&rsquo;s rights, so the limits are terms rather than settings and cannot be turned off.</p>
        <p><strong>A real person&rsquo;s likeness needs their consent, recorded before it is used.</strong> To synthesise an identifiable person&rsquo;s face or voice you must first record a consent naming that person, how you know they agreed, the territories and platforms it covers, and the date it ends. Consent to a face is not consent to a voice, and consent to organic use is not consent to paid advertising; each is asked for separately. Without a consent covering the specific use, the Service refuses to render — this is not a warning you can dismiss. A consent can be withdrawn at any time, takes effect immediately, and the record of the withdrawal is kept.</p>
        <p><strong>Stock presenters are licensed performers.</strong> They are supplied under the provider&rsquo;s licence, not ours. You may not present them in a way that implies a real person personally endorses your product, and you may not use a synthetic presenter for medical, financial-advice, political or news-style content — the Service declines those outright, because every provider forbids them and the advertising regulators treat a synthetic endorsement in those categories as misleading.</p>
        <p><strong>Synthetic media must be disclosed.</strong> Where a face or voice in your creative is synthetic, you are responsible for saying so on the published material. The EU AI Act imposes a transparency duty on synthetic media and the ASA treats an undisclosed synthetic endorsement as misleading.</p>
        <p><strong>We will not reproduce another advertiser&rsquo;s creative.</strong> The Service can count what the ads in your category have in common — how they open, whether they price, whether they prove — and will not recreate, remix or generate &ldquo;your version&rdquo; of a specific competitor&rsquo;s advertisement. An advertisement is a copyright work and its distinctive look can be protected trade dress; liability for publishing a copy would fall on you, not on us. Nor does the Service label any advertisement a winner: an ad running for a long time is evidence of a budget, not of a result.</p>

        <H2>9. Earning and being paid as a creator</H2>
        <p>Anyone can earn from their own audience through SHARE2EARN or, with a verified follower count, the creator programme. This section governs that relationship. It is separate from the rest of these terms in one important way: <strong>a creator is not our employee, our worker or our agent</strong>, and nothing here creates any of those relationships.</p>
        <p><strong>What you earn.</strong> SHARE2EARN pays <strong>0.5%</strong> of the eligible product value of a verified sale, with no follower requirement. The creator programme pays <strong>0.75%</strong> from 5,000 verified followers and <strong>1%</strong> from 10,000. Eligible value is the product only — tax, delivery, tips, gift cards and other non-product charges are excluded, because money the merchant never keeps cannot fund a commission. A refund reduces it; a cancellation voids it.</p>
        <p><strong>Earned, not granted.</strong> Once a sale has settled and its refund window has closed, the commission is yours. A brand may withhold it only by raising a dispute on one of the recorded grounds — the order was refunded or charged back, the conversion was fraudulent, you bought it yourself, the content breached the brief, it was counted twice, or it was wrongly attributed — and you are told which. A brand cannot withhold a settled, undisputed commission, and the window for raising a dispute closes 28 days after the earning.</p>
        <p><strong>Some products are not eligible.</strong> Where paying the advertised rate would make a transaction lose money, that product is excluded from the programme rather than your rate being reduced. If a product is listed, it pays the rate advertised.</p>
        <p><strong>Withdrawals.</strong> Before your first payout we collect your legal name, date of birth, address and tax reference, and no money is released until that record is verified. This is required of any platform that pays people for services, and it also protects your balance from anyone who obtains your password. Payouts are available from age 18; below that a balance is held and does not expire.</p>
        <p><strong>What a withdrawal costs.</strong> The payout provider&rsquo;s own processing fee, passed through at cost, plus an administration fee of <strong>3% of that processing fee</strong> — not of your withdrawal. Every charge is itemised before you confirm, and a withdrawal whose fees would exceed a quarter of the amount is refused rather than offered.</p>
        <p><strong>Tax.</strong> You are paid gross. Nothing is deducted — no income tax, no National Insurance, no PAYE — and you are responsible for declaring what you earn wherever you live. We are separately required to report annual earnings to the tax authority under the rules for digital platforms, and you receive a copy of exactly what is reported. Where your country issues no individual tax reference, or you are not required to hold one, that fact is reported in its place. None of this is tax advice.</p>
        <p><strong>Fair use.</strong> Buying through your own link is not a referral and pays nothing. Manufactured clicks, fake conversions, undisclosed paid promotion, and content that breaches a campaign brief are grounds for withholding the affected earnings and, on repetition, for closing the account. Every paid post must be disclosed as advertising — that obligation is yours as the person publishing it.</p>
        <p><strong>Brands.</strong> Commission is charged to the promoted brand as an acquisition cost on sales the campaign produced: the creator&rsquo;s rate plus our 0.25% share. It is never charged to the creator or to the customer. Campaign spend is bounded automatically — the platform will not permit a reward configuration that breaches the margin you have chosen to protect, and the whole programme is capped at 5% of the value it generates.</p>

        <H2>10. Automation, schedules and unattended work</H2>
        <p>Parts of the Service can run without you present: agent chains on a cadence you set, and scheduled reports. Three things govern that, and we state them here because they are promises about your money and your customers, not features.</p>
        <p><strong>Nothing is sent, published or spent unattended.</strong> Every step of an automated run declares what performing it would do. Only steps that produce a draft for you to read are permitted to run on their own. A step that would contact a person, publish something publicly or commit spend is converted into an item awaiting your approval, with the draft attached — and this applies equally to runs that happen overnight.</p>
        <p><strong>Unattended usage is metered and capped.</strong> Work the platform performs on its own initiative consumes ACUs from your balance in the same way work you start yourself does, and is additionally subject to a fixed daily ceiling per brand, reserved before each step rather than reconciled afterwards. When the ceiling is reached the remaining steps do not run and are reported as skipped. The ceiling limits only automated work; anything you start yourself is governed by your balance alone.</p>
        <p><strong>You can switch it off.</strong> Schedules are per brand and per chain, off by default, and can be disabled at any time from the dashboard. Email digests are opt-in and go only to the address on your own account.</p>

        <H2>11. Third-party services</H2>
        <p>The Service may connect to third-party providers (AI models, payment, messaging, advertising). Your use of those is subject to their terms. External platforms are optional; the Service remains functional without them.</p>

        <H2>12. Availability & changes</H2>
        <p>We aim for high availability (see <Link href="/status" className="text-emerald-400 hover:text-emerald-300">Platform status</Link>) but do not guarantee uninterrupted service. We may modify or discontinue features with reasonable notice.</p>

        <H2>13. Suspension & termination</H2>
        <p>We may suspend or terminate access for breach, non-payment (after a grace period), or unlawful use. On termination your data is retained per the retention policy, then deleted. Purchased top-up ACUs remain valid within their validity window.</p>

        <H2>14. Warranties & liability</H2>
        <p>The Service is provided &quot;as is&quot; to the extent permitted by law. To the maximum extent permitted, our aggregate liability is limited to the fees you paid in the twelve months preceding the claim. We are not liable for indirect or consequential losses.</p>

        <H2>15. Governing law</H2>
        <p>These terms are governed by the laws of England and Wales, unless a mandatory local law applies to you. Disputes are subject to the exclusive jurisdiction of the courts of England and Wales.</p>

        <H2>16. Who you are contracting with</H2>
        <LegalEntity />

        <H2>17. Contact</H2>
        <p>Questions about these terms: <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">contact us</Link>.</p>
      </Prose>
    </MarketingShell>
  );
}
