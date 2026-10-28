import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // El programa anual (≈2,700 activos con sus planes) viaja en una sola acción de servidor (~0.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
