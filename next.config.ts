import type { NextConfig } from "next";

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
