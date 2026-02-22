/* VocabForge service worker
   Cache-first for same-origin assets. Offline fallback to cached index.html.
*/

const CACHE = "vocabforge-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    self.skipWaiting();
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    const url = new URL(req.url);

    // Only handle same-origin
    if (url.origin !== self.location.origin) {
      return fetch(req);
    }

    const cache = await caches.open(CACHE);

    // Cache-first
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      // Offline fallback: app shell
      const fallback = await cache.match("./index.html", { ignoreSearch: true });
      if (fallback) return fallback;
      return new Response("Offline. Open once online to cache.", {
        status: 200,
        headers: {"Content-Type":"text/plain"}
      });
    }
  })());
});
