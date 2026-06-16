import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  turbopack: {
    root: repoRoot,
  },
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  // Transpile workspace TS packages; they ship source to match the monorepo dev flow.
  transpilePackages: ["@jobposted/shared", "@jobposted/ingest"],
};

export default nextConfig;
