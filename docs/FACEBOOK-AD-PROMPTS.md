# Facebook ads — seven image prompts and one copy prompt

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

Each of the first five attacks a **different** buying trigger, and they are not
five versions of one idea — run them against each other and let the audience tell
you which lever moves your market.

**Prompts 7 and 8 are for a WARM audience and will waste money on a cold one.**
They are retargeting: for somebody who ran an audit or looked at the prices and
did not start, the question is no longer "who are you" but "is there enough here"
and "will it do something stupid as me". 1–5 answer the first question; 7 and 8
answer the second two, and both are built only from counts that exist in the
code.

| # | Trigger | Why it moves money |
|---|---|---|
| 1 | Loss already incurred | Loss aversion beats gain. For trades, the unchased quote is a real, remembered, specific loss. |
| 2 | Specific personal evidence | "Your site, 31 checks, 3 free" is falsifiable and about *them*. Generic benefit claims are not. |
| 3 | Control / risk removal | The top objection to AI marketing from this audience is "it will say something stupid as me". |
| 4 | Price anchored against what it replaces | £19 is not cheap in the abstract. Against twelve named tools they already pay for, the reader does the arithmetic themselves — and their number is more convincing than one we picked. |
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

## Prompt 2 — Thirty-one checks (specific personal evidence)

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

**Why it works.** Thirty-one is a strange, specific number, and strange specific
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

## Prompt 4 — Nineteen pounds, against what it replaces (price anchoring)

**This one changed, and the reason is the honest version of the trigger.** The
first draft struck through **£800** as a stand-in agency retainer. That is a
comparative claim: Meta's review checks them and the ASA acts on them, and it was
a number nobody here could defend. The anchor is now the **list of tools the
platform replaces**, which is read out of `src/shared/included-tools.ts` — twelve
of them, nine working with no keys at all. It is sourced, it needs nothing
substantiated, and it is *more* persuasive than a number we picked: the reader
prices their own stack in their head, and their figure is always more convincing
than ours.

