import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle (.next/standalone) so
  // the Docker runtime image doesn't need node_modules or the source tree.
  output: "standalone",
  // Playwright (playwright.config.ts) navigates to 127.0.0.1, not
  // localhost -- dev mode blocks cross-origin HMR/dev-resource requests by
  // default (Next 16), which otherwise silently breaks hydration for any
  // page opened via 127.0.0.1. No effect in production (dev-only guard).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
