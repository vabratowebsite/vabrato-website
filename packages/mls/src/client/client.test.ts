import { describe, expect, it } from "vitest";
import { createMockFetch, MOCK_ORIGIN } from "../mock/fetch";
import { createMockHandler, MOCK_BASE_PATH, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_TOKEN_PATH, type MockOptions } from "../mock/handler";
import { createResoClient, ResoError, type ClientEvent, type ResoClientOptions } from "./client";
import { eq } from "./odata";

function fakeClock() {
  const c = {
    t: 1_000_000,
    sleeps: [] as number[],
    now: () => c.t,
    sleep: async (ms: number) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
  };
  return c;
}

function setup(opts: Partial<ResoClientOptions> = {}, mockOpts: MockOptions = {}) {
  const mock = createMockHandler(mockOpts);
  const clock = fakeClock();
  const events: ClientEvent[] = [];
  const client = createResoClient({
    baseUrl: MOCK_ORIGIN + MOCK_BASE_PATH,
    fetch: createMockFetch(mock),
    auth: { tokenUrl: MOCK_ORIGIN + MOCK_TOKEN_PATH, clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET },
    rateLimitPerSec: 1000,
    clock,
    random: () => 1,
    onEvent: (e) => events.push(e),
    ...opts,
  });
  const apiCalls = () => mock.requests.filter((r) => r.path.startsWith(MOCK_BASE_PATH));
  return { mock, clock, events, client, apiCalls };
}