> Pure typographic composition, no photograph, no illustration. Off-white paper
> background (#F7F6F3) with a faint letterpress tooth. At the optical top, set
> small, in lowercase, in a muted warm grey: **"replaces"**. Beneath it, a
> single tight column of twelve short lines in a condensed grotesque at modest
> size, solid near-black, each line a tool category, generously leaded, left
> aligned, nothing bulleted and nothing numbered:
> **"a screen recorder"**, **"a video clipper"**, **"an email platform"**,
> **"an ad-creative design tool"**, **"a social scheduler"**,
> **"a client-approval tool"**, **"an A/B testing tool"**,
> **"an ad-spend monitor"**, **"a website audit tool"**,
> **"a reporting dashboard"**, **"an audit log"**,
> **"a workflow automator"**.
> Then a single thin hairline rule, full width. Beneath the rule, enormous and
> confident in solid near-black, roughly four times the height of one list line:
> **"£19"**. Immediately beneath it, small and quiet, lowercase:
> **"a month"**. Enormous margins. The whole block sits slightly left of optical
> centre. **"marketwaros.com"** small at the very bottom edge.
>
> Negative: no struck-through prices, no "was/now", no percentage-off badges, no
> competitor names, no logos of other products, no currency symbols other than £,
> no coins, no wallets, no credit cards, no starbursts, no drop shadows, no
> gradients, no photographs of any kind, no icons beside the list lines.
>
> Render at 1080×1080 and 1080×1920. In the vertical, split the list into two
> columns of six beneath the word "replaces" so the £19 still sits on the lower
> third. This advert lives or dies on whether the typography looks assured, so
> give it the most attention and the least decoration.

**Nothing in this one needs defending.** Every line is a category from
`included-tools.ts` and £19 is `subscription.ts`. `npm run ads:verify` checks the
count against the file, so if a tool is added or removed the advert stops matching
and the build says so.

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

## Prompt 7 — The scope (for people who already know who you are)

**Why this one is separate, and why it is NOT for cold traffic.** Prompts 1–5 all
drive to `/audit`, which is right for a stranger: small, specific, about them.
This one is the opposite and is wasted on a cold audience — **run it as
retargeting**, to people who ran an audit or visited `/choose-plan` and did not
start. They already know what the product is; what they have not grasped is how
much of it there is, and scope is the one impressive thing here that is a FACT
rather than a result claim. Nothing below is a testimonial, a customer count or
an outcome — it is a count of what exists in the code.

> Flat vector infographic, no photograph, no 3D, no isometric. Deep ink
> background (#0B1020). A single dense grid of thirty-nine small identical
> rounded-square tiles, nine across, arranged with generous even gutters and
> perfect alignment — the grid itself is the image. Each tile is a flat muted
> slate with a 1px lighter edge; **four** tiles, scattered not clustered, are a
> confident emerald (#10B981). No icons inside the tiles, no labels, no numbers.
> Above the grid, small, in lowercase letterspaced grey: **"what you get"**.
> Below the grid, large and solid white in a tight grotesque:
> **"39 agents. One subscription."** Beneath that, small and quiet in grey:
> **"nine of the twelve tools work before you add a single key."** A hairline
> rule at the very bottom with **"marketwaros.com"** small beneath it.
>
> Negative: no human faces, no robots, no brains, no circuit-board motifs, no
> glowing nodes, no network webs, no gradients behind the grid, no drop shadows,
> no logos other than the wordmark, no percentage figures, no charts.
>
> Render at 1080×1080 and 1080×1350. The grid must look deliberately counted, not
> decorative — if a viewer cannot count the tiles, the advert has failed.

**Every number is read from the code**, which is why this is safe to put on a
paid advert: `AGENT_LIST.length` is 39, `INCLUDED_TOOLS.length` is 12 and nine of
them carry `keyless: true`. `npm run ads:verify` holds the doc to the files, so
if an agent is added the advert stops matching and the build says so.

---

## Prompt 8 — The brake, close up (retargeting on the real objection)

**The objection this answers is the one that actually stops this audience**, and
Prompt 3 only gestures at it. "It will send something stupid as me" is not a
price objection and no discount answers it. For a warm audience the answer is
mechanical and checkable: **five separate switches**, and only drafting steps run
unattended.

> Photorealistic macro photograph, 100mm lens at f/4, single hard light source
> from the upper left, deep falloff into near-black. A human thumb and forefinger
> resting — not pressing — on one of five identical small industrial toggle
> switches set into a brushed-steel panel, shot from a low three-quarter angle so
> the row recedes. Four switches are plainly in the up position; the one under the
> fingers is mid-throw. No labels are legible on the panel — the metal is bare and
> slightly scuffed from use. Shallow depth of field: the fingers and the nearest
> two switches are sharp, the rest falls away. Cool steel tones, one warm
> highlight on the knuckle. The composition leaves the entire right third dark and
> empty for text.
>
> Overlay text, right third, set in a tight grotesque, solid white, left aligned:
> large — **"Five switches."** Beneath it, medium —
> **"Sending. Publishing. Overnight work. Spending. Payouts."** Beneath that,
> small and grey — **"Only drafting runs while you are not there."**
>
> Negative: no faces, no full hands, no laptops, no phones, no screens, no red
> emergency-stop mushroom buttons, no warning triangles, no sparks, no text on the
> metal panel itself, no logos other than a small wordmark bottom-left.
>
> Render at 1080×1350 and 1080×1920. Five switches exactly — the number is the
> claim, and four or six makes the advert false.

**Five is `LANES` in `src/backend/emergency-stop.ts`**: send, publish,
autonomous, spend, payout. The second line names them in that order. The third
line is the autonomy contract that is already on `/how-it-works` and in the
home-page FAQ, so the advert is promising something the site then confirms.

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
> 2. **Thirty-one checks** — their own website, three problems named free.
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
