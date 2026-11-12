import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vabrato/ai", "@vabrato/db", "@vabrato/lib", "@vabrato/mls", "@vabrato/ui"],
  // Agent photo uploads (up to 4 MB, checked again in the action; Vercel's own
  // limit is 4.5 MB). Contracts don't come this way: the browser uploads them
  // to storage and the action reads them from there.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
