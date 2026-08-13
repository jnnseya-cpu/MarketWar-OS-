// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR OS — THE ACQUISITION RUN.
//
// The owner's report: three businesses, no improvement in what they sell, not
// one customer acquired. Before adding a fifty-fifth engine it is worth asking
// what this platform could actually SAY about that, and the answer was nothing.
//
// `prospecting.ts` builds an ICP, produces prospects and writes a sequence — and
// then stops. Nothing is stored, no attempt is recorded, no outcome comes back.
// So the platform could not answer the first question anybody would ask a
// business with no customers: HOW MANY PEOPLE DID YOU ASK?
//
// Without that number, "no customers" has no cause. With it, the cause is
// usually obvious and almost never the one that gets blamed:
//
//   0 contacted        → it is not the product, the price, the site or the copy.
//                        Nothing has been offered to anyone.
//   contacted, no reply→ the list or the first line.
//   replies, no meeting→ the offer is not worth an hour of their time.
//   meetings, no sale  → the price, the proof, or the close.
//   sales              → stop redesigning and do more of exactly that.
//
// This module is that count. It is deliberately not clever: it stores named
// prospects, the attempts made against them, and what came back. Everything it
// reports is arithmetic over those records, and when there are none it says so
// rather than producing a dashboard of zeros that looks like a system working.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type Stage = "identified" | "contacted" | "replied" | "meeting" | "proposal" | "won" | "lost";

export const STAGES: { id: Stage; label: string; what: string }[] = [
  { id: "identified", label: "Identified", what: "A named business or person we could contact. Not a lead — a name." },
  { id: "contacted", label: "Contacted", what: "A message actually sent, by a person, on a date." },
  { id: "replied", label: "Replied", what: "They answered. Any answer, including no." },
  { id: "meeting", label: "In conversation", what: "A call, a demo, a thread that is going somewhere." },
  { id: "proposal", label: "Proposal out", what: "They have been told what it costs." },
  { id: "won", label: "Paid", what: "Money arrived. Nothing else counts as won." },
  { id: "lost", label: "Closed lost", what: "They said no, or went quiet after being asked twice." },
];

export type Channel = "email" | "linkedin" | "whatsapp" | "phone" | "in_person" | "group_post" | "referral" | "inbound";

export type Attempt = {
  at: string;
  channel: Channel;
  /** What was actually sent. Kept so a failing message can be recognised as one. */
  message: string;
  by: string;
};

export type Prospect = {
  id: string;
  brandId: string;
  /** Which of the three businesses this is being sold FOR. */
  targetId: string;
  name: string;
  contact?: string;
  where?: string;
  /** How we came to have this name — a real source, not "the system generated it". */
  source: string;
  stage: Stage;
  attempts: Attempt[];
  /** Their words, not ours. The most valuable field in the module. */
  lastReply?: string;
  valueGbp?: number;
  lostReason?: string;
  createdAt: string;
  updatedAt: string;
};

const memProspects = new Map<string, Prospect>();
const useDb = () => Boolean(adminConfigured && adminDb);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

/** Brand hashed into the key — a document keyed by a bare name is one tenant writing over another. */
export const prospectId = (brandId: string, name: string): string =>
  `pr_${hid(`${brandId}::${name.trim().toLowerCase()}`)}`;

export type SaveInput = {
  brandId: string; targetId: string; name: string;
  contact?: string; where?: string; source: string;
  nowISO: string;
};

export async function addProspect(input: SaveInput): Promise<{ ok: true; prospect: Prospect } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A prospect needs a name. 'Some plumbers in Manchester' is not somebody you can send a message to, and it is the difference between a pipeline and a wish." };
  if (!input.source.trim()) return { ok: false, error: "Where did this name come from? A list with no provenance cannot be worked twice, and under UK GDPR it cannot be contacted at all." };

  const id = prospectId(input.brandId, name);
  const existing = await getProspect(id);
  if (existing) return { ok: true, prospect: existing };

  const p: Prospect = {
    id, brandId: input.brandId, targetId: input.targetId, name,
    contact: input.contact?.trim() || undefined,
    where: input.where?.trim() || undefined,
    source: input.source.trim(),
    stage: "identified",
    attempts: [],
    createdAt: input.nowISO, updatedAt: input.nowISO,
  };
  await save(p);
  return { ok: true, prospect: p };
}

