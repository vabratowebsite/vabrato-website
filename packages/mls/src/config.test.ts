import { describe, expect, it } from "vitest";
import { mlsConfig } from "./config";

const LIVE = {
  MLS_MODE: "live",
  MLS_API_BASE_URL: "https://example.invalid/reso/odata",
  MLS_TOKEN_URL: "https://example.invalid/oauth/token",
  MLS_CLIENT_ID: "id",
  MLS_CLIENT_SECRET: "secret",
};

describe("mlsConfig", () => {
  it("defaults to mock mode, the VABRA office id, hotlinked photos and 3 years of sold history", () => {
    expect(mlsConfig({})).toEqual({
      mode: "mock",
      officeId: "VABRA",
      rateLimitPerSec: 2,
      photoMode: "hotlink",
      soldHistoryYears: 3,
    });
  });

  it("respects an explicit office id, photo mode and history depth", () => {
    const cfg = mlsConfig({ MLS_OFFICE_ID: "VABRA-1", MLS_PHOTO_MODE: "copy", MLS_SOLD_HISTORY_YEARS: "5" });
    expect(cfg).toMatchObject({ officeId: "VABRA-1", photoMode: "copy", soldHistoryYears: 5 });
  });

  it("requires credentials in live mode and names only the missing variables", () => {
    const secret = "do-not-leak-this-value";
    try {
      mlsConfig({ MLS_MODE: "live", MLS_CLIENT_SECRET: secret });
      expect.unreachable();
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("MLS_API_BASE_URL");
      expect(message).toContain("MLS_TOKEN_URL");
      expect(message).toContain("MLS_CLIENT_ID");
      expect(message).not.toContain(secret);
    }
  });

  it("returns live settings when everything is present", () => {
    const cfg = mlsConfig(LIVE);
    expect(cfg).toMatchObject({ mode: "live", tokenUrl: LIVE.MLS_TOKEN_URL, apiBaseUrl: LIVE.MLS_API_BASE_URL });
  });

  it("rejects an unknown mode or photo mode", () => {
    expect(() => mlsConfig({ MLS_MODE: "prod" })).toThrow(/MLS_MODE/);
    expect(() => mlsConfig({ MLS_PHOTO_MODE: "scrape" })).toThrow(/MLS_PHOTO_MODE/);
  });
});
