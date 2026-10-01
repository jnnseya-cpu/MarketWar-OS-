# Facebook ads — five image prompts and one copy prompt

Built 2026-10-01. Companion to `FACEBOOK-LAUNCH-CAMPAIGN.docx` (`npm run ads:doc`),
which holds the campaign settings, ad sets and audiences. This file holds the
generation prompts only.

## The facts these are built on, and where they come from

Everything quotable below is read out of `src/`, not remembered:

| Fact | Value | Source |
|---|---|---|
| Free audit | a real crawl, no account, no card | `src/app/api/audit/route.ts` → `crawlSite` |
| Checks it runs | **31** | `src/shared/audit-copy.ts` → `auditCheckCount()` |
| Findings shown free | **3** (the worst three) | `FREE_FINDINGS = 3` |
| Starter | **£19/month** | `src/backend/subscription.ts` |
| Growth | **£49/month** | same |
| Emergency stop | real, per-lane | `src/backend/emergency-stop.ts` |
| Customers | **zero** | `docs/STATE.md` §2 |

**Why 31 and not 32.** `AUDIT_COPY` has 32 entries and one of them is
`conditional` — it only runs when the page warrants it. `auditCheckCount()`
excludes it on purpose, and the reason is written above that function: a number
printed where something is being sold has to be the number that is true of
*every* visitor. The first draft of this file said 32, counted off the keys
instead of asking the platform. `npm run ads:verify` now derives it and fails the
build if any prompt here disagrees, because a wrong number inside a generated
image cannot be edited afterwards — it is in the pixels and then in the ad
account.

That last row is the one that decides what these prompts may say. **No
testimonial, no "trusted by", no customer count, no result claim, no
before-and-after.** Not because of squeamishness — because there is nothing to
base one on, Meta's review checks claims, the ASA acts on them, and the platform
sells itself on not publishing numbers it has not earned. Every prompt below
therefore sells one of the three things that are true today: **the mechanism, the
price, and the free audit.**

## Where the card actually comes out

Worth being plain, because it changes what these images are for. A cold Facebook
viewer who has never heard of MarketWar OS does not buy a £19/month subscription
from an image. What a great image buys is the click. What gets the card out is
**the audit result** — their own website, 31 checks, three real problems named
with what each one costs them. That page is the salesperson; these five pictures
are the door, and the sixth prompt writes what is said at the door.

So every one of these drives to `/audit`, and the purchase happens on the other
side of a free thing that was genuinely useful. That is the highest-converting
honest path available to a product with no reputation yet.

Each of the five attacks a **different** buying trigger. They are not five
versions of one idea — run them against each other and let the audience tell you
which lever moves your market.

| # | Trigger | Why it moves money |
|---|---|---|
| 1 | Loss already incurred | Loss aversion beats gain. For trades, the unchased quote is a real, remembered, specific loss. |
| 2 | Specific personal evidence | "Your site, 31 checks, 3 free" is falsifiable and about *them*. Generic benefit claims are not. |
| 3 | Control / risk removal | The top objection to AI marketing from this audience is "it will say something stupid as me". |
| 4 | Price anchored against the alternative | £19 is not cheap in the abstract. Against an agency retainer it is obvious. |
| 5 | Identity | "This is for tech startups, not me" kills more sales here than price does. |

---

## Prompt 1 — The unchased quote (loss already incurred)

> Photorealistic editorial photograph, shot on a 35mm lens at f/2, natural
> window light on an overcast afternoon. A kitchen table in a modest British
> home: scratched oak, a cold half-drunk mug of tea leaving a ring, a set of van
> keys, a worn tape measure. In the centre, a single printed job quote on A4,
> slightly creased from being folded in a pocket, with a legible date in the top
> corner reading three weeks earlier than today. The quote has been pushed
> partly under a stack of unopened post. Shallow depth of field, the date in
> sharp focus, the background soft. Muted, honest colour grading — no teal-and-orange,
> no lifted blacks. The image should look like a photograph someone actually took
> on their phone and not like a composition. Leave the top third of the frame
> relatively empty and low-contrast for overlaid text.
>
> On-image text, set in a heavy clean sans-serif, white, upper left of that empty
> third, two lines maximum: **"You quoted it. Nobody chased it."**
>
> Negative: no stock-photo people, no suits, no handshakes, no laptops, no
> graphs, no fake dashboards, no invented company names or logos on the paper, no
> legible monetary figures, no watermark, no lens flare, no HDR look.
>
> Render at 1080×1080. Also render a 1080×1920 variant where the table runs to
> the bottom of the frame and the text sits in the upper fifth, keeping all text
> out of the top and bottom 250 pixels.

**Why this one first.** It is the only prompt here that names a loss the viewer
has personally experienced. It makes no claim about the product at all, which is
precisely why it survives review and why it stops the scroll.

---

## Prompt 2 — Thirty-two checks (specific personal evidence)

