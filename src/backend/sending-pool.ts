// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Sending-node pool — horizontal scale toward millions/day, with ZERO cost until
// you actually add nodes.
//
// The physical ceiling on email volume is the sending IP (an inbox provider
// throttles by IP reputation; one warmed IP sustains ~50k–100k/day). To grow past
// one IP you add more sending nodes and spread load across them. This module makes
// the platform pool-AWARE in software so that is a config change, not a code
// change:
//
//   • No pool configured  → falls back to the single SMTP_* node (today's setup,
//     byte-for-byte unchanged — no extra infra, no behaviour change).
//   • MW_SENDING_POOL set  → a JSON array of nodes; sends are routed across them.
//
// Routing is consistent-hash BY SENDING DOMAIN: a given customer domain always
// leaves from the same node/IP (stable per-sender reputation + SPF alignment),
// while different domains spread evenly across the pool. A node at its daily cap
// overflows to the next available node. Per-node daily counts are in-memory
// (per-instance); a shared store is the multi-instance upgrade (documented).

export type SendingNode = {
  label: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  ip?: string; // informational (for SPF / diagnostics); never required
};

// Each warmed IP sustains this many sends/day by default (override per env).
const NODE_DAILY_CAP = Math.max(1, Number((process.env.MW_NODE_DAILY_CAP || "50000").trim()) || 50000);

function singleNodeFromEnv(): SendingNode | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  if (!host || !user || !pass) return null;
  const port = Number((process.env.SMTP_PORT || "587").trim());
  const secure = (process.env.SMTP_SECURE || "").trim() === "true" || port === 465;
  return { label: "primary", host, port, user, pass, secure, ip: (process.env.MW_SENDING_IP || "").trim() || undefined };
}

// The active pool. MW_SENDING_POOL (JSON array) wins; otherwise the single SMTP_*
// node; otherwise empty (demo mode). Malformed pool JSON degrades to the single
// node so a bad env var can never take sending down.
export function getPool(): SendingNode[] {
  const raw = (process.env.MW_SENDING_POOL || "").trim();
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw) as Partial<SendingNode>[];
      const nodes = arr
        .filter((n) => n && n.host && n.user && n.pass)
        .map((n, i) => ({
          label: String(n.label || `node-${i + 1}`),
          host: String(n.host),
          port: Number(n.port) || 587,
          user: String(n.user),
          pass: String(n.pass),
          secure: n.secure === true || Number(n.port) === 465,
          ip: n.ip ? String(n.ip) : undefined,
        }));
      if (nodes.length) return nodes;
    } catch {
      /* fall through to single node */
    }
  }
  const single = singleNodeFromEnv();
  return single ? [single] : [];
}

export function poolConfigured(): boolean {
  return getPool().length > 0;
}

const fnv = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// In-memory per-node daily counters (per instance). "date|label" → count.
const counts = new Map<string, number>();
const keyFor = (label: string, day: string) => `${day}|${label}`;

export function recordNodeSend(label: string, day: string, n = 1): void {
  const k = keyFor(label, day);
  counts.set(k, (counts.get(k) ?? 0) + n);
}
function nodeCount(label: string, day: string): number {
  return counts.get(keyFor(label, day)) ?? 0;
}

// Pick the node a given sending domain should use today. Consistent-hash to a
// home node for stable reputation; overflow to the next node when the home node
// has hit its daily cap. Returns null only when no node is configured (demo).
export function pickNode(domain: string, day: string): SendingNode | null {
  const pool = getPool();
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const base = fnv(domain || "default") % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const node = pool[(base + i) % pool.length];
    if (nodeCount(node.label, day) < NODE_DAILY_CAP) return node;
  }
  return pool[base]; // all full → best effort (per-brand warm-up already caps volume)
}

// Diagnostics for the health surface (never exposes credentials).
export function poolInfo(day: string): { size: number; nodeCap: number; nodes: { label: string; host: string; ip?: string; sentToday: number }[] } {
  const pool = getPool();
  return {
    size: pool.length,
    nodeCap: NODE_DAILY_CAP,
    nodes: pool.map((n) => ({ label: n.label, host: n.host, ip: n.ip, sentToday: nodeCount(n.label, day) })),
  };
}
