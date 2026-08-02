/* ================================================================
   Trinetra service worker — shell only, never market data.

   A cached price is a wrong price. Everything the user could act on —
   snapshots, signals, fundamentals, holdings, IPO data — must come from
   the network every time, and fail visibly when it cannot. So the rule
   here is deliberately blunt:

     · same-origin static assets  → cache-first
     · navigations                → network-first, cached shell as fallback
     · ANYTHING cross-origin      → passthrough, never touched, never stored
     · same-origin /api-ish paths → network-only

   The backend and the Pravesh feed are cross-origin, so the blunt rule
   already covers them; the explicit bypass list below is belt-and-braces
   for the day someone proxies the API onto this origin.

   Bump CACHE_VERSION on every deploy that changes the shell.
   ================================================================ */

const CACHE_VERSION = "v1";
const CACHE = `trinetra-shell-${CACHE_VERSION}`;

const SHELL = ["/", "/offline", "/manifest.webmanifest", "/apple-touch-icon.png",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-512-maskable.png"];

/* Paths that must never be served from cache even on this origin. */
const DATA_PATHS = /^\/(api|snapshot|signals|holdings|exit-signals|brief|profiles|watchlists|fundamentals|paper-trades|ipo-applications|events|config|sizing|concentration|universe|health)\b/;

/* Origins handed in at registration (backend, Pravesh) — bypassed explicitly. */
const BYPASS = new Set(
  new URL(self.location.href).searchParams.getAll("bypass").filter(Boolean)
);

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Individually, so one 404 cannot fail the whole install.
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("trinetra-shell-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* The page asks for the update; the worker never forces one under the user. */
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  /\.(?:css|js|woff2?|ttf|png|jpe?g|svg|ico)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                      // never touch writes

  const url = new URL(req.url);

  // Cross-origin: the backend, the Pravesh feed, fonts CDN, anything else.
  // Not intercepted at all — the browser handles it as if no worker existed.
  if (url.origin !== self.location.origin) return;
  if (BYPASS.has(url.origin)) return;
  if (DATA_PATHS.test(url.pathname)) return;             // network-only, no fallback

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Keep the shell current so a cold offline launch is the last good build.
        const cache = await caches.open(CACHE);
        cache.put("/", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await caches.match("/")) || (await caches.match("/offline")) ||
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  if (isStatic(url)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone()).catch(() => {});
      return res;
    })());
  }
});
