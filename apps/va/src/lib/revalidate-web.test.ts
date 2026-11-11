import { describe, expect, it, vi } from "vitest";
import { revalidateWebsite } from "./revalidate-web";

const opts = { url: "https://site.test/api/revalidate", secret: "s3cret", sleep: async () => {} };

describe("revalidateWebsite", () => {
  it("posts the content tag with the secret header", async () => {
    const doFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await revalidateWebsite({ ...opts, doFetch })).toBe("done");
    const [url, init] = doFetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://site.test/api/revalidate?tag=content");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-revalidate-secret"]).toBe("s3cret");
  });

  it("retries network errors and server errors, then gives up", async () => {
    const doFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await revalidateWebsite({ ...opts, doFetch })).toBe("done");
    expect(doFetch).toHaveBeenCalledTimes(3);
    const failing = vi.fn(async () => new Response("", { status: 500 }));
    expect(await revalidateWebsite({ ...opts, doFetch: failing })).toBe("failed");
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry a wrong secret, and does nothing when not configured", async () => {
    const doFetch = vi.fn(async () => new Response("", { status: 401 }));
    expect(await revalidateWebsite({ ...opts, doFetch })).toBe("failed");
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(await revalidateWebsite({ url: "", secret: "", doFetch })).toBe("not_configured");
  });
});
