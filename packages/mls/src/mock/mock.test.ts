import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createResoClient } from "../client/client";
import { and, eq, ge, gt, date, ts } from "../client/odata";
import { buildFixtures, FIXTURE_NOW } from "../fixtures";
import { MockFeed } from "./feed";
import { createMockFetch, MOCK_ORIGIN } from "./fetch";
import { evaluate, parseFilter } from "./filter";
import { createMockHandler, MOCK_BASE_PATH, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_TOKEN_PATH } from "./handler";
import { startMockServer, type RunningMock } from "./server";

describe("mock $filter evaluator", () => {
  const rec = { City: "San Carlos", ListPrice: 2_000_000, ModificationTimestamp: "2026-11-01T08:00:00Z", CloseDate: "2026-09-01", Pool: null };

  it.each([
    ["City eq 'San Carlos'", true],
    ["City eq 'Belmont'", false],
    ["City ne 'Belmont'", true],
    ["ListPrice gt 1500000 and ListPrice le 2000000", true],
    ["ListPrice lt 1000 or City eq 'San Carlos'", true],
    ["not (City eq 'San Carlos')", false],
    ["ModificationTimestamp gt 2026-10-31T00:00:00.000Z", true],
    ["ModificationTimestamp ge 2026-11-01T08:00:01Z", false],
    ["CloseDate ge 2026-08-01", true],
    ["City in ('Belmont', 'San Carlos')", true],
    ["Pool eq null", true],
    ["Pool gt 1", false],
  ])("%s -> %s", (f, expected) => {
    expect(evaluate(parseFilter(f), rec)).toBe(expected);
  });

  it("handles escaped quotes", () => {
    expect(evaluate(parseFilter("Street eq 'O''Brien Ct'"), { Street: "O'Brien Ct" })).toBe(true);
  });

  it.each(["City eq", "City foo 'x'", "(City eq 'x'", "City eq 'x' extra", "City eq 'unterminated"])("rejects %s", (f) => {
    expect(() => parseFilter(f)).toThrow();
  });

  it("understands what the client builder produces", () => {
    const f = and(gt("ModificationTimestamp", ts("2026-10-31T00:00:00Z")), eq("StandardStatus", "Closed"), ge("CloseDate", date("2026-01-01")));
    const hits = buildFixtures().properties.filter((p) => evaluate(parseFilter(f), p));
    expect(hits.map((p) => p.ListingKey)).toEqual(["FX-005", "FX-006"]);
  });
});

describe("mock feed", () => {
  it("stamps changes with an advancing clock", () => {
    const feed = new MockFeed();
    const a = feed.update("Property", "FX-001", { ListPrice: 1 });
    const b = feed.update("Property", "FX-002", { ListPrice: 2 });
    expect(Date.parse(a.ModificationTimestamp as string)).toBeGreaterThan(FIXTURE_NOW.getTime());
    expect(Date.parse(b.ModificationTimestamp as string)).toBeGreaterThan(Date.parse(a.ModificationTimestamp as string));
    feed.remove("Property", "FX-001");
    expect(feed.find("Property", "FX-001")).toBeUndefined();
  });
});

describe("mock handler", () => {
  const mock = createMockHandler();
  const f = createMockFetch(mock);

  it("requires a bearer token for resources", async () => {
    const res = await f(`${MOCK_ORIGIN}${MOCK_BASE_PATH}/Property`);
    expect(res.status).toBe(401);
  });

  it("serves placeholder SVG photos without auth", async () => {
    const res = await f(`${MOCK_ORIGIN}/media/FX-001-P1.svg`);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(await res.text()).toContain("Fictional fixture photo FX-001-P1");
  });

  it("returns 404 for unknown resources and 400 for bad filters", async () => {
    const tok = await f(`${MOCK_ORIGIN}${MOCK_TOKEN_PATH}`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: MOCK_CLIENT_ID, client_secret: MOCK_CLIENT_SECRET }),
    });
    const { access_token } = (await tok.json()) as { access_token: string };
    const h = { authorization: `Bearer ${access_token}` };
    expect((await f(`${MOCK_ORIGIN}${MOCK_BASE_PATH}/Nope`, { headers: h })).status).toBe(404);
    expect((await f(`${MOCK_ORIGIN}${MOCK_BASE_PATH}/Property?$filter=City%20eq`, { headers: h })).status).toBe(400);
    const counted = await f(`${MOCK_ORIGIN}${MOCK_BASE_PATH}/Property?$count=true&$top=2`, { headers: h });
    const body = (await counted.json()) as { value: unknown[]; "@odata.count": number; "@odata.nextLink": string };
    expect(body.value).toHaveLength(2);
    expect(body["@odata.count"]).toBe(24);
    expect(body["@odata.nextLink"]).toContain("%24skip=2");
  });
});

describe("mock HTTP server", () => {
  let server: RunningMock;
  beforeAll(async () => {
    server = await startMockServer(0);
  });
  afterAll(() => server.close());

  it("gives the same results over a real socket as in-process", async () => {
    const http = createResoClient({
      baseUrl: server.baseUrl,
      auth: { tokenUrl: server.tokenUrl, clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET },
      rateLimitPerSec: 1000,
      pageSize: 7,
    });
    const local = createResoClient({
      baseUrl: MOCK_ORIGIN + MOCK_BASE_PATH,
      fetch: createMockFetch(createMockHandler()),
      auth: { tokenUrl: MOCK_ORIGIN + MOCK_TOKEN_PATH, clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET },
      rateLimitPerSec: 1000,
      pageSize: 7,
    });
    const q = { filter: eq("StandardStatus", "Active"), orderby: "ListPrice desc" };
    const [a, b] = await Promise.all([http.all("Property", q), local.all("Property", q)]);
    expect(a.map((p) => p.ListingKey)).toEqual(b.map((p) => p.ListingKey));
    expect(a.length).toBeGreaterThan(7);
  });

  it("rewrites photo URLs to the server origin and serves them", async () => {
    const client = createResoClient({
      baseUrl: server.baseUrl,
      auth: { tokenUrl: server.tokenUrl, clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET },
      rateLimitPerSec: 1000,
    });
    const [m] = await client.all("Media", { filter: eq("MediaKey", "FX-001-P1") });
    expect(m!.MediaURL).toBe(`${server.origin}/media/FX-001-P1.svg`);
    const file = await client.fetchBinary(m!.MediaURL!);
    expect(file.contentType).toBe("image/svg+xml");
  });
});
