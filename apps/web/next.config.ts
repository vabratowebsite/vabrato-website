import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vabrato/ai", "@vabrato/db", "@vabrato/lib", "@vabrato/mls", "@vabrato/ui"],
  // Next 15 streams generateMetadata output into <body> for most user agents.
  // Every agent gets it in <head> instead, so titles, descriptions and
  // canonicals are in the first HTML for all crawlers and link previews.
  htmlLimitedBots: /.*/,
  async redirects() {
    // SPEC G1 "Explore": the neighborhoods hub (S4 decision).
    return [{ source: "/explore", destination: "/neighborhoods", permanent: true }];
  },
};

export default nextConfig;
