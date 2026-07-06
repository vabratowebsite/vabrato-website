import { describe, expect, it } from "vitest";
import { publicEnv, serverEnv } from "../env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

describe("publicEnv", () => {
  it("parses valid env", () => {
    expect(publicEnv(valid)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
  });

  it("rejects a non-URL supabase url", () => {
    expect(() => publicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("names the missing variable without leaking values", () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: _omitted, ...rest } = valid;
    let message = "";
    try {
      publicEnv(rest);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(message).not.toContain("anon-key");
    expect(message).not.toContain("service-key");
  });
});

describe("serverEnv", () => {
  it("requires the service-role key", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...rest } = valid;
    expect(() => serverEnv(rest)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("treats RESEND_API_KEY as optional", () => {
    expect(serverEnv(valid).RESEND_API_KEY).toBeUndefined();
    expect(serverEnv({ ...valid, RESEND_API_KEY: "re_123" }).RESEND_API_KEY).toBe("re_123");
  });
});
