import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vabrato/db", "@vabrato/lib", "@vabrato/mls", "@vabrato/ui"],
  async redirects() {
    // SPEC G1 "Explore": the neighborhoods hub (S4 decision).
    return [{ source: "/explore", destination: "/neighborhoods", permanent: true }];
  },
};

export default nextConfig;