/**
 * Record a message that was actually sent.
 *
 * This is the only way to reach `contacted`, and it requires the message text.
 * A pipeline where things move stage without anybody having said anything is
 * the exact thing that produces a full-looking board and no customers.
 */
export async function recordAttempt(input: { id: string; channel: Channel; message: string; by: string; nowISO: string }): Promise<{ ok: true; prospect: Prospect } | { ok: false; error: string }> {
  const p = await getProspect(input.id);
  if (!p) return { ok: false, error: "No such prospect." };
  const message = (input.message || "").trim();
  if (message.length < 20) {
    return { ok: false, error: "Paste what you actually sent. A record that says a message went out, without the message, cannot tell you later whether the message was the problem — and it usually is." };
  }
  p.attempts.push({ at: input.nowISO, channel: input.channel, message: message.slice(0, 4_000), by: input.by || "owner" });
  if (p.stage === "identified") p.stage = "contacted";
  p.updatedAt = input.nowISO;
  await save(p);
  return { ok: true, prospect: p };
}

/** Move a prospect, with what they said. Advancing without evidence is refused. */
export async function setStage(input: { id: string; stage: Stage; reply?: string; valueGbp?: number; lostReason?: string; nowISO: string }): Promise<{ ok: true; prospect: Prospect } | { ok: false; error: string }> {
  const p = await getProspect(input.id);
  if (!p) return { ok: false, error: "No such prospect." };
  if (!STAGES.some((s) => s.id === input.stage)) return { ok: false, error: "Unknown stage." };

  // You cannot have a reply from somebody you never wrote to. This is not
  // pedantry: the whole diagnostic value of the run comes from the ratio
  // between attempts and answers, and a stage moved by optimism destroys it.
  if (["replied", "meeting", "proposal", "won"].includes(input.stage) && p.attempts.length === 0) {
    return { ok: false, error: "Nothing has been sent to this prospect yet, so there is nothing for them to have replied to. Record the message first." };
  }
  if (input.stage === "replied" && !(input.reply || "").trim()) {
    return { ok: false, error: "What did they say? Their words are the most useful thing this module will ever hold — including when the answer is no." };
  }
  if (input.stage === "won" && !(input.valueGbp && input.valueGbp > 0)) {
    return { ok: false, error: "A win needs the amount that was actually paid. Money arrived or it did not; there is no 'won in principle'." };
  }
  if (input.stage === "lost" && !(input.lostReason || "").trim()) {
    return { ok: false, error: "Why was it lost? Ten losses with reasons is a product roadmap. Ten losses without is a bad week." };
  }

  p.stage = input.stage;
  if (input.reply) p.lastReply = input.reply.slice(0, 2_000);
  if (input.valueGbp) p.valueGbp = Math.round(input.valueGbp * 100) / 100;
  if (input.lostReason) p.lostReason = input.lostReason.slice(0, 500);
  p.updatedAt = input.nowISO;
  await save(p);
  return { ok: true, prospect: p };
}

// ---------------------------------------------------------------------------
// The count
// ---------------------------------------------------------------------------
export type Funnel = {
  identified: number;
  contacted: number;
  replied: number;
  meeting: number;
  proposal: number;
  won: number;
  lost: number;
  attempts: number;
  revenueGbp: number;
  /** Everyone who ever reached a stage, not just those sitting in it now. */
  reached: Record<Stage, number>;
};

const ORDER: Stage[] = ["identified", "contacted", "replied", "meeting", "proposal", "won"];

