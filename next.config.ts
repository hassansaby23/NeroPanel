import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // trailingSlash: true, // Disabled to prevent conflicts with rewrites
  async rewrites() {
    return [
      {
        source: "/player_api.php",
        destination: "/api/player_api.php",
      },
      {
        source: "/portal.php",
        destination: "/api/portal",
      },
    ];
  },
};

export default nextConfig;