describe("RESO client", () => {
  it("authenticates with client credentials and caches the token", async () => {
    const { client, mock, apiCalls } = setup();
    await client.all("Office");
    await client.all("Office");
    expect(mock.tokensIssued()).toBe(1);
    expect(apiCalls().every((r) => r.authorized)).toBe(true);
  });

  it("refreshes the token when it expires", async () => {
    const { client, mock, clock } = setup({}, { tokenTtlSec: 120 });
    await client.all("Office");
    clock.t += 61_000; // TTL minus the 60 s safety margin
    await client.all("Office");
    expect(mock.tokensIssued()).toBe(2);
  });

  it("gets a new token once on 401 and retries", async () => {
    const { client, mock, events } = setup();
    await client.all("Office");
    mock.revokeTokens();
    expect(await client.all("Office")).toHaveLength(3);
    expect(mock.tokensIssued()).toBe(2);
    expect(events).toContainEqual({ type: "token_refreshed" });
  });

  it("fails on bad credentials without echoing them", async () => {
    const secret = "wrong-secret-value-123";
    const { client } = setup({ auth: { tokenUrl: MOCK_ORIGIN + MOCK_TOKEN_PATH, clientId: "nobody", clientSecret: secret } });
    const err = (await client.all("Office").catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(ResoError);
    expect(err.message).toMatch(/token request failed \(status 401\)/);
    expect(err.message).not.toContain(secret);
    expect(err.message).not.toContain("nobody");
  });

  it("follows @odata.nextLink across server-capped pages", async () => {
    const { client, apiCalls } = setup({ pageSize: 200 }, { maxPageSize: 5 });
    const all = await client.all("Property", { orderby: "ModificationTimestamp asc" });
    expect(all).toHaveLength(24);
    expect(apiCalls()).toHaveLength(5);
    expect(new Set(all.map((p) => p.ListingKey)).size).toBe(24);
  });

  it("falls back to $skip paging when the server sends no nextLink", async () => {
    const { client, apiCalls } = setup({ pageSize: 10 }, { omitNextLink: true });
    const all = await client.all("Property");
    expect(all).toHaveLength(24);
    expect(apiCalls().map((r) => r.params.$skip ?? "0")).toEqual(["0", "10", "20"]);
  });

  it("refuses a nextLink on another origin (token never leaves the API)", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith(MOCK_TOKEN_PATH)) return Response.json({ access_token: "t", expires_in: 3600 });
      return Response.json({ value: [], "@odata.nextLink": "https://evil.example/steal" });
    };
    const { client } = setup({ fetch: fetchImpl });
    await expect(client.all("Office")).rejects.toThrow(/outside the API origin/);
  });

  it("retries 429 honouring Retry-After", async () => {
    const { client, mock, clock, events } = setup();
    mock.injectFault({ status: 429, retryAfter: "7", pathIncludes: "/Office" });
    expect(await client.all("Office")).toHaveLength(3);
    expect(clock.sleeps).toContain(7000);
    expect(events).toContainEqual({ type: "retry", resource: "Office", attempt: 1, status: 429, delayMs: 7000 });
  });

  it("retries 5xx with exponential backoff", async () => {
    const { client, mock, events } = setup({ retry: { baseDelayMs: 100, maxAttempts: 4 } });
    mock.injectFault({ status: 503, pathIncludes: "/Office", times: 2 });
    expect(await client.all("Office")).toHaveLength(3);
    expect(events.flatMap((e) => (e.type === "retry" ? [e.delayMs] : []))).toEqual([100, 200]);
  });

  it("gives up after maxAttempts", async () => {
    const { client, mock, apiCalls } = setup({ retry: { maxAttempts: 3, baseDelayMs: 1 } });
    mock.injectFault({ status: 500, pathIncludes: "/Office", times: 10 });
    await expect(client.all("Office")).rejects.toThrow(/Office: status 500 after 3 attempts/);
    expect(apiCalls()).toHaveLength(3);
  });

  it("fails fast when Retry-After is longer than we are willing to wait", async () => {
    const { client, mock } = setup({ retry: { maxRetryAfterMs: 10_000 } });
    mock.injectFault({ status: 429, retryAfter: "3600", pathIncludes: "/Office" });
    await expect(client.all("Office")).rejects.toThrow(/Retry-After exceeds/);
  });

  it("retries network errors", async () => {
    const mock = createMockHandler();
    const inner = createMockFetch(mock);
    let failures = 1;
    const flaky: typeof fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/Office") && failures-- > 0) throw new TypeError("fetch failed");
      return inner(input, init);
    };
    const { client } = setup({ fetch: flaky });
    expect(await client.all("Office")).toHaveLength(3);
  });

  it("does not retry other 4xx errors", async () => {
    const { client, apiCalls } = setup();
    await expect(client.all("Property", { filter: "City eq" })).rejects.toThrow(/status 400/);
    expect(apiCalls()).toHaveLength(1);
  });

  it("spaces requests to the rate limit", async () => {
    const { client, clock } = setup({ rateLimitPerSec: 2, pageSize: 10 }, { omitNextLink: true });
    const start = clock.t;
    await client.all("Property"); // token + 3 pages = 4 requests
    expect(clock.t - start).toBe(1500);
  });

  it("skips invalid records and reports them", async () => {
    const { client, mock, events } = setup();
    mock.feed.add("Office", { OfficeKey: "", OfficeName: "Broken fixture" });
    const offices = await client.all("Office");
    expect(offices).toHaveLength(3);
    expect(events).toContainEqual({ type: "invalid_record", resource: "Office", key: "" });
  });

  it("filters and selects server-side", async () => {
    const { client } = setup();
    const own = await client.all("Property", { filter: eq("ListOfficeMlsId", "VABRA"), select: ["ListingKey", "ModificationTimestamp", "StandardStatus"] });
    expect(own.map((p) => p.ListingKey)).toEqual(["FX-001", "FX-004", "FX-005", "FX-007", "FX-018", "FX-020", "FX-024", "FX-013"].sort());
    expect(Object.keys(own[0]!).sort()).toEqual(["ListingKey", "ModificationTimestamp", "StandardStatus"]);
  });

  it("only sends the bearer token to the API origin", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const mock = createMockHandler();
    const inner = createMockFetch(mock);
    const spy: typeof fetch = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      seen.push({ url: req.url, auth: req.headers.get("authorization") });
      if (req.url.startsWith("https://cdn.example/")) return new Response("x", { headers: { "content-type": "image/jpeg" } });
      return inner(req);
    };
    const { client } = setup({ fetch: spy });
    await client.all("Office");
    const file = await client.fetchBinary("https://cdn.example/photo.jpg");
    expect(file.contentType).toBe("image/jpeg");
    expect(seen.find((s) => s.url.startsWith("https://cdn.example/"))?.auth).toBeNull();
    expect(seen.find((s) => s.url.includes("/Office"))?.auth).toMatch(/^Bearer /);
  });
});
