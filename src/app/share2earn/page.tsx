import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import JoinShare2Earn from "@/components/JoinShare2Earn";
import {
  SIGNUP_DOORS, UPGRADE_PATH, ratePct, SHARE2EARN_RATE, SHARE2EARN_RATE_CAP,
  INFLUENCER_RATE_10K, INFLUENCER_RATE_5K,
} from "@/shared/creator-program";
import { SIGNUP_WINDOW_DAYS } from "@/shared/signup-attribution";

export const metadata: Metadata = {
  title: "Join SHARE2EARN · MarketWar OS",
  description: `Post. Move your audience. Earn. SHARE2EARN pays ${ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale your link produces — no application, no follower count, no audience test. Join with a name and an email.`,
  alternates: { canonical: "/share2earn" },
};

// The public SHARE2EARN door.
//
// It exists because the platform had one signup surface — the creator
// application on /growth — while SHARE2EARN's whole promise is that there is no
// application. A promise made in a rate table and contradicted by the only form
// on the site is a promise nobody can act on.

export default function Share2EarnPage() {
  const growth = SIGNUP_DOORS.find((d) => d.id === "growth")!;

  return (
    <MarketingShell
      kicker="SHARE2EARN"
      title="Post. Move your audience. Earn."
      subtitle={`${ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale your link produces. No application, no follower count, no audience test — and nobody is ever told they are too small to earn.`}
    >
      <Prose>
        <JoinShare2Earn />

        <H2>How this differs from applying</H2>
        <p>
          MarketWar runs two creator programmes and they are two doors into one account, not two
          companies. The influencer bands pay {ratePct(INFLUENCER_RATE_10K)} at 10,000 verified
          followers and {ratePct(INFLUENCER_RATE_5K)} between 5,000 and 9,999 — and they are reviewed
          precisely because they pay more: you state your channels, an agent or a human reads your
          public profiles, and the verified count is what unlocks the rate. SHARE2EARN pays{" "}
          {ratePct(SHARE2EARN_RATE)} and is not reviewed at all, because a review queue in front of a
          rate anyone qualifies for exists only to turn people away.
        </p>
        <p>{UPGRADE_PATH}</p>
        <p className="text-sm text-slate-400">
          {ratePct(SHARE2EARN_RATE)} is also a ceiling ({ratePct(SHARE2EARN_RATE_CAP)}): SHARE2EARN can
          never pay more than the influencer bands it sits beneath. That is arithmetic in the code
          rather than a policy somebody has to remember — the rate is derived as the minimum of its own
          cap and every influencer band, so cutting a band drags this one down with it instead of
          letting it overtake.
        </p>

        <H2>What you can promote</H2>
        <p>
          Each brand decides that, and it picks one of three settings. <strong>Missions only</strong> —
          the brand publishes missions with a written brief and a funded reward, and those are the only
          way to earn on it. <strong>Curated catalogue</strong> — the brand lists products and switches
          on the ones creators may take. <strong>Open catalogue</strong> — everything the brand lists is
          promotable by default and it excludes individual items instead.
        </p>
        <p>
          In the last two you browse and claim without asking anyone: claiming issues you a tracked link
          to the brand&rsquo;s own product page, and the sale it produces pays you{" "}
          {ratePct(SHARE2EARN_RATE)} once it is verified.
        </p>
        <p>
          One honest limit, and it is the same one that protects the rate: a product only becomes
          claimable if its own margin can fund the commission. A brand can open its entire range and
          still find an item marked ineligible — that is the product&rsquo;s economics refusing, not us.
          When that happens the product pays nothing rather than quietly paying you a smaller
          percentage, because a headline rate that shrinks on some items is a rate nobody can trust.
        </p>

        <H2>What gets counted</H2>
        <p>
          Cash is paid on verified sales. Not on clicks, not on views, not on follower count — the
          commission is {ratePct(SHARE2EARN_RATE)} of the <em>eligible net value</em>, which is the
          product value with tax, delivery, tips, gift cards and refunds taken out. Money the merchant
          never keeps cannot fund a commission, and pretending otherwise is how these programmes end up
          paying creators out of VAT.
        </p>
        <p>
          Everything else you do — posting, sharing, bringing people in — earns XP toward levels and
          bonuses rather than cash. That is not a downgrade dressed up: engagement we cannot verify as
          revenue is engagement we cannot honestly pay for, and a programme that pays for unverifiable
          reach is a programme that gets drained by whoever notices first.
        </p>

        <H2>Who gets credited, and for how long</H2>
        <p>
          <strong>Last click wins, for {SIGNUP_WINDOW_DAYS} days.</strong> If someone clicks your link and
          signs up three weeks later, you are credited. If they click a different creator&rsquo;s link in
          between, that creator is credited instead — the most recent click before the signup is the one
          that counts. If nobody&rsquo;s link has been clicked for {SIGNUP_WINDOW_DAYS} days, nobody is
          credited.
        </p>
        <p>
          One honest limit, because you would find it eventually and it is better said now. The{" "}
          {SIGNUP_WINDOW_DAYS} days need a small first-party cookie, and a cookie is something the visitor
          has to agree to — referral attribution is not a &ldquo;necessary&rdquo; cookie under UK law and
          we are not going to pretend it is. If they decline, <strong>nothing is stored on their device
          and you are still credited for the visit</strong>: the code travels in the web address from your
          link through to the signup page, which is how most referred signups happen anyway. What you lose
          in that case is the person who leaves and comes back a week later.
        </p>
        <p className="text-sm text-slate-400">
          A signup is credited once and once only — a refresh, a second tab or a retried request cannot
          create a second referral — and you cannot refer your own account.
        </p>

        <H2>Getting paid</H2>
        <p>
          Earnings settle after a hold, then you verify your identity once and withdraw to whichever
          rail suits you — bank, card, PayPal, Wise, or mobile money on M-Pesa, Orange, Airtel and
          Africell. You are paid gross: no tax is withheld, because you are not our employee. Every fee
          is shown before you confirm, and our administration fee is 3% of the provider&rsquo;s
          processing fee rather than of your withdrawal.
        </p>
        <p className="text-sm text-slate-400">
          The detail is in the{" "}
          <Link href="/blog/creator-payout-economics">creator payout economics</Link> article, the{" "}
          <Link href="/blog/creator-earning-programmes">guide to the earning programmes</Link>, and{" "}
          <Link href="/terms">§9 of the terms</Link>. If you would rather be reviewed for the higher
          bands, <Link href="/growth">apply here</Link> — {growth.then.charAt(0).toLowerCase() + growth.then.slice(1)}
        </p>
      </Prose>
    </MarketingShell>
  );
}
