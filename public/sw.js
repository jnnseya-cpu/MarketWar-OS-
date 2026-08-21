// MarketWar OS service worker — installable, offline-TOLERANT, never
// offline-deceptive.
//
// The distinction matters more here than in most apps. Every figure on a
// MarketWar page is measured server-side from live data. Serving a cached
// dashboard when the network is gone would show yesterday's numbers with
// today's date on them — a fabricated measurement, which is the one thing this
// platform refuses to do. So:
//
//   • Static build assets are cached hard (they are content-hashed and
//     immutable, so a cache hit is never stale).
//   • HTML pages are network-first; on failure the user gets the offline page,
//     NOT a stale copy of the page they wanted.
//   • /api, auth and webhook traffic is never touched — those carry
//     credentials and must stay fresh.
//
// Bump the version to invalidate everything on the next activation.
//
// THREE CACHES, NOT ONE, AND THE REASON IS A BUG THAT WAS ALREADY HERE.
//
// Everything used to share a single 80-entry bucket trimmed oldest-first. Two
// things followed, both bad:
//
//   • The offline page was PRECACHED FIRST, so it was the FIRST thing evicted
//     once eighty entries had accumulated. The fallback stopped existing at
//     exactly the point it was needed, and the user got a bare line of text
//     instead of the page built for the purpose.
//   • Static chunks and visited pages competed for the same eighty slots. A
//     Next build has far more chunks than that on its own, so the cache
//     thrashed and bought a fraction of what it looked like it bought.
//
// The precache is now its own cache and is never trimmed. Pages and assets have
// separate budgets, so neither can evict the other.
const VERSION = "v4";
const PRECACHE_CACHE = `marketwar-os-precache-${VERSION}`;
const ASSET_CACHE = `marketwar-os-assets-${VERSION}`;
const PAGE_CACHE = `marketwar-os-pages-${VERSION}`;
const OWNED = [PRECACHE_CACHE, ASSET_CACHE, PAGE_CACHE];
const OFFLINE_URL = "/offline.html";

// The only things worth precaching: the offline page must be there BEFORE the
// network goes away, or the fallback has nothing to fall back to.
const PRECACHE = [OFFLINE_URL, "/brand/icon-192.png", "/manifest.webmanifest"];

// Caps, because a cache that grows without limit eventually gets the whole
// origin's storage evicted by the browser. The precache has no cap: it holds
// three small files that must always be there.
const MAX_ASSETS = 120;
const MAX_PAGES = 40;

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // Oldest first — Cache Storage preserves insertion order.
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE_CACHE)
      .then((c) => c.addAll(PRECACHE))
      // A precache miss must not stop the worker installing — an app that fails
      // to install because one icon 404'd is worse than one without a fallback.
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !OWNED.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Lets the page trigger an update without a hard reload.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/brand/") ||
  /\.(?:css|js|woff2?|png|jpe?g|svg|webp|avif|ico)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // Never intercept credentialled or live-data traffic. A cached API response
  // is a wrong number presented as a right one.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__/")) return;

  // Content-hashed build output: cache-first is safe and makes repeat loads
  // instant, because the URL changes whenever the content does.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).then(() => trim(ASSET_CACHE, MAX_ASSETS)).catch(() => {});
        }
        return res;
      })),
    );
    return;
  }

  // Everything else is a page. Network-first, and on failure the OFFLINE page —
  // deliberately not a stale copy of the page that was asked for.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).then(() => trim(PAGE_CACHE, MAX_PAGES)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL).then((page) => page || new Response(
          "You are offline.",
          { status: 503, headers: { "Content-Type": "text/plain" } },
        ))),
    );
  }
});
