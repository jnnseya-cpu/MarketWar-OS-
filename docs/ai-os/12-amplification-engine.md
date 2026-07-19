# 12 — M-35 Viral Amplification & Retargeting Engine (Agent 24, shipped core)

Adopted 2026-07-19 from the owner's instruction to maximise reach and
follow-up — **built the correct, legal way** after the owner confirmed
"do the correct and legal way." The literal ask (track everyone leaving
cookies across the internet; show them content 5×/day until they act) was
declined because it conflicts with the platform's own consent architecture
(doc 08 §B.3), PECR/UK-GDPR, ad-network frequency policy, and the sender
reputation the M-34 engine depends on. This engine delivers the *outcome*
the owner wants — maximum compounding reach and relentless follow-up —
through two lawful mechanisms.

| Owner goal | Lawful mechanism |
|---|---|
| **"109× viral" / maximum reach** | **Earned virality:** referral loops, UGC amplification and affiliate distribution that compound through people who *choose* to share. The engine computes the honest **viral coefficient K** (`invitesPerSharer × inviteConversion × shareRate`); K ≥ 1 self-sustains, below 1 amplifies then tapers. We report real projected reach, never a fixed multiplier. |
| **"see it 5× a day until they act"** | **Consented, frequency-capped retargeting:** sequenced cross-channel follow-up (retargeting ads + WhatsApp + email + SMS) aimed ONLY at people who touched the tenant's own funnel, on channels they consented to, pursued **until they convert or opt out** — capped at **5 touches per rolling 7 days per person** across all channels combined. Opt-out or conversion ends contact immediately. |

## What it never does (recorded so the boundary is explicit)

No cross-web surveillance of strangers · no contacting anyone outside the
tenant's own funnel · no uncapped frequency · no ignoring opt-out · no
purchased/scraped tracking. These would breach PECR/GDPR, get ad accounts
and pixels banned, and destroy the deliverability the whole OS relies on.

## Architecture

- **Engine** `src/backend/amplify.ts`: `projectVirality()` (honest K + per-cycle
  reach projection, capped at 20 cycles) · `planRetargeting()` (per-subject
  send/hold/stop decisions enforcing consent, the 5-per-7-day cap, opt-out and
  conversion stops). `RETARGETABLE_BEHAVIOURS` defines the seven lawful funnel
  interactions; strangers are never eligible.
- **API** `/api/amplify`: `virality` (projection) · `retarget` (compliant plan,
  up to 5,000 subjects) · GET doctrine + limits. Loop automation and channel
  execution run through the M-22 notification service + connectors at P1.
- **Agent 24 — AI Viral Amplification Strategist** (`amplification-strategist`):
  reach reality (honest K + levers), viral-loop design, native content
  amplification, consented retargeting sequence, frequency governance, honest
  projection. Surfaces in the Reach Amplifier (`/dashboard/amplify`) with a
  live viral-coefficient calculator wired to the real backend.
- **Composes with:** the consent ledger (doc 08 §B.3), audience-health BVI
  dimension (frequency > 4.0 / saturation > 70% alerts), the retargeting
  audiences from M-10, referral engine M-18, and the M-34 email engine's
  suppression + consent rules.

## KPIs (binding)

Viral coefficient measured and reported per campaign · retargeting frequency
never exceeds 5/7-day/person · opt-out honoured within one send cycle ·
zero contact to non-funnel subjects (audited) · complaint rate < 0.1%.

## ACU & margin

Amplification planning metered per run; priced ≥ 2× provider cost (owner
floor, doc 08 §A.1a).
