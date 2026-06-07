import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile the workspace TS package (it ships .ts source, not built output).
  transpilePackages: ["@jobposted/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