> Clean, high-contrast graphic composition. Not a photograph. A dark charcoal
> background (#0B1020) with a single column of 31 small horizontal bars arranged
> in a tight vertical stack, like a checklist seen from a distance — most of them
> a calm desaturated slate, exactly three of them a warm amber. No text inside
> the bars, no icons, no numbers: the pattern alone should read as "a list of
> things checked, three of which are wrong." Generous empty space to the right of
> the column. Subtle paper-grain texture, no gradients, no glow, no glassmorphism.
>
> On-image text, right of the column, left-aligned, three lines with clear
> hierarchy — large: **"31 checks on your website."** Medium: **"The 3 worst
> ones, free."** Small, bottom: **"No account. No card."**
>
> Negative: no browser chrome, no fake screenshots, no invented scores or
> percentages, no graphs, no stock UI kits, no rocket ships, no AI-cliché
> neon-purple gradients, no robot imagery.
>
> Render at 1080×1080 and 1080×1920 (in the vertical, stack the 31 bars in two
> columns of 16 so the type stays large).

**Why it works.** Thirty-two is a strange, specific number, and strange specific
numbers read as true in a feed full of round ones. The three amber bars tell the
whole story before a single word is read. Nothing here is invented: the number is
the real check count and the three are the real free findings.

---

## Prompt 3 — You keep the brake (control / risk removal)

> Photorealistic close-up, macro-leaning, shot on an 85mm lens at f/2.8. A real
> industrial emergency-stop button: a large mushroom-head red switch on a scuffed
> yellow metal housing, mounted on painted machinery. Visible honest wear —
> fingerprints, a chip in the paint, a faint scratch across the red. A single
> human thumb resting on it, not pressing, just resting: a working hand with a
> short nail and a trace of grime in the knuckle crease. Hard directional
> workshop light from the upper left, deep natural shadow to the right. Desaturated
> except the red, which stays genuinely red rather than crushed. The red button
> occupies the left two-fifths of the frame; the right three-fifths is dark,
> near-empty wall.
>
> On-image text, right side, white, two lines, the first much larger: **"It writes
> everything."** / **"You keep the brake."**
>
> Negative: no dashboards, no car interiors, no clean studio product shot, no
> glossy CGI button, no sparks, no gloves, no stock businessman, no text on the
> machinery.
>
> Render at 1080×1080 and 1080×1920.

**Why it works.** This is the objection, answered in six words, before the viewer
has consciously formed it. It is also literally true — the emergency stop is a
real per-lane feature, so the picture is a product claim that happens to be
checkable.

---

## Prompt 4 — Nineteen pounds (price against the alternative)

> Pure typographic composition, no photograph, no illustration. Off-white paper
> background (#F7F6F3) with a faint letterpress tooth. Two figures in a stark
> vertical comparison, enormous and confident, set in a tight grotesque with
> near-zero tracking. Upper figure, very large and in a flat muted red, with a
> single clean strike-through rule across it: **"£800"**. Beneath it, in solid
> near-black, roughly twice the size of the struck figure: **"£19"**. Beneath
> that, small and quiet, lowercase: **"a month"**. Enormous margins. Nothing is
> centred — the whole block sits slightly left and slightly above optical centre.
> One thin hairline rule, full width, 80 pixels from the bottom edge, with
> **"marketwaros.com"** small beneath it.
>
> Negative: no currency symbols other than £, no coins, no wallets, no credit
> cards, no percentage-off badges, no starbursts, no drop shadows, no gradients,
> no logos other than the wordmark, no photographs of any kind.
>
> Render at 1080×1080 and 1080×1920. This advert lives or dies on whether the
> typography looks assured, so give it the most attention and the least
> decoration.

**Before you run this one — one number is yours to set.** £19 is read from
`subscription.ts` and is true. The **£800** is a stand-in for the monthly agency
retainer you are positioning against; put in a figure you can defend if asked,
because a struck-through price is a comparative claim and both Meta and the ASA
treat it as one. If you would rather not defend a number, drop the £800 line
entirely and run **"£19 a month"** alone — it still works, it just works less
hard.

---

## Prompt 5 — Tested on a real business first (identity)

> Photorealistic documentary photograph, 28mm lens, handheld, shot in flat
> overcast northern-English daylight after rain. A working trades van parked at
> the kerb of an ordinary residential street — wet tarmac holding reflections,
> damp red brick, a wheelie bin, grey sky. The van's side door is open; visible
> inside are real tools in real disorder: a drill case, coiled cable, a dusty
> level, a hi-vis jacket thrown over the wheel arch. A tradesperson in their
> forties stands at the open door looking down at a phone in one hand, the other
> hand still holding a tool. Their face is partly visible and unposed —
> concentrating, not smiling at camera. No branding anywhere on the van. Slightly
> underexposed, true-to-life colour, visible grain. It must look like a
> photograph taken by a colleague, not by an agency. Keep the upper left quarter
> (sky) clear for text.
>
> On-image text, upper left, white, two lines: **"Built for this."** / **"Tested
> on a real business first."**
>
> Negative: no stock-photography smiles, no crossed arms, no clipboard poses, no
> suits, no sunshine, no American vehicles or signage, no visible company name or
> logo, no model-release-obvious studio lighting.
>
> Render at 1080×1080 and 1080×1920.

**Why it works, and the one claim to keep honest.** "Tested on a real business
first" is true — the platform has been run live against AxionOS (UK trades),
VeryX and KODA. It is a statement about *testing*, not about results, and it must
stay that way: "tested on" survives review, "worked for" does not, because there
is no measured outcome to point at yet.

---

## Prompt 6 — The ad copy prompt

Paste this whole block into your writing model. It carries the facts, the
forbidden claims and the format limits, so it cannot invent its way into a
rejected ad.

> You are writing Facebook/Instagram feed ad copy for **MarketWar OS**, an AI
> marketing platform for small businesses, sold in the UK. Write **six complete
> variants.**
>
> **The audience.** Owner-operators of small UK service businesses — trades,
> installers, local services — typically 30 to 55, running the business from a
> van or a kitchen table. They do their own marketing badly and know it. They
> have been sold to by agencies and are sceptical. They are not technical and are
> not impressed by the word "AI". They read this at arm's length, outdoors, on a
> cracked phone screen, between jobs.
>
> **The only offer.** A free website audit at marketwaros.com/audit. It runs a
> real crawl of their actual website, checks 31 things, and shows them the three
> worst problems free, each with what it is costing them and how to fix it. No
> account, no card, no email required to see the result. Paid plans start at £19
> a month; the main plan is £49 a month. The audit is the call to action in every
> variant — never the subscription.
>
> **Facts you may use. Nothing else is a fact.**
> - A real crawl of their real website; 31 checks; the 3 worst shown free.
> - No signup, no card, no email to see the result.
> - £19/month Starter, £49/month Growth.
> - Everything is written by the platform, and the owner approves before anything
>   is published or sent. There is an emergency stop that halts work by lane.
> - It has been tested live on real small businesses, including a UK trades
>   business.
>
> **Absolutely forbidden, and an ad containing any of these is a failed answer:**
> - Any testimonial, quote, review, star rating or named customer.
> - "Trusted by N businesses", any customer count, "join thousands".
> - Any performance claim or number not in the facts above — no "3× your leads",
>   no "40% more enquiries", no "ranked #1", no revenue or traffic figures.
> - Any guarantee, "risk-free", or promise of a specific outcome.
> - Before-and-after framing, or implying a result the reader will get.
> - Any invented company name, registration number, address or award.
> - Urgency that is not real: no fake deadlines, no "only 3 spots left".
> - The words "revolutionary", "game-changer", "unlock", "supercharge",
>   "effortlessly", "seamlessly", or "in just minutes".
>
> **Format, per variant.**
> - **Primary text**: 50–90 words. The first sentence must stand alone and land
>   before Facebook truncates at roughly 125 characters — assume everything after
>   that is unread by half the audience. Short sentences. Second person. No emoji
>   except at most one, and only if it genuinely helps scanning.
> - **Headline**: maximum 40 characters, ideally under 30.
> - **Description**: maximum 30 characters.
> - **Call to action button**: choose from Learn More, Get Offer, Sign Up, Get
>   Quote, and say which.
>
> **Structure each variant as:** an opening line naming a problem the reader
> recognises in their own week → one sentence on what the platform does about it,
> as mechanism not benefit → the free audit and exactly what they get from it →
> the action. No preamble, no "Are you a small business owner struggling to…".
>
> **The six variants must attack different angles, one each:**
> 1. **The unchased quote** — work already won and lost to silence.
> 2. **Thirty-two checks** — their own website, three problems named free.
> 3. **You keep control** — it writes, they approve, there is a stop button.
> 4. **The price against the alternative** — what an agency charges per month
>    versus £19, without inventing an agency's price if you cannot support it.
> 5. **Not for tech startups** — written for someone who works in a van.
> 6. **The honest opener** — lead with "you have never heard of us", and answer it
>    with the free audit. This one should be the plainest of the six.
>
> **How to judge your own output before you give it to me.** For each variant,
> state in one line what a reader has to believe for it to work, and whether the
> facts above support that belief. If they do not, rewrite it. Then flag any
> sentence a Meta reviewer or the ASA could ask you to substantiate, and either
> make it substantiable from the facts or cut it.

---

## Running them

- Two sizes per image: **1080×1080** for feed, **1080×1920** built deliberately
  for Stories and Reels. Do not let Meta crop the square — it crops through type.
- Check every image shrunk to **120 pixels wide**. Unreadable there is
  unreadable in the feed.
- One image per ad, six ads, same ad set, **Traffic** objective to `/audit` — the
  reasoning for Traffic over Awareness is §0 of `FACEBOOK-LAUNCH-CAMPAIGN.docx`.
- Build the five custom audiences **before** the ads go live (§9 of the same
  document). They cannot be backfilled.
- If you generate anything showing the product's own screen, **screenshot the
  real one**. An image model asked to draw a dashboard invents numbers, and an
  invented number in a paid advert is the one mistake here that is genuinely
  expensive.
