import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
  images: {
    localPatterns: [
      { pathname: "/og.png", search: "" },
      { pathname: "/og.png", search: "?weekendog-cta=1" },
      { pathname: "/images/home/hero/**", search: "" },
      { pathname: "/brand/partners/**", search: "" },
      { pathname: "/api/places/**/location-thumbnail" },
    ],
    remotePatterns: [
      { protocol: "http", hostname: "tong.visitkorea.or.kr" },
      { protocol: "https", hostname: "tong.visitkorea.or.kr" },
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
