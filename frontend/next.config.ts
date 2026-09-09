import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle (.next/standalone) so
  // the Docker runtime image doesn't need node_modules or the source tree.
  output: "standalone",
};

export default nextConfig;
