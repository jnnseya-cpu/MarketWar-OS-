"use client";

// M-34 AI Transactional Email Engine — Email Command Center.
// Spec: docs/ai-os/11-email-engine.md. The hygiene pipeline + sending
// facade are live in src/backend/email.ts (/api/email); provider pool,
// webhook feedback loops + warm-up automation activate once connected.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  Filter,
  Flame,
  Inbox,
  ListChecks,
  Loader2,
  MailCheck,
  Rocket,
  Send,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { AreaChart, DonutChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import EmailPreview from "@/components/EmailPreview";
import EmailImprove, { type ImproveReportView } from "@/components/EmailImprove";
import { authedFetch } from "@/frontend/api-client";
import { emailContext } from "@/shared/agent-context";
import { useAuthUser } from "@/frontend/use-auth-user";
import { applyDefaults, emailIdentityDefaults, fromAddressWarning, type SendingDomainLike, type SenderFields } from "@/shared/email-identity";
import { type GroupSummary } from "@/shared/contact-groups";

// LIST HEALTH, COUNTED (/api/email-metrics).
//
// This block used to render a "Projected inbox rate" of 96.8%, a projected
// bounce rate and a 14-day delivery projection, all computed from a hash of the
// brand's NAME. The real split was on this same page, twenty lines down, in the
// send preview — and disagreed with it threefold. Every figure here is now a
// count of the brand's actual addresses through the send's own hygiene verdict.
//
// There is deliberately NO projected inbox rate. Nothing that reads a contact
// list can know where a message lands; the platform measures that elsewhere and
// this panel says where instead of inventing a number.
type Posture = {
  business: string;
  listSize: number;
  withoutEmail: number;
  health: {
    total: number;
    sendable: number;
    refused: number;
    /** NULL on an empty list — never 0 and never 100. */
    healthPct: number | null;
    composition: { label: string; count: number; kind: "healthy" | "filtered" }[];
    refusedBy: Partial<Record<"no_consent" | "invalid" | "disposable" | "suppressed" | "role", number>>;
    verdict: string;
  };
  series: { days: { date: string; label: string; sent: number; failed: number }[]; empty: boolean; note: string };
  placement: { measured: false; where: string };
  isEstimate: false;
};

const PIPELINE = [
  { icon: ListChecks, title: "1 · Syntax & domain", desc: "RFC-valid address, real domain with MX records — dead addresses never reach a provider." },
  { icon: Filter, title: "2 · Disposable & role filter", desc: "Burner domains (spam-trap risk) blocked; role addresses (info@, sales@) excluded from marketing sends by default." },
  { icon: ShieldCheck, title: "3 · Consent & suppression", desc: "No granted consent = technically unsendable. Hard bounces, complaints and unsubs live on the suppression ledger — never re-sent, ever." },
  { icon: Thermometer, title: "4 · Reputation governor", desc: "Warm-up ramps, per-domain throttles (Gmail/Outlook/Yahoo) and complaint monitoring keep the sending reputation that keeps you in the inbox." },
];

const CAPABILITIES = [
  { icon: Inbox, title: "Inbox placement, earned", desc: "SPF + DKIM + DMARC (+ BIMI) on an isolated sending subdomain, engagement-first warm-up, RFC 8058 one-click unsubscribe — the mechanics that actually beat the spam folder." },
  // "CAPACITY IS UNLIMITED" WAS ON THIS CARD, above a panel on the same screen
  // reading "warm-up day 1 · today's safe limit 50 emails". Both cannot be true,
  // and the one the reader acts on is the governor. What is actually unbounded
  // is the infrastructure; what decides how much mail leaves today is
  // reputation, and saying so is the more useful claim as well as the true one.
  { icon: Flame, title: "Scale governed by reputation", desc: "Your own sending infrastructure with automatic failover — no third-party email provider. The hardware is not the limit; the warm-up ramp is, and today's limit is on the send panel below. It rises as clean sends land." },
  // "ZERO-BOUNCE DOCTRINE" against a "< 0.5%" target in its own second sentence.
  // A doctrine named after a number the same card declines to promise reads as
  // a guarantee to anyone who stops at the title.
  { icon: MailCheck, title: "Bounces prevented, then never repeated", desc: "Bad addresses are refused before a send is attempted (hygiene pipeline), and any address that does hard-fail goes on the suppression ledger and is never mailed again. The bar to stay under is Gmail and Yahoo's: bounces below 0.5%, complaints below 0.1%." },
];

// A rate is graded on the server against published operating lines; the tile
// only colours it. "unknown" means the sample is too small to judge, or the
// report has just called the number unreliable — either way it stays white
// rather than green, because an unjudged number is not a good one.
const GRADE_TONE: Record<"good" | "fair" | "poor" | "unknown", "good" | "warn" | "bad" | "neutral"> = {
  good: "good", fair: "warn", poor: "bad", unknown: "neutral",
};

export default function EmailPage() {
  const { activeBrand } = useActiveBrand();
  const { user } = useAuthUser();
  const [posture, setPosture] = useState<Posture | null>(null);
  const [raw, setRaw] = useState(
    "marcus@gmail.com\nleah.simmons@outlook.com\ninfo@somecompany.co.uk\nbad-address@@nowhere\npromo@mailinator.com\namara.okafor@yahoo.com"
  );
  const [result, setResult] = useState<{
    total: number;
    sendableCount: number;
    filteredCount: number;
    filtered: { email: string; reason: string | null }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Real campaign send to the brand's consented vault.
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // Attachments (documents/images). Files are base64'd in the browser and sent
  // with the campaign; the server re-validates size/type before any send.
  const [files, setFiles] = useState<{ filename: string; contentBase64: string; contentType: string; size: number }[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftNotes, setDraftNotes] = useState<string[]>([]);
  const [campaignStatus, setCampaignStatus] = useState(""); // optional: target a prospect status e.g. "contacted"
  // NAMED GROUPS — send to a list instead of the whole vault. Empty = everyone,
  // which is exactly what every campaign did before groups existed.
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  const [fromEmail, setFromEmail] = useState(""); // send AS this address (your authenticated domain)
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState(""); // where replies land (your real inbox)
  // This brand's sending domains. Needed to decide whether a From address can
  // be prefilled at all — an unauthenticated one lands in spam, so a field that
  // LOOKS filled in would be worse than an empty one.
  const [domains, setDomains] = useState<SendingDomainLike[]>([]);
  const [fromNote, setFromNote] = useState("");
  // Where a reply actually goes. Checked with a real MX lookup, because the
  // whole defect was that nobody — including us — asked the question.
  const [replyCheck, setReplyCheck] = useState<{ reachable: "yes" | "no" | "unknown"; intoInbox: boolean; note: string; brandReplyAddress?: string } | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string }[]>([]);
  const [templateId, setTemplateId] = useState(""); // when set, send this saved template (personalised per contact)
  // openRate/clickRate are NULLABLE on purpose: a rate the ledger cannot support
  // is withheld rather than invented. See backend/email-events.ts.
  const [stats, setStats] = useState<{ sent: number; open: number; click: number; bounce: number; complaint: number; unsubscribe: number; sentUnique?: number; openRate: number | null; clickRate: number | null; ratesNote?: string; suppressed: number; warmup?: { day: number; dailyCap: number; sentToday: number; remaining: number; scheduleCap?: number; earnedCap?: number; governedBy?: "schedule" | "reputation"; verdict?: "grow" | "hold" | "rollback" | "stop"; reason?: string }; improve?: ImproveReportView } | null>(null);
  // The preview's verdict, so the Send buttons and the preview cannot disagree
  // about whether this campaign is safe to send.
  const [previewBlockers, setPreviewBlockers] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; attempted: number; failed: number; sendable: number; consented: number; remaining: number; mode: string; note: string; authenticatedAs?: string; error?: string } | null>(null);
  // Live vs demo: does the server actually have an email PROVIDER wired? If not,
  // sends are simulated and nothing reaches an inbox — say so BEFORE they send.
  const [engineMode, setEngineMode] = useState<"live" | "demo" | null>(null);
  const [engineInfo, setEngineInfo] = useState<{ provider?: string; from?: string }>({});
  useEffect(() => {
    let off = false;
    authedFetch("/api/email").then((r) => r.json()).then((d) => {
      if (off) return;
      setEngineMode(d?.mode === "live" ? "live" : "demo");
      setEngineInfo({ provider: d?.provider, from: d?.from });
    }).catch(() => { if (!off) setEngineMode(null); });
    return () => { off = true; };
  }, []);

  // NOTHING ABOUT THE PREVIOUS BRAND SURVIVES THE SWITCH.
  //
  // Every panel below is filled by its own request, and each one takes a
  // different amount of time to come back. Between the click and the last
  // response the screen renders the NEW brand's name over the OLD brand's
  // numbers — a send report reading "250 failed of 5,210 sendable" under a vault
  // that has 40 contacts in it, engagement rates belonging to a different
  // company, a reply check for an address no longer in the box.
  //
  // Cleared synchronously on the id change, so the honest empty state is what
  // shows while the new brand loads. Declared BEFORE the loaders so React runs
  // it first and a fast response is never wiped by this.
  useEffect(() => {
    setStats(null);
    setSendResult(null);
    setReplyCheck(null);
    setTemplates([]);
    setTemplateId("");
    setDomains([]);
    setFromNote("");
    setPreviewBlockers(0);
    setDraftNotes([]);
    setGroups([]);
    setPickedGroups([]);
  }, [activeBrand?.id]);

  // The brand's own groups, with counts. Read-only; the vault screen is where
  // they are created and assigned.
  useEffect(() => {
    if (!activeBrand) { setGroups([]); return; }
    let off = false;
    authedFetch("/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "groups", brandId: activeBrand.id }),
    }).then((r) => r.json())
      .then((d) => { if (!off) setGroups(Array.isArray(d.groups) ? d.groups : []); })
      .catch(() => { if (!off) setGroups([]); });
    return () => { off = true; };
  }, [activeBrand]);

  // Which brand the screen is on RIGHT NOW, for responses that arrive late. A
  // request started for one brand must never write into another one's panel.
  const brandNow = useRef<string | undefined>(activeBrand?.id);
  brandNow.current = activeBrand?.id;

  // Load the brand's saved templates for the picker.
  useEffect(() => {
    if (!activeBrand) { setTemplates([]); return; }
    let off = false;
    authedFetch(`/api/email-templates?brandId=${encodeURIComponent(activeBrand.id)}`)
      .then((r) => r.json()).then((d) => { if (!off) setTemplates(Array.isArray(d.templates) ? d.templates : []); })
      .catch(() => { if (!off) setTemplates([]); });
    return () => { off = true; };
  }, [activeBrand]);

  // Load real engagement stats (opens/clicks/bounces) from the delivery-event
  // ledger. Refreshes after a send.
  const loadStats = useCallback(() => {
    if (!activeBrand) { setStats(null); return; }
    // Captured, then checked on arrival: this is also called after a send, so a
    // plain effect-cleanup flag would not cover every path into it.
    const forBrand = activeBrand.id;
    authedFetch(`/api/email-events?brandId=${encodeURIComponent(forBrand)}`)
      .then((r) => r.json()).then((d) => { if (brandNow.current === forBrand) setStats(d && typeof d.sent === "number" ? d : null); })
      .catch(() => { if (brandNow.current === forBrand) setStats(null); });
  }, [activeBrand]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Re-checked whenever the sender fields settle, so the answer is about the
  // campaign the customer is actually about to send.
  useEffect(() => {
    if (!activeBrand) { setReplyCheck(null); return; }
    let off = false;
    const t = setTimeout(() => {
      authedFetch("/api/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply-check", brandId: activeBrand.id, replyTo, fromEmail }),
      }).then((r) => r.json()).then((d) => { if (!off && d && d.reachable) setReplyCheck(d); })
        .catch(() => { if (!off) setReplyCheck(null); });
    }, 600);
    return () => { off = true; clearTimeout(t); };
  }, [activeBrand, replyTo, fromEmail]);

  // What this effect last PREFILLED, so a brand switch can tell its own
  // suggestion apart from something the customer typed. See applyDefaults.
  const lastPrefill = useRef<SenderFields | null>(null);
  // A live mirror of the three sender fields. The effect below reads them AFTER
  // an await, and a closure would hand it the values from the render that
  // started the fetch — i.e. the previous brand's, if the switch was quick.
  const senderFields = useRef<SenderFields>({ fromName: "", fromEmail: "", replyTo: "" });
  useEffect(() => { senderFields.current = { fromName, fromEmail, replyTo }; }, [fromName, fromEmail, replyTo]);

  // Fill in who this is from — the platform already knows all three.
  //
  // A field the customer typed is theirs and survives a brand switch. A field
  // still holding what WE suggested for the brand they just left is replaced,
  // because it is about a different company: leaving it meant the From name read
  // "VeryX" and the From address sat on VeryX's verified domain while everything
  // else on the page — the header, the vault, the recipients — was AxionOS.
  useEffect(() => {
    if (!activeBrand) return;
    let off = false;
    (async () => {
      let list: SendingDomainLike[] = [];
      try {
        const r = await authedFetch(`/api/sending-domains?brandId=${encodeURIComponent(activeBrand.id)}`);
        const d = await r.json();
        list = Array.isArray(d?.domains) ? d.domains : [];
      } catch { /* no domains is a normal state, not an error to show */ }
      if (off) return;
      setDomains(list);
      const defaults = emailIdentityDefaults({
        brandName: activeBrand.name,
        userEmail: user?.email ?? "",
        domains: list,
        platformFrom: engineInfo.from ?? "",
      });
      setFromNote(defaults.fromNote);
      const next = applyDefaults(senderFields.current, defaults, lastPrefill.current);
      lastPrefill.current = next;
      setFromName(next.fromName);
      setFromEmail(next.fromEmail);
      setReplyTo(next.replyTo);
    })();
    return () => { off = true; };
    // Re-runs when the brand or the signed-in account changes; the current field
    // values are deliberately NOT dependencies, or every keystroke would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id, user?.email, engineInfo.from]);

  const canSend = Boolean(activeBrand) && (templateId ? true : Boolean(subject.trim() && message.trim()));

  // EXACTLY the html the send builds (see sendCampaign below). Building it in
  // one place is what stops the preview and the delivered mail diverging — two
  // wrappers that look the same today drift the first time one is edited.
  const composedHtml = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${message.replace(/\n/g, "<br/>")}</div>`;


  // Read a File into raw base64 (strip the data: prefix the FileReader adds).
  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error("Could not read the file"));
      r.readAsDataURL(file);
    });
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setFileErr(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 10) { setFileErr("Maximum 10 attachments."); break; }
      if (/\.(exe|bat|cmd|com|scr|pif|msi|jar|js|vbs|ps1|sh|dll|apk)$/i.test(f.name)) {
        setFileErr(`"${f.name}" is an executable type and can't be emailed.`); continue;
      }
      try { next.push({ filename: f.name, contentBase64: await readAsBase64(f), contentType: f.type, size: f.size }); }
      catch { setFileErr(`Could not read "${f.name}".`); }
    }
    const total = next.reduce((n, a) => n + a.size, 0);
    if (total > 20 * 1024 * 1024) { setFileErr(`Attachments total ${(total / 1048576).toFixed(1)}MB — the limit is 20MB.`); return; }
    setFiles(next);
  }

  // AI draft — writes subject + body from the brand's real details. Always lands
  // in the editable fields; never sends, never saves.
  async function draftWithAi(mode: "email" | "template") {
    if (!activeBrand) return;
    setDrafting(true); setFileErr(null); setDraftNotes([]);
    try {
      const r = await authedFetch("/api/email/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, business: activeBrand.name, product: activeBrand.product,
          audience: activeBrand.audience, offer: activeBrand.offer,
          segment: campaignStatus.trim() || undefined, notes: message.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setFileErr(d.error || "Drafting failed."); return; }
      if (d.subject) setSubject(d.subject);
      if (d.body) setMessage(d.body);
      // Merge tags the writer got wrong are repaired server-side. Say what
      // changed — a silent correction is how a customer stops trusting it.
      setDraftNotes(Array.isArray(d.warnings) ? d.warnings : []);
      setTemplateId("");
    } catch { setFileErr("Couldn't reach the drafting service."); }
    finally { setDrafting(false); }
  }

  async function sendCampaign(test: boolean) {
    if (!activeBrand || !canSend) return;

    // A batch takes minutes. If the customer switches brand while it runs, the
    // report must not appear under the new brand's name — the send still
    // completes, and its result is theirs to read when they switch back.
    const forBrand = activeBrand.id;
    const report = (r: typeof sendResult) => { if (brandNow.current === forBrand) setSendResult(r); };

    setSending(true); setSendResult(null);
    try {
      const payload: Record<string, unknown> = {
        action: "send_campaign", brandId: activeBrand.id, business: activeBrand.name, test,
        statusFilter: campaignStatus.trim() || undefined,
        groups: pickedGroups.length ? pickedGroups : undefined,
        fromEmail: fromEmail.trim() || undefined, fromName: fromName.trim() || undefined,
        replyTo: replyTo.trim() || undefined,
        attachments: files.length ? files.map((f) => ({ filename: f.filename, contentBase64: f.contentBase64, contentType: f.contentType })) : undefined,
      };
      if (templateId) {
        payload.templateId = templateId; // server loads + personalises the template
      } else {
        payload.subject = subject;
        payload.html = composedHtml;
      }
      const res = await authedFetch("/api/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // A bare "Request failed" tells the customer nothing and hides the one
      // fact that matters: whether anything was actually sent. When the body is
      // not JSON the route died rather than answering — usually killed on time —
      // so say that, and say what it means for their list.
      const raw = await res.text();
      let parsed: Record<string, unknown> | null = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      if (parsed) {
        report(parsed as typeof sendResult);
      } else {
        const detail = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
        report({
          error:
            res.status === 504 || res.status === 502 || !raw
              ? `The send timed out (HTTP ${res.status}) before it could report back. Some emails may already have gone out — open the stats above before retrying, and re-run rather than starting a new campaign.`
              : `The send failed with HTTP ${res.status}${detail ? `: ${detail}` : "."}`,
          sent: 0, attempted: 0, failed: 0, sendable: 0, consented: 0, remaining: 0, mode: "", note: "",
        });
      }
      loadStats();
    } catch (e) {
      report({
        error: `Couldn't reach the sending service (${(e as Error).message || "network error"}). Nothing was sent — your list and warm-up allowance are untouched.`,
        sent: 0, attempted: 0, failed: 0, sendable: 0, consented: 0, remaining: 0, mode: "", note: "",
      });
    }
    finally { setSending(false); }
  }

  // Deliverability posture keyed off the brand's REAL Customer Vault size — no
  // fabricated 1,240-contact list. Empty vault → honest empty state.
  useEffect(() => {
    if (!activeBrand) { setPosture(null); return; }
    let cancelled = false;
    setPosture(null);
    // A response is only usable if it has the posture SHAPE. An error object
    // ({error:…}) or any non-posture JSON must NEVER be set as posture, or the
    // render (posture.listSize.toLocaleString(), posture.series.map(…)) throws
    // and the whole page crashes into the error boundary.
    const isPosture = (x: unknown): x is Posture => {
      const p = x as Partial<Posture> | null;
      return !!p && typeof p.listSize === "number"
        && !!p.health && Array.isArray(p.health.composition)
        && !!p.series && Array.isArray(p.series.days);
    };
    (async () => {
      // NO PRE-FLIGHT CONTACT COUNT. It used to fetch the count first and hand
      // it to the metrics route, which is exactly how a real number went out and
      // a modelled one came back. The route reads the list itself now, so there
      // is nothing for the browser to supply and nothing for it to get wrong.
      try {
        const r = await authedFetch("/api/email-metrics", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: activeBrand.id, business: activeBrand.name, days: 14 }),
        });
        const json = await r.json().catch(() => null);
        if (!cancelled) setPosture(isPosture(json) ? json : null);
      } catch { if (!cancelled) setPosture(null); }
    })();
    return () => { cancelled = true; };
  }, [activeBrand]);

  async function runFilter() {
    setBusy(true);
    try {
      const res = await authedFetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", emails: raw.split(/\s+/).filter(Boolean) }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  // THE HEADLINE PROMISED "ZERO BOUNCES" while the card beneath it targeted
  // "< 0.5%". A headline that guarantees what the body only targets is the shape
  // of claim this platform's own site audit marks other people down for.
  return (
    <div>
      <PageHeader
        kicker="AI Email Command Center"
        title="Bulk email that earns its way into the inbox"
        subtitle="Every address passes the hygiene pipeline before a send is attempted, every send goes out on authenticated infrastructure under a warm-up ramp, and every hard failure is suppressed for good. Volume is governed by reputation, not by hardware."
        actions={
          activeBrand ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300">
              <Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}
            </span>
          ) : (
            <Pill tone="info">multi-provider sending pool</Pill>
          )
        }
      />

      {/* Deliverability posture — COMPUTED per brand (estimates, not booked history) */}
      {activeBrand ? (
        posture ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-300">
                List health · {posture.listSize.toLocaleString()} address{posture.listSize === 1 ? "" : "es"} in your vault
              </h2>
              <Pill tone="good">counted from your real list · not modelled</Pill>
            </div>
            <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Can be mailed now"
                value={posture.health.sendable.toLocaleString()}
                sub={`of ${posture.health.total.toLocaleString()} — through the send's own hygiene filter`}
                tone={posture.health.healthPct !== null && posture.health.healthPct >= 90 ? "good" : "warn"}
              />
              <StatCard
                label="Refused before sending"
                value={posture.health.refused.toLocaleString()}
                sub={posture.health.refused ? "bounces that will not happen — and people you cannot reach" : "every address passes"}
                tone={posture.health.refused ? "warn" : "good"}
              />
              <StatCard
                label="Already suppressed"
                value={(posture.health.refusedBy.suppressed ?? 0).toLocaleString()}
                sub="bounced, complained or unsubscribed — never mailed again"
                tone={posture.health.refusedBy.suppressed ? "warn" : "good"}
              />
              {/* WHERE THE MAIL LANDS IS MEASURED, NOT MODELLED. This tile used
                  to read "Projected inbox rate 96.8%", computed from a hash of
                  the brand name. Nothing that reads a contact list can know
                  where a message lands, so this says which surface does. */}
              <StatCard
                label="Inbox placement"
                value="measured, not here"
                sub="seed probe + Gmail Postmaster — see below"
                tone="neutral"
              />
            </div>
            <p className="-mt-6 mb-8 text-xs leading-relaxed text-slate-500">
              {posture.health.verdict}{posture.withoutEmail > 0 && ` A further ${posture.withoutEmail.toLocaleString()} vault row${posture.withoutEmail === 1 ? " has" : "s have"} no email address at all, so ${posture.withoutEmail === 1 ? "it is" : "they are"} not counted above and cannot be mailed either.`}{" "}
              <span className="text-slate-400">{posture.placement.where}</span>
            </p>
          </>
        ) : (
          <div className="mb-8 card border-emerald-500/20 p-6 text-center">
            <Building2 className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
            <h3 className="font-display font-bold text-white">No list to count yet</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              List health is counted from your real Customer Vault — there is no modelled list and no sample data. Import
              contacts and every figure here is the result of running the send&rsquo;s own hygiene filter over your actual
              addresses. You can still run that filter by hand below right now.
            </p>
          </div>
        )
      ) : (
        <div className="mb-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-6 text-center">
          <Building2 className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
          <h3 className="font-display font-bold text-white">Add a brand to model its deliverability posture</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Headline metrics here are computed per brand — never a fake number. Add a brand in the sidebar and the engine
            projects its inbox/bounce posture and list health. You can still run the live hygiene filter below with zero setup.
          </p>
        </div>
      )}

      {/* Capabilities */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <div key={c.title} className="card border-emerald-500/20 p-4">
            <c.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-emerald-300">{c.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.desc}</p>
          </div>
        ))}
      </div>

      {activeBrand && posture && (
        <div className="mb-8 grid gap-6 lg:grid-cols-5">
          <div className="card p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-white">Sent in the last {posture.series.days.length} days</h2>
              <Pill tone={posture.series.empty ? "warn" : "good"}>{posture.series.empty ? "nothing sent yet" : "send ledger"}</Pill>
            </div>
            {/* AN EMPTY LEDGER DRAWS NOTHING. The chart this replaces plotted a
                weekday-shaped curve scaled by a hash of the brand name and
                called it a projection — so a brand that had never sent a message
                still showed a fortnight of confident traffic. A flat line of
                real zeroes would be almost as misleading, so when nothing was
                sent there is no chart at all, just the sentence saying so. */}
            {posture.series.empty ? (
              <p className="py-10 text-center text-sm text-slate-400">{posture.series.note}</p>
            ) : (
              <>
                <AreaChart
                  labels={posture.series.days.map((p) => p.label)}
                  series={[
                    { name: "Sent", data: posture.series.days.map((p) => p.sent) },
                    { name: "Bounced or complained", data: posture.series.days.map((p) => p.failed) },
                  ]}
                  height={230}
                />
                <p className="mt-2 text-xs text-slate-500">{posture.series.note}</p>
              </>
            )}
          </div>
          <div className="card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-white">Why addresses are refused</h2>
              <Pill tone="good">counted</Pill>
            </div>
            <DonutChart
              data={posture.health.composition.filter((c) => c.count > 0).map((c) => ({ label: c.label, value: c.count }))}
              centerValue={posture.health.healthPct === null ? "—" : `${posture.health.healthPct}%`}
              centerLabel={posture.health.healthPct === null ? "no addresses" : "can be mailed"}
              size={185}
            />
          </div>
        </div>
      )}

      {/* Hygiene pipeline */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINE.map((p) => (
          <div key={p.title} className="card p-4">
            <p.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">{p.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Live filter demo */}
      <div className="mb-8 card p-5">
        <h2 className="mb-1 font-display font-bold text-white">Try the live hygiene filter</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paste addresses (one per line) — this runs the real pre-send pipeline in the backend, right now.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          className="mb-3 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 font-mono text-xs text-white outline-none focus:border-emerald-500/60"
        />
        <button type="button" onClick={runFilter} disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />} Filter the list
        </button>
        {result && (
          <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850 p-4 text-sm">
            <p className="mb-2 font-semibold text-white">
              {result.sendableCount} of {result.total} sendable ·{" "}
              <span className="text-amber-300">{result.filteredCount} filtered (bounces prevented)</span>
            </p>
            <ul className="space-y-1 text-xs text-slate-400">
              {result.filtered.map((f) => (
                <li key={f.email}>
                  <span className="font-mono text-rose-300">{f.email}</span> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Real engagement — from the delivery-event ledger (opens/clicks/bounces) */}
      {activeBrand && stats && stats.sent > 0 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Sent" value={stats.sent.toLocaleString()} sub="tracked messages" />
          {/* The open rate is shown as a FLOOR and graded, not painted green.
              A pixel-only count misses every reader who clicked without loading
              images, and a tile that calls 5.9% "good" is the platform lying to
              the customer about their own result. */}
          <StatCard
            label="Open rate (floor)"
            value={stats.improve ? `${stats.improve.reach.openFloorPct}%` : stats.openRate === null ? "—" : `${stats.openRate}%`}
            tone={GRADE_TONE[stats.improve?.openGrade ?? "unknown"]}
            sub={stats.improve
              ? `${stats.improve.reach.knownOpeners.toLocaleString()} known to have opened${stats.improve.reach.silentOpeners ? ` (${stats.improve.reach.silentOpeners.toLocaleString()} clicked without loading images)` : ""}`
              : `${stats.open.toLocaleString()} opened`}
          />
          <StatCard
            label="Click rate"
            value={stats.clickRate === null ? "—" : `${stats.clickRate}%`}
            tone={GRADE_TONE[stats.improve?.clickGrade ?? "unknown"]}
            sub={`${stats.click.toLocaleString()} clicked${stats.improve?.reach.clickToOpenPct ? ` · ${stats.improve.reach.clickToOpenPct}% of openers` : ""}`}
          />
          <StatCard label="Bounces" value={stats.bounce.toLocaleString()} tone={stats.bounce ? "warn" : "neutral"} sub="auto-suppressed" />
          <StatCard label="Complaints" value={stats.complaint.toLocaleString()} tone={stats.complaint ? "warn" : "neutral"} sub="auto-suppressed" />
          <StatCard label="Suppressed" value={stats.suppressed.toLocaleString()} sub="never re-sent" />
        </div>
      )}

      {/* Why those rates are what they are, and the one thing to change. */}
      {activeBrand && stats?.improve && <EmailImprove report={stats.improve} />}

      {/* REAL campaign send — to the brand's consented Customer Vault */}
      <div className="mb-8 card border-emerald-500/30 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Send className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Send a real campaign to your vault</h2>
          <Pill tone="info">consented vault only</Pill>
        </div>
        <p className="mb-3 text-xs text-slate-500">Sends to the <span className="text-slate-300">consented</span> contacts in {activeBrand?.name || "this brand"}&rsquo;s Customer Vault, after the hygiene + suppression filter. Send a <span className="text-emerald-300">test to yourself first</span> (1 email), then the batch. Inbox placement needs SPF/DKIM/DMARC on your sending domain.</p>
        {/* A STOP IS NOT AN INFORMATIONAL NOTICE. When the governor has halted or
            rolled back the ramp because of complaints or bounces, a calm blue
            box saying "today's safe limit is 0" is the wrong shape for the
            message — it reads as routine when it is the one thing on this page
            that needs acting on. */}
        {stats?.warmup && (
          <div className={`mb-3 rounded-lg border p-3 text-xs ${
            stats.warmup.verdict === "stop" ? "border-rose-500/30 bg-rose-500/[0.07] text-rose-200"
              : stats.warmup.verdict === "rollback" || stats.warmup.verdict === "hold" ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-200"
                : "border-sky-500/25 bg-sky-500/[0.06] text-sky-200"}`}>
            <span className="font-bold">Warm-up day {stats.warmup.day} · today&rsquo;s safe limit {stats.warmup.dailyCap.toLocaleString()} emails.</span>{" "}
            {stats.warmup.sentToday.toLocaleString()} sent today, <span className="font-semibold">{stats.warmup.remaining.toLocaleString()} left</span>. Big lists send across several days.
            {/* WHY THE NUMBER IS WHAT IT IS.
                The limit is the lower of the published ramp and what this
                brand's own sending record has earned, so it does NOT simply
                rise with the calendar — that is what used to authorise 50,000
                messages on day 40 from a sender who had sent fifty. Without the
                reason beside it, a correct cap of 100 on day 40 reads as a bug. */}
            {stats.warmup.reason && <span className="mt-1.5 block opacity-90">{stats.warmup.reason}</span>}
            {stats.warmup.governedBy === "reputation" && typeof stats.warmup.scheduleCap === "number" && stats.warmup.scheduleCap > stats.warmup.dailyCap && (
              <span className="mt-1 block text-[11px] opacity-70">
                The published ramp for day {stats.warmup.day} would allow {stats.warmup.scheduleCap.toLocaleString()} — your own record is the lower of the two limits today, and the lower one always wins.
              </span>
            )}
          </div>
        )}
        {engineMode === "demo" && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs text-amber-200">
            <span className="font-bold">Simulation mode — no sending server connected yet.</span> Sends are validated and counted, but <span className="font-semibold">nothing actually leaves the machine</span>, so no email reaches an inbox. To send for real, point the app at your sending server: set <span className="font-mono">SMTP_HOST</span>, <span className="font-mono">SMTP_USER</span> and <span className="font-mono">SMTP_PASS</span> in the server env and redeploy. Then this turns green.
          </div>
        )}
        {engineMode === "live" && (
          <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-xs text-emerald-200">
            <span className="font-bold">Live sending is connected{engineInfo.provider ? ` via ${engineInfo.provider.toUpperCase()}` : ""}.</span> Emails leave through your provider pool. Send a test to yourself first, confirm it lands, then send to the vault.
            {/* THIS USED TO TELL THE OWNER TO AUTHENTICATE MARKETWAR'S OWN
                DOMAIN in their Sending Domains — which they cannot do, and which
                contradicted the note beside it saying that exact address is
                authenticated and reaches the inbox. `engineInfo.from` IS the
                platform's sending identity, authenticated on our pool by
                definition. What is worth saying is the thing that is both true
                and costly to them: recipients see MarketWar's name, not theirs,
                until they add a domain. */}
            {engineInfo.from && (
              <span className="mt-1 block text-emerald-300/80">Sending as <span className="font-mono">{engineInfo.from}</span> — MarketWar&rsquo;s own authenticated address, so it reaches the inbox. Recipients see that name rather than yours; add and verify your own domain in <span className="text-emerald-300">Sending Domains</span> to send as yourself.</span>
            )}
          </div>
        )}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input max-w-[180px]" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="From name (e.g. VeryX)" />
            <input className="input flex-1 min-w-[200px]" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="From address (hello@yourdomain.com)" />
          </div>
          {/* Why the From address is what it is. The empty case is the one that
              needs explaining: a blank field looks like something forgotten
              unless it says it was left blank on purpose. */}
          {fromNote && <p className="text-[11px] leading-relaxed text-slate-500">{fromNote}</p>}
          {/* A hand-typed address gets the check the prefilled one never needed. */}
          {/* THE PLATFORM SENDER IS PASSED IN. Without it this warned that
              MarketWar's own authenticated address "will land in spam or
              bounce", two lines under a note saying that same address is
              authenticated and does reach the inbox. */}
          {fromAddressWarning(fromEmail, domains, engineInfo.from ?? "") && (
            <p className="rounded-md bg-amber-500/[0.07] px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200">{fromAddressWarning(fromEmail, domains, engineInfo.from ?? "")}</p>
          )}
          <p className="text-[11px] text-slate-500">Send as your <span className="text-slate-300">own domain</span> — the address&rsquo;s domain must be authenticated in <span className="text-emerald-300">Sending Domains</span> (DKIM), or mail won&rsquo;t reach the inbox. Leave blank to use the platform sender.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input flex-1 min-w-[200px]" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Reply-to inbox (where replies land, e.g. you@gmail.com)" />
            {replyCheck && (
              <p className={`mt-1 w-full text-xs ${replyCheck.reachable === "no" ? "text-rose-300" : replyCheck.intoInbox ? "text-emerald-300" : "text-slate-400"}`}>
                <span className="font-semibold">{replyCheck.reachable === "no" ? "Replies will not reach anybody. " : replyCheck.intoInbox ? "Replies arrive in your Inbox here. " : "Replies go to that mailbox. "}</span>
                {replyCheck.note}
              </p>
            )}
          </div>
          {/* "ALWAYS WORKS" WAS NOT TRUE AND THE LIVE CHECK ABOVE ALREADY SAID SO.
              A MarketWar reply address is only issued when MW_REPLY_HOST is
              configured with an MX record behind it; on a deployment without it
              no reply address exists and Reply-to falls back to the From. The
              panel is a fixed sentence, `replyCheck` is the measurement, and the
              fixed sentence was overriding it. It now defers. */}
          <p className="text-[11px] text-slate-500">When someone <span className="text-slate-300">replies</span>, it goes to this address — set it to an inbox you actually read (your Gmail/Outlook/work email). Leave it blank and the line above says exactly where replies will land on this deployment; it is checked, not assumed. Bounce notifications never reach you — they&rsquo;re handled by the platform and only the address that actually failed is suppressed.</p>
          {templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select className="input max-w-[280px]" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Write a one-off message…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>Template: {t.name}</option>)}
              </select>
              {templateId && <span className="text-[11px] text-emerald-300/90">Using a saved template — personalised per contact. Manage in Email Templates.</span>}
            </div>
          )}
          {/* WHO THIS GOES TO — named groups from the Customer Vault.
              Nothing picked means everyone, which is what every campaign did
              before groups existed. "Not in any group" is a real choice: every
              newsletter signup and audit lead lands there. */}
          {groups.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Send to</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button" onClick={() => setPickedGroups([])}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${pickedGroups.length === 0 ? "bg-emerald-500 text-ink-950" : "border border-white/10 text-slate-300 hover:border-emerald-500/40"}`}
                >
                  Everyone in the vault
                </button>
                {groups.map((g) => {
                  const on = pickedGroups.includes(g.name);
                  return (
                    <button
                      key={g.name} type="button"
                      onClick={() => setPickedGroups((prev) => on ? prev.filter((x) => x !== g.name) : [...prev, g.name])}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-emerald-500 text-ink-950" : "border border-white/10 text-slate-300 hover:border-emerald-500/40"}`}
                    >
                      {g.isUngrouped ? "Not in any group" : g.name}
                      <span className={`ml-1.5 font-mono ${on ? "text-ink-950/70" : "text-slate-500"}`}>{g.sendable}</span>
                    </button>
                  );
                })}
              </div>
              {/* The number that matters is SENDABLE, not the raw count — a
                  group of 412 that reaches 180 is the kind of figure this
                  platform exists to stop printing. */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {pickedGroups.length === 0
                  ? `Every consented contact in the vault. Pick one or more groups to narrow it — the number on each is how many can actually be emailed.`
                  : `${groups.filter((g) => pickedGroups.includes(g.name)).reduce((n, g) => n + g.sendable, 0)} can be emailed across ${pickedGroups.length} group${pickedGroups.length === 1 ? "" : "s"} — anyone in two of them is counted and sent once. Groups are named in the Customer Vault.`}
              </p>
            </div>
          )}
          {/* Segment target — always applies (template or one-off). */}
          <div className="flex flex-wrap items-center gap-2">
            <input className="input max-w-[260px]" value={campaignStatus} onChange={(e) => setCampaignStatus(e.target.value)} placeholder='Target status (optional) e.g. "contacted"' />
          </div>
          <p className="text-[11px] text-slate-500">Leave status blank to email consented customers. Enter a prospect status (e.g. <span className="text-slate-300">contacted</span>) to email that imported segment — those rows still need an email address to send.</p>
          {!templateId && (
            <>
              <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line (supports {{ firstName }})" />
              <>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => draftWithAi("email")} disabled={drafting || !activeBrand}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25 disabled:opacity-50">
                  {drafting ? "Writing…" : "✨ Draft this email with AI"}
                </button>
                <button type="button" onClick={() => draftWithAi("template")} disabled={drafting || !activeBrand}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-emerald-300 disabled:opacity-50">
                  Draft a reusable template
                </button>
                <span className="text-[11px] text-slate-500">Uses your brand details. Always editable — nothing sends automatically.</span>
              </div>
              <textarea className="input min-h-[120px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your message… (plain text — line breaks preserved; {{ firstName }} etc. are personalised)" />

              {/* Attachments — documents / images sent with the campaign */}
              <div className="mt-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-emerald-300">
                  📎 Attach files
                  <input type="file" multiple className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.csv,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                    onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }} />
                </label>
                <span className="ml-2 text-[11px] text-slate-500">Documents or pictures · max 10 files · 20MB total</span>
                {files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-ink-850 px-2.5 py-1 text-[11px] text-slate-200">
                        {f.filename} <span className="text-slate-500">{(f.size / 1024).toFixed(0)}KB</span>
                        <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400" aria-label={`Remove ${f.filename}`}>×</button>
                      </span>
                    ))}
                    <span className="self-center text-[11px] text-slate-500">
                      total {(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(1)}MB
                    </span>
                  </div>
                )}
                {fileErr && <p className="mt-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">{fileErr}</p>}
                {draftNotes.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                    {draftNotes.map((w, i) => <p key={i}>• {w}</p>)}
                  </div>
                )}
              </div>
            </>
            </>
          )}
          {/* One preview for all three sources — typed here, generated by the
              writer, or a saved template. Above the buttons, because a preview
              underneath them is one you read after deciding. */}
          {activeBrand && canSend && (
            /* `groups` is the SAME selection the send applies. Without it this
               panel — headed "what actually arrives" — was computed against the
               whole vault while the send went only to the chosen groups. */
            <EmailPreview
              brandId={activeBrand.id}
              business={activeBrand.name}
              subject={templateId ? undefined : subject}
              html={templateId ? undefined : composedHtml}
              templateId={templateId || undefined}
              statusFilter={campaignStatus || undefined}
              groups={pickedGroups}
              source={templateId ? "template" : draftNotes.length ? "ai" : "written"}
              onSendable={(_ok, blockers) => setPreviewBlockers(blockers)}
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => sendCampaign(true)} disabled={sending || !canSend} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send test (1)</button>
            <button onClick={() => sendCampaign(false)} disabled={sending || !canSend || previewBlockers > 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to vault</button>
          </div>
          {/* Tell the user WHY the buttons are inert instead of leaving them dead. */}
          {canSend && previewBlockers > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-rose-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
              {previewBlockers} thing{previewBlockers === 1 ? "" : "s"} in the preview would go wrong for every recipient, so the campaign send is held. The test send still works — use it to check a fix.
            </p>
          )}
          {!canSend && (
            <p className="flex items-center gap-1.5 text-xs text-amber-300/90">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
              {!activeBrand ? "Pick a brand in the sidebar first."
                : !subject.trim() && !message.trim() ? "Pick a template above, or add a subject line and a message."
                : !subject.trim() ? "Add a subject line to enable sending."
                : "Write your message to enable sending."}
            </p>
          )}
          {sendResult && (
            <div className={`rounded-lg border p-3 text-sm ${sendResult.error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/[0.06] text-slate-200"}`}>
              {sendResult.error ? sendResult.error : (
                <>
                  <p><span className="font-bold text-emerald-300">{sendResult.sent}</span> sent · {sendResult.failed} failed · {sendResult.attempted} attempted (of {sendResult.sendable} sendable / {sendResult.consented} consented). {sendResult.remaining > 0 && <>Run again for the next {Math.min(250, sendResult.remaining)}.</>}</p>
                  {sendResult.authenticatedAs && <p className="mt-1 text-xs text-slate-300">Sent as: {sendResult.authenticatedAs}</p>}
                  <p className="mt-1 text-xs text-slate-400">{sendResult.note}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the Deliverability Commander</h2>
      </div>
      <AgentRunner
        agentId="email-commander"
        buttonLabel="Audit posture + build the send plan"
        fields={[
          { key: "business", label: "Business", defaultValue: "Your business" },
          { key: "website", label: "Sending domain", defaultValue: "yourbusiness.co.uk" },
          {
            key: "list",
            label: "Describe your list & goal",
            // THIS FIELD USED TO ARRIVE PRE-FILLED WITH SOMEBODY ELSE'S
            // BUSINESS: "~1,240 contacts … Friday platter campaign weekly".
            // A sample from a deli, presented as this account's list, and sent
            // to the agent as fact unless the user happened to clear it. An
            // empty box asks a question; a pre-filled one tells a lie.
            placeholder: "What is on your list, and what are you trying to send? The real numbers are already passed to the agent — this is for the goal.",
            defaultValue: "",
            textarea: true,
          },
        ]}
        // THE SENDING NUMBERS THIS PAGE ALREADY HAS. Without them the agent
        // asks for open and bounce rates that are rendered directly above it.
        context={() => emailContext(stats)}
      />
    </div>
  );
}
