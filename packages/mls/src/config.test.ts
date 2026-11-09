import { describe, expect, it } from "vitest";
import { mlsConfig } from "./config";

describe("mlsConfig", () => {
  it("defaults to mock mode with the VABRA office id", () => {
    expect(mlsConfig({})).toEqual({ mode: "mock", officeId: "VABRA" });
  });

  it("respects an explicit office id", () => {
    expect(mlsConfig({ MLS_OFFICE_ID: "VABRA-1" }).officeId).toBe("VABRA-1");
  });

  it("requires credentials in live mode and names only the missing variables", () => {
    const secret = "do-not-leak-this-value";
    try {
      mlsConfig({ MLS_MODE: "live", MLS_CLIENT_SECRET: secret });
      expect.unreachable();
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("MLS_API_BASE_URL");
      expect(message).toContain("MLS_CLIENT_ID");
      expect(message).not.toContain(secret);
    }
  });

  it("returns live settings when everything is present", () => {
    const cfg = mlsConfig({
      MLS_MODE: "live",
      MLS_API_BASE_URL: "https://example.invalid/reso/odata",
      MLS_CLIENT_ID: "id",
      MLS_CLIENT_SECRET: "secret",
    });
    expect(cfg.mode).toBe("live");
  });

  it("rejects an unknown mode", () => {
    expect(() => mlsConfig({ MLS_MODE: "prod" })).toThrow(/MLS_MODE/);
  });
});
