import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/notiono.apk",
        headers: [
          { key: "Content-Disposition", value: 'attachment; filename="notiono.apk"' },
          { key: "Content-Type", value: "application/octet-stream" },
        ],
      },
    ];
  },
};

export default nextConfig;
