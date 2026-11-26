/* ---------- Coalition F.O.B service worker (Nov 26) ----------
   Why this exists: the app already had the manifest, standalone display, the
   icons and the Apple meta tags, but no service worker - so added to the home
   screen it still cold-started off the network every launch and showed the
   blank-then-pop. This is the piece that makes it open like an app: its own
   icon, no browser chrome, instant start, and it still works on bad signal in
   a card shop.

   Two rules this file must never break, because both have bitten before:

   1. NEVER serve a stale build. Sawyer has pushed builds and seen the old app
      more times than I can count. So the cache name carries the build number,
      every other cache is deleted on activate, the worker claims open pages
      immediately, and the page reloads itself once when a new worker takes
      over. A new build can never be hidden behind an old cache.

   2. NEVER cache anything behind the gate that is not actually his. The app
      sits behind a login; a signed-out request returns the 401 login page.
      Caching that as the app would lock him out of his own HUD. Only ok,
      same-origin, basic responses are stored, and /api/ is never stored at
      all - orders and inventory must always come from the network. */
const ASSETS = [
  "./", "./index.html?v=249",
  "./app.css?v=249", "./next.css?v=249", "./command.css?v=249", "./collection.css?v=249",
  "./channels.css?v=249", "./scouter.css?v=249", "./spaces.css?v=249", "./vault.css?v=249",
  "./system.css?v=249", "./premium.css?v=249", "./holo.css?v=249", "./kit.css?v=249",
  "./fx.css?v=249", "./settings.css?v=249", "./solid.css?v=249",
  "./next.js?v=249", "./fx.js?v=249", "./fx2.js?v=249", "./native.js?v=249",
  "./manifest.webmanifest", "./img/icon-192.png?v=3", "./img/wm-text.png", "./img/husky.jpg",
];
const BUILD = (ASSETS[1].match(/v=(\d+)/) || [, "0"])[1];
const CACHE = "fob-" + BUILD;

self.addEventListener("install", (e) => {
  /* One bad asset must not fail the whole install, or he gets no worker at
     all and silently loses every benefit of this file. Each is added on its
     own and a miss is simply skipped. */
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (u) => {
      try { const r = await fetch(u, { credentials: "same-origin", cache: "reload" }); if (r.ok) await c.put(u, r); }
      catch { /* offline or gated at install time - it fills in on first use */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const storable = (r) => r && r.ok && r.status === 200 && r.type === "basic";

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  /* His orders, inventory and sync state are never answered from a cache. */
  if (url.pathname.startsWith("/api/")) return;

  /* Opening the app: try the network so a new build lands the moment it is
     there, and fall back to the cached shell only when the network is gone. */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (storable(net)) (await caches.open(CACHE)).put("./index.html?v=" + BUILD, net.clone());
        return net;
      } catch {
        return (await caches.match("./index.html?v=" + BUILD)) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  /* Everything else is versioned by ?v=BUILD, so a hit is this build's file
     by definition and can be served straight from the cache. */
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (storable(net)) (await caches.open(CACHE)).put(req, net.clone());
      return net;
    } catch {
      return hit || Response.error();
    }
  })());
});

self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