export function funnelFrom(prospects: Prospect[]): Funnel {
  const reached = { identified: 0, contacted: 0, replied: 0, meeting: 0, proposal: 0, won: 0, lost: 0 } as Record<Stage, number>;
  for (const p of prospects) {
    // A prospect that reached "meeting" also reached "contacted" — counting only
    // the current stage would show one contact and one meeting from the same
    // person and make the conversion rate meaningless.
    const idx = ORDER.indexOf(p.stage);
    if (idx >= 0) for (let i = 0; i <= idx; i++) reached[ORDER[i]] += 1;
    else { reached.identified += 1; reached.lost += 1; if (p.attempts.length) reached.contacted += 1; }
  }
  return {
    identified: reached.identified, contacted: reached.contacted, replied: reached.replied,
    meeting: reached.meeting, proposal: reached.proposal, won: reached.won,
    lost: prospects.filter((p) => p.stage === "lost").length,
    attempts: prospects.reduce((n, p) => n + p.attempts.length, 0),
    revenueGbp: Math.round(prospects.reduce((n, p) => n + (p.stage === "won" ? p.valueGbp || 0 : 0), 0) * 100) / 100,
    reached,
  };
}

export type Diagnosis = {
  bottleneck: "nobody_asked" | "too_early" | "list_or_message" | "offer" | "close" | "working";
  headline: string;
  because: string;
  doNext: string[];
  /** The arithmetic behind it, so the conclusion can be checked rather than trusted. */
  evidence: string;
};

/**
 * What is actually wrong, from the counts alone.
 *
 * The first branch is the one that matters and the one nobody wants: with zero
 * messages sent, no amount of product work is the answer, and this module says
 * so in the same words every time rather than softening it into a suggestion.
 */
export function diagnose(f: Funnel, engineCount = 54): Diagnosis {
  if (f.attempts === 0) {
    return {
      bottleneck: "nobody_asked",
      headline: "Nothing has been sold because nothing has been offered to anybody.",
      because: `${engineCount} engines and 0 messages sent. There is no version of this where the product, the price, the site or the copy is the reason — none of them has been in front of a buyer. This is the only diagnosis on the list that cannot be fixed by building.`,
      doNext: [
        "Write down ten businesses you could name to a friend. Not a category — ten names.",
        "Send one message to each, today, from your own inbox or phone. No sequence, no automation, no sending domain.",
        "Record each one here with what you actually sent. Ten records is enough to see whether the message works.",
      ],
      evidence: `attempts=0, identified=${f.identified}`,
    };
  }
  if (f.contacted < 20) {
    return {
      bottleneck: "too_early",
      headline: `${f.contacted} ${f.contacted === 1 ? "person" : "people"} contacted. Too few to conclude anything, including that it is not working.`,
      because: "Reply rates on cold outreach are single digits on a good day, so a sample this small tells you about luck rather than about the offer. The instinct after five silent messages is to rewrite the product; the correct move is to send the next fifteen.",
      doNext: [
        `Get to 20 contacted before changing anything — that is ${20 - f.contacted} more.`,
        "Keep the message identical across all of them, or you will not know which one worked.",
        "Record the exact text each time, including the ones you think are obviously fine.",
      ],
      evidence: `contacted=${f.contacted}, replied=${f.replied}, attempts=${f.attempts}`,
    };
  }
  if (f.replied === 0) {
    return {
      bottleneck: "list_or_message",
      headline: `${f.contacted} contacted, 0 replies. It is the list or the first line — not the product.`,
      because: "Nobody has read far enough to have an opinion about what you sell. Either these are the wrong people, or the opening does not survive its first sentence. Both are cheap to fix and neither requires a single line of code.",
      doNext: [
        "Read your last ten messages back as if you received them at 7pm after a long day.",
        "Change ONE thing — the list or the opening — and send twenty more. Changing both teaches you nothing.",
        "If the list is right, make the first line about their situation rather than your product.",
      ],
      evidence: `contacted=${f.contacted}, replied=0`,
    };
  }
  if (f.meeting === 0) {
    return {
      bottleneck: "offer",
      headline: `${f.replied} replies, no conversations. They answered and did not want the next step.`,
      because: "Getting a reply means the list and the opening work. Not converting one into a conversation means what you offered next is not worth an hour of their time — usually because it asks for the hour rather than giving something before it.",
      doNext: [
        "Make the next step smaller: something you do for them without a meeting.",
        "Read the replies you did get. They are already telling you what they wanted instead.",
        "Ask the last three who went quiet what would have made it a yes. Some will answer.",
      ],
      evidence: `replied=${f.replied}, meeting=0`,
    };
  }
  if (f.won === 0) {
    return {
      bottleneck: "close",
      headline: `${f.meeting} conversations, no sale yet. The gap is price, proof or the ask.`,
      because: "People are spending time on this, which means the problem is real and you are credible enough to talk to. What is missing is a reason to decide now, evidence it works for someone like them, or somebody actually asking for the money.",
      doNext: [
        "Go back to every conversation and ask for the sale explicitly, with a number and a date.",
        `Record every loss with its reason — you have ${f.lost} so far and the pattern in them is the answer.`,
        "Offer to do the first one for free in exchange for permission to name them. The first customer buys the second.",
      ],
      evidence: `meeting=${f.meeting}, proposal=${f.proposal}, won=0, lost=${f.lost}`,
    };
  }
  return {
    bottleneck: "working",
    headline: `${f.won} paid, £${f.revenueGbp.toLocaleString()}. Stop redesigning and do more of exactly this.`,
    because: `${f.contacted} contacted produced ${f.won} paying. That ratio is the only number in the business that matters right now, and the way to improve it is to run it again at volume — not to add a feature.`,
    doNext: [
      "Send the same message to the next fifty of the same kind of business.",
      "Ask each customer who else has this problem. A referral converts at a multiple of anything cold.",
      "Only now is it worth automating any of it.",
    ],
    evidence: `contacted=${f.contacted}, won=${f.won}, revenue=£${f.revenueGbp}`,
  };
}

