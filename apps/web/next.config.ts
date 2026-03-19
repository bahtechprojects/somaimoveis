import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Required for monorepo standalone build to include root node_modules
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // pdf-parse uses fs and loads test files - must be external
  serverExternalPackages: ["pdf-parse"],
  // Increase body size limit for PDF uploads (default 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    middlewareClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
