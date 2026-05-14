/**
 * Service Worker — exam-portal v6
 * ONLY caches Pyodide CDN files and hashed Next.js static assets.
 * HTML pages are NEVER cached — always network-first.
 */

const CACHE_VERSION = "v6";
const PYODIDE_CACHE = `exam-pyodide-${CACHE_VERSION}`;
const STATIC_CACHE  = `exam-static-${CACHE_VERSION}`;
const PYODIDE_CDN   = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/";

const PYODIDE_FILES = [
  "pyodide.js",
  "pyodide.asm.wasm",
  "pyodide.asm.js",
  "python_stdlib.zip",
];

// Install: pre-cache Pyodide only
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pyCache = await caches.open(PYODIDE_CACHE);
      const existing = await pyCache.keys();
      const existingUrls = new Set(existing.map((r) => r.url));
      for (const file of PYODIDE_FILES) {
        const url = PYODIDE_CDN + file;
        if (!existingUrls.has(url)) {
          try {
            const res = await fetch(url, { mode: "cors" });
            if (res.ok) await pyCache.put(url, res);
          } catch {}
        }
      }
    })()
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== PYODIDE_CACHE && k !== STATIC_CACHE)
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-GET: bypass
  if (request.method !== "GET") return;

  // API, Supabase, Cloudinary: ALWAYS network (no cache ever)
  if (
    url.pathname.startsWith("/api/") ||
    url.host.includes("supabase.co") ||
    url.host.includes("cloudinary.com") ||
    url.host.includes("fonts.googleapis.com") ||
    url.host.includes("fonts.gstatic.com")
  ) {
    return;
  }

  // Pyodide CDN: cache-first (immutable files)
  if (url.href.startsWith(PYODIDE_CDN)) {
    event.respondWith(cacheFirst(request, PYODIDE_CACHE));
    return;
  }

  // Next.js hashed static assets: cache-first (safe, content-hashed)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML pages and everything else: NETWORK ONLY — never cache
  // This ensures students always get fresh code after deploys
  return;
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("offline", { status: 503 });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "exam-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: "SW_SYNC_TRIGGER" }))
      )
    );
  }
});