/** Reply rate and the rest — counted, and null rather than zero when undefined. */
export function rates(f: Funnel): { replyPct: number | null; meetingPct: number | null; winPct: number | null; note: string } {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    replyPct: pct(f.replied, f.contacted),
    meetingPct: pct(f.meeting, f.replied),
    winPct: pct(f.won, f.contacted),
    // A rate over a handful of attempts is noise wearing a percentage sign.
    note: f.contacted < 20
      ? `These percentages are over ${f.contacted} contacts, which is too few to mean anything. They are shown so the count is visible, not so a decision can be made on them.`
      : `Over ${f.contacted} contacts. Cold outreach that replies above 10% is working; below 2% is the list or the opening.`,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
async function save(p: Prospect): Promise<void> {
  if (useDb()) await adminDb!.collection("acquisition_prospects").doc(p.id).set(p, { merge: true });
  else memProspects.set(p.id, p);
}

export async function getProspect(id: string): Promise<Prospect | null> {
  if (useDb()) { const s = await adminDb!.collection("acquisition_prospects").doc(id).get(); return s.exists ? (s.data() as Prospect) : null; }
  return memProspects.get(id) ?? null;
}

export async function listProspects(brandId: string, targetId?: string): Promise<Prospect[]> {
  let all: Prospect[];
  if (useDb()) {
    const q = await adminDb!.collection("acquisition_prospects").where("brandId", "==", brandId).limit(1000).get();
    all = q.docs.map((d) => d.data() as Prospect);
  } else {
    all = [...memProspects.values()].filter((p) => p.brandId === brandId);
  }
  const scoped = targetId ? all.filter((p) => p.targetId === targetId) : all;
  return scoped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function __resetAcquisition(): void { memProspects.clear(); }

export const ACQUISITION_DOCTRINE = [
  "The first question to ask a business with no customers is how many people it asked. This platform could not answer that, which is why it had nothing useful to say about having no customers.",
  "A prospect is a name. A category is not a prospect, and a generated list nobody sent anything to is not a pipeline.",
  "A stage only moves on evidence: contacted needs the message that was sent, replied needs their words, won needs the amount that arrived. A board that fills up on optimism is worse than an empty one, because it looks like progress.",
  "Every loss carries its reason. Ten losses with reasons is a product roadmap; ten losses without is a bad week.",
  "With nothing sent, the diagnosis is never the product. That is the one conclusion this module will not soften, because softening it is how another month goes into building.",
];
