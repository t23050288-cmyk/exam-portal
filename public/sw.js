/**
 * Service Worker — exam-portal
 * Caches static Next.js assets + Pyodide bundle
 * Provides offline fallback for exam page
 */

const CACHE_VERSION   = "v2";
const STATIC_CACHE    = `exam-static-${CACHE_VERSION}`;
const PYODIDE_CACHE   = `exam-pyodide-${CACHE_VERSION}`;

const PYODIDE_CDN     = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/";

// Pyodide files to pre-cache during SW install
const PYODIDE_FILES = [
  "pyodide.js",
  "pyodide.asm.wasm",
  "pyodide.asm.js",
  "python_stdlib.zip",
];

// Static shell files (update version when deploying)
const STATIC_PRECACHE = [
  "/",
  "/exam",
  "/offline.html",
];

// ── Install: pre-cache Pyodide ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pyCache = await caches.open(PYODIDE_CACHE);
      const existing = await pyCache.keys();
      const existingUrls = existing.map((r) => r.url);

      for (const file of PYODIDE_FILES) {
        const url = PYODIDE_CDN + file;
        if (!existingUrls.includes(url)) {
          try {
            const res = await fetch(url, { mode: "cors" });
            if (res.ok) await pyCache.put(url, res);
          } catch (e) {
            console.warn("[SW] Could not pre-cache", file, e.message);
          }
        }
      }

      // Pre-cache static shell
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(STATIC_PRECACHE).catch(() => {});
    })()
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PYODIDE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: strategy per URL pattern ─────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass Service Worker entirely for dynamic data, non-GET requests, and external media
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.host.includes("supabase.co") ||
    url.host.includes("cloudinary.com")
  ) {
    return; // Browser handles the request natively
  }

  // Pyodide CDN: Cache-first (these files don't change for a given version)
  if (url.href.startsWith(PYODIDE_CDN)) {
    event.respondWith(cacheFirst(request, PYODIDE_CACHE));
    return;
  }

  // Next.js static assets: Cache-first (hashed filenames, safe forever)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests: Network with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(networkWithOfflineFallback(request));
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

// ── Cache strategies ─────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    return new Response(JSON.stringify({ error: "offline" }), { status: 503 });
  }
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch (e) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match("/offline.html");
    return cached || new Response("<h1>You are offline. Please reconnect.</h1>", {
      headers: { "Content-Type": "text/html" },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  const res = cached || (await fetchPromise);
  // Ensure we always return a valid Response object to prevent TypeError
  return res || new Response(JSON.stringify({ error: "network error" }), { status: 502 });
}

// ── Background sync placeholder (future) ─────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "exam-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: "SW_SYNC_TRIGGER" }))
      )
    );
  }
});
