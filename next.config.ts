import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Telegram web app to embed in iframe
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "ALLOWALL",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
