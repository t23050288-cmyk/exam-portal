import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
  },

  // ── HTTP Cache Headers ────────────────────────────────────────
  // Push caching to student browsers instead of our server.
  // Static assets (JS/CSS/images) → 1 year immutable (Vercel handles hash-busting)
  // API routes → short TTL or no-store depending on sensitivity
  async headers() {
    return [
      // Cloudinary & external media: tell browser to cache aggressively
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      // Allow Pyodide Web Worker + CDN
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
      // Next.js static files already get hashed names, so 1yr is safe
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Public folder assets (logos, icons)
      {
        source: "/(.*)\\.(png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf|otf)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=3600",
          },
        ],
      },
      // Public exam config (non-sensitive, can be cached briefly)
      {
        source: "/api/admin/exam/config/public",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=10, stale-while-revalidate=30",
          },
        ],
      },
      // Exam questions (per-student auth required, short browser cache)
      {
        source: "/api/exam/questions",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=1800, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },

  // ── Image optimization ────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 3600,
  },
};

export default nextConfig;
