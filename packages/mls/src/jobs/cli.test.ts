import { describe, expect, it } from "vitest";
import { revalidateSite } from "./cli";

describe("revalidateSite", () => {
  it("does nothing unless both URL and secret are set", async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await revalidateSite({ MLS_REVALIDATE_URL: "https://example.invalid/api/revalidate" }, f)).toBe(false);
    expect(called).toBe(false);
  });

  it("posts the mls tag with the secret header and never throws", async () => {
    const seen: { url: string; secret: string | null }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      seen.push({ url, secret: new Headers(init.headers).get("x-revalidate-secret") });
      return Response.json({ revalidated: "mls" });
    }) as unknown as typeof fetch;
    const env = { MLS_REVALIDATE_URL: "https://example.invalid/api/revalidate", MLS_REVALIDATE_SECRET: "s3cret" };
    expect(await revalidateSite(env, ok)).toBe(true);
    expect(seen).toEqual([{ url: "https://example.invalid/api/revalidate?tag=mls", secret: "s3cret" }]);
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await revalidateSite(env, down)).toBe(false);
  });
});
