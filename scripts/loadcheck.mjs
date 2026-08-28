// A LOAD FLOOR, RUNNABLE ANYWHERE — launch-audit Gate 6.
//
// The audit found Gate 6 (performance) with NO evidence in either direction:
// no p50, no p95, no p99, no known breaking point. This is not a substitute for
// a real load test against production — it runs against a local `npm start` on
// one machine, so it measures the application, not the deployment, and it
// cannot see cold starts, regional latency, database contention or autoscaling
// cost. Those stay BLOCKED until there is a staging environment.
//
// What it CAN do is establish a floor and catch a regression: if a route that
// answered in 20ms starts taking 2s, this says so before a customer does.
//
// Usage:  node scripts/loadcheck.mjs [baseUrl] [requests] [concurrency]

const base = process.argv[2] || "http://localhost:3000";
const total = Number(process.argv[3] || 100);
const concurrency = Number(process.argv[4] || 20);

/** Read-only, side-effect free, and representative of what a visitor hits. */
const TARGETS = [
  { name: "landing", method: "GET", path: "/" },
  { name: "audit page", method: "GET", path: "/audit" },
  { name: "signup", method: "GET", path: "/signup" },
  { name: "capabilities", method: "GET", path: "/api/capabilities" },
  { name: "health/live", method: "GET", path: "/api/health/live" },
  { name: "human challenge", method: "GET", path: "/api/auth/human" },
];

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

async function measure(t) {
  const latencies = [];
  const statuses = new Map();
  let inFlight = 0, started = 0, done = 0;
  const t0 = Date.now();

  await new Promise((resolve) => {
    const pump = () => {
      while (inFlight < concurrency && started < total) {
        started += 1; inFlight += 1;
        const s = Date.now();
        fetch(base + t.path, { method: t.method })
          .then((r) => { statuses.set(r.status, (statuses.get(r.status) || 0) + 1); return r.arrayBuffer(); })
          .catch(() => { statuses.set("error", (statuses.get("error") || 0) + 1); })
          .finally(() => {
            latencies.push(Date.now() - s);
            inFlight -= 1; done += 1;
            if (done === total) resolve(); else pump();
          });
      }
    };
    pump();
  });

  const elapsed = Date.now() - t0;
  const sorted = latencies.sort((a, b) => a - b);
  // A 429 IS NOT AN ERROR — it is the limiter doing its job, and this script
  // deliberately drives enough traffic to reach it. Counting throttling as
  // failure made the first run report `/api/auth/human` at 85% "errors" when
  // what it had actually found was that route's own 30-per-minute anti-farming
  // limit working exactly as written. Throttled is reported separately so a
  // real failure is still visible.
  const throttled = statuses.get(429) || 0;
  const ok = [...statuses.entries()]
    .filter(([k]) => typeof k === "number" && k < 400)
    .reduce((n, [, v]) => n + v, 0);
  return {
    name: t.name,
    p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99), max: sorted[sorted.length - 1] || 0,
    rps: Math.round((total / Math.max(elapsed, 1)) * 1000),
    throttledPct: Number(((throttled / total) * 100).toFixed(1)),
    errorRatePct: Number((((total - ok - throttled) / total) * 100).toFixed(1)),
    statuses: [...statuses.entries()].map(([k, v]) => `${k}×${v}`).join(" "),
  };
}

console.log(`${base} — ${total} requests, ${concurrency} concurrent, per target\n`);
console.log("target            p50    p95    p99    max     rps   err%  429%  statuses");
console.log("-".repeat(86));
const rows = [];
for (const t of TARGETS) {
  const r = await measure(t);
  rows.push(r);
  console.log(
    `${r.name.padEnd(17)} ${String(r.p50).padStart(4)}ms ${String(r.p95).padStart(4)}ms ${String(r.p99).padStart(4)}ms ${String(r.max).padStart(5)}ms ${String(r.rps).padStart(6)} ${String(r.errorRatePct).padStart(5)} ${String(r.throttledPct).padStart(5)}  ${r.statuses}`,
  );
}

// A floor, not a target. These are deliberately loose: the point is to catch a
// route that has become an order of magnitude slower, not to police 10ms.
const P95_FLOOR_MS = 2_000;
const ERROR_FLOOR_PCT = 1;
const bad = rows.filter((r) => r.p95 > P95_FLOOR_MS || r.errorRatePct > ERROR_FLOOR_PCT);
console.log();
if (bad.length) {
  for (const r of bad) console.log(`FAIL ${r.name}: p95 ${r.p95}ms (floor ${P95_FLOOR_MS}ms), errors ${r.errorRatePct}% (floor ${ERROR_FLOOR_PCT}%)`);
  process.exit(1);
}
console.log(`PASS — every target under ${P95_FLOOR_MS}ms p95 and ${ERROR_FLOOR_PCT}% errors.`);
console.log("NOT a production load test: one machine, no cold starts, no database, no CDN.");
