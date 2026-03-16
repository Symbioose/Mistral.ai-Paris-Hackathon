import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // ---------------------------------------------------------------------------
  // Security headers — required for B2B enterprise deployment
  // ---------------------------------------------------------------------------
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // XSS filter (legacy browsers)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Referrer policy — don't leak internal URLs
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy — restrict browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), interest-cohort=()",
          },
          // Strict transport security (HTTPS only)
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Content Security Policy — relaxed in dev for Next.js HMR/eval
          ...(!isDev
            ? [
                {
                  key: "Content-Security-Policy",
                  value: [
                    "default-src 'self'",
                    "script-src 'self' 'wasm-unsafe-eval'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: https:",
                    "media-src 'self' blob: https://api.elevenlabs.io",
                    "connect-src 'self' https://*.supabase.co https://api.deepgram.com https://api.elevenlabs.io wss://api.deepgram.com",
                    "font-src 'self' https://fonts.gstatic.com",
                    "frame-ancestors 'none'",
                  ].join("; "),
                },
              ]
            : []),
        ],
      },
      {
        // Prevent caching of API responses
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },

  // ---------------------------------------------------------------------------
  // Limit upload body size (PDF uploads) — 10 MB
  // ---------------------------------------------------------------------------
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
