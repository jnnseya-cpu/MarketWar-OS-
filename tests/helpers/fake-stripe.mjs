import http from "node:http";
import { createHmac } from "node:crypto";

// A STRIPE THAT REALLY SIGNS AND REALLY DELIVERS.
//
// WHY A STAND-IN AT ALL, given the rule against mocking a route to make a step
// pass. This does not stand in for anything MarketWar owns: every byte of
// MarketWar's own code — the webhook route, the signature check, the dispatcher,
// the wallet, the receipt — runs for real, over a real socket, exactly as it
// does in production. What is replaced is the one participant this container
// cannot have: somebody else's payment processor.
//
// AND IT BEHAVES LIKE THE REAL ONE IN THE WAYS THAT BITE:
//
//   • It SIGNS with the endpoint's secret and POSTs over HTTP itself, rather
//     than handing the driver a payload to post. So the driver never touches a
//     signature, which is the entire point — a driver that signs its own
//     delivery can only ever prove the route, never the secret.
//   • It DELIVERS ONLY WHAT THE ENDPOINT SUBSCRIBED TO. An unsubscribed event
//     is not a failed delivery, it is no delivery, and those two have completely
//     different fixes. Nothing else in the suite exercises that distinction.
//   • It counts `pending_webhooks` down only when the endpoint answers 2xx, so
//     "never got out" and "got out and was refused" stay distinguishable.
//   • It can be told to sign with the WRONG secret, which is the exact fault the
//     whole exercise exists to detect and the one no amount of API access can
//     see.
//
// It speaks form-encoding in and JSON out, because that is what the driver
// writes against and a helper that accepts a shape the real API rejects is a
// test that passes for a reason unrelated to what it tests.

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
};

/** Turn Stripe's `metadata[planId]=growth` form encoding back into nested objects. */
function parseForm(raw) {
  const out = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    const path = k.replace(/\]/g, "").split("[");
    let cur = out;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] ??= {};
    cur[path[path.length - 1]] = v;
  }
  return out;
}

export function fakeStripe({
  /** The endpoints this "account" holds, as `GET /v1/webhook_endpoints` returns them. */
  endpoints = [],
  /** What the deliveries are signed with. Set it wrong on purpose to test the fault. */
  signingSecret = "",
  /** Refuse the endpoint listing, the way a restricted key does. */
  refuseEndpointList = false,
} = {}) {
  const events = [];
  const customers = new Map();
  const invoices = new Map();
  const delivered = [];
  let n = 0;
  const id = (p) => `${p}_${++n}${Date.now().toString(36)}`;

  /**
   * Emit an event and try to deliver it, exactly as Stripe does: to every
   * endpoint SUBSCRIBED to that type, signed, over HTTP, redirects unfollowed.
   */
  async function emit(type, object) {
    const ev = { id: id("evt"), type, created: Math.floor(Date.now() / 1000), data: { object }, pending_webhooks: 0 };
    const targets = endpoints.filter((e) => {
      const en = Array.isArray(e.enabled_events) ? e.enabled_events : [];
      return en.includes("*") || en.includes(type);
    });
    ev.pending_webhooks = targets.length;
    events.unshift(ev);
    for (const t of targets) {
      const payload = JSON.stringify(ev);
      const ts = Math.floor(Date.now() / 1000);
      const v1 = createHmac("sha256", signingSecret).update(`${ts}.${payload}`, "utf8").digest("hex");
      try {
        const res = await fetch(t.url, {
          method: "POST",
          redirect: "manual",
          headers: { "content-type": "application/json", "stripe-signature": `t=${ts},v1=${v1}` },
          body: payload,
        });
        delivered.push({ url: t.url, type, status: res.status });
        // DECREMENTED ONLY ON 2xx. A 400 from a signature mismatch leaves it
        // pending exactly as the real one does until the retries run out.
        if (res.ok) ev.pending_webhooks = Math.max(0, ev.pending_webhooks - 1);
      } catch (e) {
        delivered.push({ url: t.url, type, status: 0, error: String(e) });
      }
    }
    return ev;
  }

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", async () => {
      const url = new URL(req.url, "http://x");
      const p = url.pathname;
      const body = raw ? parseForm(raw) : {};

      if (p === "/v1/webhook_endpoints") {
        if (refuseEndpointList) return json(res, 403, { error: { message: "This key does not have permission to read webhook endpoints." } });
        return json(res, 200, { data: endpoints });
      }

      if (p === "/v1/customers" && req.method === "POST") {
        const c = { id: id("cus"), object: "customer", metadata: body.metadata || {}, description: body.description || "" };
        customers.set(c.id, c);
        await emit("customer.created", c);
        return json(res, 200, c);
      }
      if (/^\/v1\/customers\/[^/]+$/.test(p) && req.method === "DELETE") {
        const cid = p.split("/").pop();
        const existed = customers.delete(cid);
        return json(res, existed ? 200 : 404, existed ? { id: cid, deleted: true } : { error: { message: "No such customer" } });
      }
      if (/^\/v1\/customers\/[^/]+$/.test(p) && req.method === "POST") {
        return json(res, 200, customers.get(p.split("/").pop()) || { id: p.split("/").pop() });
      }
      if (/^\/v1\/payment_methods\/[^/]+\/attach$/.test(p)) {
        return json(res, 200, { id: p.split("/")[3], object: "payment_method" });
      }
      if (p === "/v1/invoiceitems" && req.method === "POST") {
        return json(res, 200, { id: id("ii"), amount: Number(body.amount) || 0 });
      }
      if (p === "/v1/invoices" && req.method === "POST") {
        const inv = {
          id: id("in"), object: "invoice", customer: body.customer, amount_paid: 4900, amount_total: 4900,
          currency: "gbp", metadata: body.metadata || {}, status: "draft",
        };
        invoices.set(inv.id, inv);
        return json(res, 200, inv);
      }
      if (/^\/v1\/invoices\/[^/]+\/finalize$/.test(p)) {
        const inv = invoices.get(p.split("/")[3]);
        if (inv) inv.status = "open";
        return json(res, inv ? 200 : 404, inv || { error: { message: "No such invoice" } });
      }
      if (/^\/v1\/invoices\/[^/]+\/pay$/.test(p)) {
        const inv = invoices.get(p.split("/")[3]);
        if (!inv) return json(res, 404, { error: { message: "No such invoice" } });
        inv.status = "paid";
        await emit("invoice.paid", inv);
        return json(res, 200, inv);
      }
      if (/^\/v1\/events\/[^/]+$/.test(p)) {
        const ev = events.find((e) => e.id === p.split("/").pop());
        return json(res, ev ? 200 : 404, ev || { error: { message: "No such event" } });
      }
      if (p === "/v1/events") {
        const type = url.searchParams.get("type");
        return json(res, 200, { data: type ? events.filter((e) => e.type === type) : events });
      }
      if (p === "/v1/balance") return json(res, 200, { object: "balance" });

      return json(res, 404, { error: { message: `fake-stripe has no route for ${req.method} ${p}` } });
    });
  });

  return {
    server,
    listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => server.close(r)),
    events, delivered,
    customerCount: () => customers.size,
  };
}
