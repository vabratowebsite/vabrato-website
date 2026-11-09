import { describe, expect, it } from "vitest";
import { siteForHost } from "./site";

describe("siteForHost", () => {
  it("routes the San Carlos Life listings subdomain", () => {
    expect(siteForHost("homes.sancarloslife.com")).toBe("sancarloslife");
    expect(siteForHost("HOMES.SanCarlosLife.com:443")).toBe("sancarloslife");
  });

  it("routes a local sancarloslife.* host for development", () => {
    expect(siteForHost("sancarloslife.localhost:3003")).toBe("sancarloslife");
  });

  it("defaults everything else to the main site", () => {
    expect(siteForHost("vabrato.com")).toBe("vabrato");
    expect(siteForHost("www.vabrato.com")).toBe("vabrato");
    expect(siteForHost("vabrato-website-git-main.vercel.app")).toBe("vabrato");
    expect(siteForHost("localhost:3003")).toBe("vabrato");
    expect(siteForHost(undefined)).toBe("vabrato");
  });

  it("does not treat lookalike hosts as San Carlos Life", () => {
    expect(siteForHost("homes.sancarloslife.com.evil.example")).toBe("vabrato");
  });
});
