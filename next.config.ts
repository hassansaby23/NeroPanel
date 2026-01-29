import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/player_api.php",
        destination: "/api/player_api.php",
      },
      {
        source: "/portal.php",
        destination: "/c/server.php",
      },
      {
        source: "/stalker_portal/server/load.php",
        destination: "/c/server.php",
      },
      {
        source: "/stalker_portal/server/api/chk_tmp_drive.php",
        destination: "/c/server.php", // Dummy response or ignore
      },
    ];
  },
};

export default nextConfig;
