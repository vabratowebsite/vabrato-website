import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vabrato/db", "@vabrato/lib", "@vabrato/ui"],
};

export default nextConfig;
