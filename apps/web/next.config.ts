import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Required for monorepo standalone build to include root node_modules
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
