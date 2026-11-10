import { describe, expect, it } from "vitest";
import { routeForSite, siteForHost } from "./site";

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

describe("routeForSite", () => {
  it("serves vabrato.com as is but hides the internal SCL pages", () => {
    expect(routeForSite("vabrato", "/search")).toBe("next");
    expect(routeForSite("vabrato", "/scl")).toBe("not-found");
    expect(routeForSite("vabrato", "/scl/listing/FX-001/x")).toBe("not-found");
    expect(routeForSite("vabrato", "/sclerosis-is-not-a-prefix-match")).toBe("next");
  });

  it("maps every homes.sancarloslife.com path into the SCL pages", () => {
    expect(routeForSite("sancarloslife", "/")).toEqual({ rewrite: "/scl" });
    expect(routeForSite("sancarloslife", "/listing/FX-001/107-sample-ct-san-carlos")).toEqual({ rewrite: "/scl/listing/FX-001/107-sample-ct-san-carlos" });
    // vabrato.com-only pages don't exist there (they 404 inside /scl).
    expect(routeForSite("sancarloslife", "/about")).toEqual({ rewrite: "/scl/about" });
    expect(routeForSite("sancarloslife", "/scl")).toBe("not-found");
  });
});
