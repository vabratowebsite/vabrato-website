import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vabrato/db", "@vabrato/lib", "@vabrato/ui"],
  // Agent photo uploads (up to 5 MB, checked again in the action).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
