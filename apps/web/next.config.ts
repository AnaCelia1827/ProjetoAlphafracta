import type { NextConfig } from "next";
import { resolveApiServerUrl } from "./src/lib/api/server-config";

const apiServerUrl = resolveApiServerUrl(process.env, process.env.NODE_ENV);
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiServerUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
