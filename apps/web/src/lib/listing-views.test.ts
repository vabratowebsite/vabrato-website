import { describe, expect, it } from "vitest";
import { LISTING_KEY_RE, isBotRequest, visitorHash } from "./listing-views";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const h = (init: Record<string, string>) => new Headers(init);

describe("listing views", () => {
  it("skips bots, link previews, prefetches and missing user agents", () => {
    expect(isBotRequest(h({ "user-agent": CHROME }))).toBe(false);
    for (const ua of ["Googlebot/2.1", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "HeadlessChrome/120", "curl/8.4", "Chrome-Lighthouse", ""]) {
      expect(isBotRequest(h(ua ? { "user-agent": ua } : {})), ua).toBe(true);
    }
    expect(isBotRequest(h({ "user-agent": CHROME, "sec-purpose": "prefetch" }))).toBe(true);
  });

  it("hashes the visitor with the server secret, never keeping the IP", () => {
    const a = visitorHash("203.0.113.7", "s1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203");
    expect(visitorHash("203.0.113.7", "s2")).not.toBe(a);
    expect(visitorHash("203.0.113.8", "s1")).not.toBe(a);
  });

  it("accepts only listing-key-shaped keys", () => {
    expect(LISTING_KEY_RE.test("ML81234567")).toBe(true);
    expect(LISTING_KEY_RE.test("FX-001")).toBe(true);
    expect(LISTING_KEY_RE.test("a'; drop")).toBe(false);
    expect(LISTING_KEY_RE.test("x".repeat(65))).toBe(false);
  });
});
