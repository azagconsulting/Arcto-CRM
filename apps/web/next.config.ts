import type { NextConfig } from "next";

const normalizeUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value.trim().replace(/\/$/, "");
};

const proxyTarget =
  normalizeUrl(process.env.NEXT_PUBLIC_API_PROXY) ??
  normalizeUrl(process.env.API_PROXY_TARGET) ??
  normalizeUrl(process.env.API_INTERNAL_URL) ??
  normalizeUrl(process.env.NEXT_PUBLIC_API_URL) ??
  normalizeUrl(process.env.NODE_ENV === "production" ? null : "http://localhost:4000");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!proxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${proxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
