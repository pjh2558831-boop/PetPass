import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "tong.visitkorea.or.kr" },
      { protocol: "https", hostname: "tong.visitkorea.or.kr" },
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
