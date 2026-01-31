import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/player_api.php",
        destination: "/api/player_api.php",
      },
    ];
  },
};

export default nextConfig;
