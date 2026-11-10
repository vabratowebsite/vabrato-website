import { createTestDb, createUser, type TestDb } from "@vabrato/db/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { MlsConfig } from "../config";
import { createClientFromConfig } from "../factory";
import { buildFixtures, ELIGIBLE_KEYS, FIXTURE_NOW } from "../fixtures";
import { createMockHandler, type MockOptions } from "../mock/handler";
import { verifyAgentAccess } from "./access";
import { clientEventCounter, runIncremental, runPurge, runReconcile, sanitizeError, type SyncDeps } from "./engine";
import { MemoryBucket } from "./photos";
import { pgliteSql } from "./sql";
import { PgSyncStore } from "./store";

// End to end: mock RESO feed -> client -> sync -> PGlite with every real
// migration. All data is fictional.

const dbs: TestDb[] = [];
afterEach(async () => {
  while (dbs.length) await dbs.pop()!.close();
});

async function setup(opts: { photoMode?: "hotlink" | "copy"; soldHistoryYears?: number; mock?: MockOptions } = {}) {
  const t = await createTestDb();
  dbs.push(t);
  const store = new PgSyncStore(pgliteSql(t.db));
  const mock = createMockHandler({ maxPageSize: 10, ...opts.mock });
  const events = clientEventCounter();
  const config: MlsConfig = {
    mode: "mock",
    officeId: "VABRA",
    rateLimitPerSec: 1000,
    photoMode: opts.photoMode ?? "hotlink",
    soldHistoryYears: opts.soldHistoryYears ?? 3,
  };
  const { client } = createClientFromConfig(config, { mock, onEvent: events.onEvent, retry: { baseDelayMs: 1, maxAttempts: 3 } });
  const bucket = new MemoryBucket();
  const deps: SyncDeps = { client, store, config, bucket, now: () => FIXTURE_NOW, clientEvents: events, overlapMinutes: 0 };
  const keys = async (table: string, col = "listing_key") =>
    (await t.query<{ k: string }>(`select distinct ${col} as k from ${table} order by 1`)).map((r) => r.k);
  return { t, store, mock, feed: mock.feed, deps, bucket, keys };
}

describe("incremental sync", () => {
  it("first run loads only eligible listings with their media and open houses", async () => {
    const { t, deps, keys } = await setup();
    const r = await runIncremental(deps);
    expect(r.status).toBe("succeeded");
    expect(await keys("mls_listings")).toEqual([...ELIGIBLE_KEYS].sort());
    expect(await keys("mls_listing_vow")).toEqual([...ELIGIBLE_KEYS].sort());
    expect(await keys("mls_listing_full")).toEqual([...ELIGIBLE_KEYS].sort());
    // 3 public photos each; FX-001's private photo and document are dropped.
    expect(await t.query(`select count(*)::int as n from mls_media`)).toEqual([{ n: ELIGIBLE_KEYS.length * 3 }]);
    expect(await keys("mls_media", "media_key")).not.toContain("FX-001-PRIVATE");
    // Public, upcoming open houses of stored listings only (broker tour, canceled and off-market dropped).
    expect(await keys("mls_open_houses", "open_house_key")).toEqual(["OH-001", "OH-002", "OH-005"]);
    expect(r.counts).toMatchObject({ fetched: 24, upserted: 14, removed: 0, "ineligible.off_market": 5, "ineligible.opted_out": 1 });
    expect(r.highWaterMark).toBe("2026-10-31T08:24:00.000Z");
  });

  it("stores each field set at its own level (MLS-4)", async () => {
    const { t, deps } = await setup();
    await runIncremental(deps);
    const [row] = await t.query<{ idx: Record<string, unknown>; vow: Record<string, unknown>; full: Record<string, unknown> }>(
      `select l.data as idx, v.data as vow, f.data as full
       from mls_listings l join mls_listing_vow v using (listing_key) join mls_listing_full f using (listing_key)
       where listing_key = 'FX-005'`,
    );
    expect(row!.idx).toHaveProperty("ListPrice");
    expect(row!.idx).not.toHaveProperty("ClosePrice");
    expect(row!.idx).not.toHaveProperty("PrivateRemarks");
    expect(row!.vow).toHaveProperty("ClosePrice");
    expect(row!.vow).not.toHaveProperty("PrivateRemarks");
    expect(row!.full).toHaveProperty("PrivateRemarks");
    expect(row!.full).not.toHaveProperty("ListPrice");
    for (const d of [row!.idx, row!.vow, row!.full]) expect(d).not.toHaveProperty("X_FixtureInternalNote");
  });

  it("serves IDX rows to signed-out visitors through RLS", async () => {
    const { t, deps } = await setup();
    await runIncremental(deps);
    const seen = await t.as("anon", null, (q) => q<{ listing_key: string }>(`select listing_key from mls_listings`));
    // Sold FX-005 / FX-006 stay hidden (MLS-6, public_sold off).
    expect(seen.map((r) => r.listing_key).sort()).toEqual(ELIGIBLE_KEYS.filter((k) => k !== "FX-005" && k !== "FX-006").sort());
    await expect(t.as("anon", null, (q) => q(`select * from mls_listing_full`))).rejects.toThrow(/permission denied/);
  });

  it("picks up only records changed since the high-water mark", async () => {
    const { t, deps, feed, mock } = await setup();
    await runIncremental(deps);
    const again = await runIncremental(deps);
    expect(again.counts.fetched ?? 0).toBe(0);

    feed.update("Property", "FX-001", { ListPrice: 2_095_000 });
    mock.requests.length = 0;
    const r = await runIncremental(deps);
    expect(r.counts).toMatchObject({ fetched: 1, upserted: 1, priceEvents: 1 });
    expect(mock.requests.find((x) => x.path.endsWith("/Property"))?.params.$filter).toMatch(/^ModificationTimestamp gt /);
    expect(await t.query(`select list_price from mls_listings where listing_key = 'FX-001'`)).toEqual([{ list_price: "2095000.00" }]);
    // VOW price history: the original price and the change.
    expect(await t.query(`select list_price from mls_price_events where listing_key = 'FX-001' order by observed_at`)).toEqual([
      { list_price: "2195000.00" },
      { list_price: "2095000.00" },
    ]);
    expect(Date.parse(r.highWaterMark!)).toBeGreaterThan(Date.parse(again.highWaterMark!));
  });

  it.each([
    ["withdrawn", { StandardStatus: "Withdrawn" }],
    ["opted out", { InternetEntireListingDisplayYN: false }],
    ["moved out of the service area", { CountyOrParish: "Alameda" }],
  ])("removes a listing that is %s at the next run, with everything attached (MLS-5)", async (_label, patch) => {
    const { t, deps, feed } = await setup();
    await runIncremental(deps);
    feed.update("Property", "FX-002", patch);
    const r = await runIncremental(deps);
    expect(r.counts.removed).toBe(1);
    for (const table of ["mls_listings", "mls_listing_vow", "mls_listing_full", "mls_media", "mls_open_houses", "mls_price_events"]) {
      expect(await t.query(`select 1 from ${table} where listing_key = 'FX-002'`)).toEqual([]);
    }
  });

  it("refreshes photos changed without a Property change", async () => {
    const { t, deps, feed } = await setup();
    await runIncremental(deps);
    feed.update("Media", "FX-003-P2", { ShortDescription: "Updated fixture caption" });
    const r = await runIncremental(deps);
    expect(r.counts.fetched ?? 0).toBe(0);
    expect(r.counts.media).toBe(3);
    expect(await t.query(`select short_description from mls_media where media_key = 'FX-003-P2'`)).toEqual([
      { short_description: "Updated fixture caption" },
    ]);
  });

  it("logs a failed run with a sanitized error and does not move the high-water mark", async () => {
    const { t, deps, mock, feed } = await setup();
    const ok = await runIncremental(deps);
    feed.update("Property", "FX-001", { ListPrice: 1 });
    // maxAttempts is 3: exactly enough faults to fail one run.
    mock.injectFault({ status: 500, pathIncludes: "/Property", times: 3 });
    const failed = await runIncremental(deps);
    expect(failed).toMatchObject({ status: "failed", highWaterMark: null, error: "Property: status 500 after 3 attempts" });
    expect(failed.counts.retries).toBe(2);
    expect(await deps.store.lastHighWaterMark()).toBe(ok.highWaterMark);
    const [health] = await t.query<{ last_status: string }>(`select * from mls_sync_health()`);
    expect(health!.last_status).toBe("failed");

    // Next run resumes from the last success and applies the missed change.
    const fresh = await runIncremental(deps);
    expect(fresh.status).toBe("succeeded");
    expect(await t.query(`select list_price from mls_listings where listing_key = 'FX-001'`)).toEqual([{ list_price: "1.00" }]);
  });

  it("skips while another run is in progress and fails abandoned runs", async () => {
    const { t, deps } = await setup();
    await t.query(`insert into mls_sync_runs (kind, status) values ('reconcile', 'running')`);
    expect((await runIncremental(deps)).status).toBe("skipped");
    await t.query(`update mls_sync_runs set started_at = now() - interval '2 hours' where status = 'running'`);
    expect((await runIncremental(deps)).status).toBe("succeeded");
    expect(await t.query(`select status, error from mls_sync_runs where kind = 'reconcile'`)).toEqual([
      { status: "failed", error: "abandoned: run did not finish" },
    ]);
  });
});

describe("nightly reconcile", () => {
  it("loads from empty, syncs the office roster and offices", async () => {
    const { deps, keys } = await setup();
    const r = await runReconcile(deps);
    expect(r.status).toBe("succeeded");
    expect(await keys("mls_listings")).toEqual([...ELIGIBLE_KEYS].sort());
    // Only our office (MLS_OFFICE_ID), active and inactive.
    expect(await keys("mls_members", "member_key")).toEqual(["MB-0001", "MB-0002", "MB-0003"]);
    expect(await keys("mls_offices", "office_mls_id")).toEqual(["VABRA"]);
  });

  it("removes listings that vanished from the feed and re-fetches drifted ones", async () => {
    const { t, deps, feed } = await setup();
    await runReconcile(deps);
    feed.remove("Property", "FX-020"); // hard delete: incremental cannot see it
    expect((await runIncremental(deps)).counts.removed ?? 0).toBe(0);
    await t.query(`update mls_listings set modification_ts = '2020-01-01', list_price = 1 where listing_key = 'FX-021'`);

    const r = await runReconcile(deps);
    expect(r.counts).toMatchObject({ removed: 1, drifted: 1 });
    expect(await t.query(`select 1 from mls_listings where listing_key = 'FX-020'`)).toEqual([]);
    expect(await t.query(`select list_price from mls_listings where listing_key = 'FX-021'`)).toEqual([{ list_price: "2499000.00" }]);
  });

  it("drops sales outside the sold-history window, which is configurable", async () => {
    const three = await setup();
    await runReconcile(three.deps);
    expect(await three.keys("mls_listings")).not.toContain("FX-007");
    const five = await setup({ soldHistoryYears: 5 });
    await runReconcile(five.deps);
    expect(await five.keys("mls_listings")).toContain("FX-007");
  });

  it("re-checks FULL access nightly and locks inactive agents (ACC-1)", async () => {
    const { t, deps, feed, store } = await setup();
    await runReconcile(deps);
    const avery = "40000000-0000-4000-8000-000000000001";
    const riley = "40000000-0000-4000-8000-000000000003";
    await createUser(t, avery, { role: "agent", email: "Avery@Example.test" });
    await createUser(t, riley, { role: "agent", email: "riley@example.test" });

    expect(await verifyAgentAccess(store, { profileId: avery, email: "Avery@Example.test", officeId: "VABRA" })).toEqual({
      verified: true,
      memberKey: "MB-0001",
    });
    // Riley's membership is Inactive.
    expect((await verifyAgentAccess(store, { profileId: riley, email: "riley@example.test", officeId: "VABRA" })).verified).toBe(false);

    const fullRows = () => t.as("authenticated", avery, (q) => q(`select listing_key from mls_listing_full`));
    expect(await fullRows()).toHaveLength(ELIGIBLE_KEYS.length);

    feed.update("Member", "MB-0001", { MemberStatus: "Inactive" });
    const r = await runReconcile(deps);
    expect(r.counts).toMatchObject({ accessChecked: 1, accessLocked: 1 });
    expect(await fullRows()).toEqual([]);
  });

  it("locks an agent who moved to another office", async () => {
    const { t, deps, feed, store } = await setup();
    await runReconcile(deps);
    const jordan = "40000000-0000-4000-8000-000000000002";
    await createUser(t, jordan, { role: "agent" });
    await verifyAgentAccess(store, { profileId: jordan, email: "jordan@example.test", officeId: "VABRA" });
    feed.update("Member", "MB-0002", { OfficeMlsId: "EXRG" });
    const r = await runReconcile(deps);
    expect(r.counts).toMatchObject({ membersRemoved: 1, accessLocked: 1 });
    expect(await t.as("authenticated", jordan, (q) => q(`select 1 from mls_members`))).toEqual([]);
  });
});

describe("photos", () => {
  it("hotlink mode stores the feed URL only", async () => {
    const { t, deps, bucket } = await setup();
    await runIncremental(deps);
    const [m] = await t.query<{ url: string; storage_path: string | null }>(`select url, storage_path from mls_media where media_key = 'FX-001-P1'`);
    expect(m).toEqual({ url: "https://mock.mls.invalid/media/FX-001-P1.svg", storage_path: null });
    expect(bucket.objects.size).toBe(0);
  });

  it("copy mode stores photos once, re-copies changed ones and deletes them with the listing", async () => {
    const { t, deps, bucket, feed } = await setup({ photoMode: "copy" });
    const first = await runReconcile(deps);
    expect(first.counts.photosCopied).toBe(ELIGIBLE_KEYS.length * 3);
    expect(bucket.objects.has("listing/FX-001/FX-001-P1.svg")).toBe(true);
    expect(bucket.objects.get("listing/FX-001/FX-001-P1.svg")!.contentType).toBe("image/svg+xml");

    expect((await runReconcile(deps)).counts.photosCopied).toBe(0);

    feed.update("Media", "FX-001-P2", { ShortDescription: "New photo" });
    expect((await runIncremental(deps)).counts.photosCopied).toBe(1);

    feed.update("Media", "FX-004-P3", { Permission: ["Private"] });
    const dropped = await runIncremental(deps);
    expect(dropped.counts.photosRemoved).toBe(1);
    expect(bucket.objects.has("listing/FX-004/FX-004-P3.svg")).toBe(false);

    feed.update("Property", "FX-001", { StandardStatus: "Canceled" });
    const r = await runIncremental(deps);
    expect(r.counts.photosRemoved).toBe(3);
    expect([...bucket.objects.keys()].some((k) => k.startsWith("listing/FX-001/"))).toBe(false);
    expect(await t.query(`select count(*)::int as n from mls_media where storage_path is null`)).toEqual([{ n: 0 }]);
  });
});

describe("purge (MLS-9)", () => {
  it("requires confirmation", async () => {
    const { deps } = await setup();
    await expect(runPurge(deps, { confirm: false })).rejects.toThrow(/confirm/);
  });

  it("deletes all MLS data and photos, then a later sync starts from scratch", async () => {
    const { t, deps, bucket, keys } = await setup({ photoMode: "copy" });
    await runReconcile(deps);
    const r = await runPurge(deps, { confirm: true });
    expect(r.status).toBe("succeeded");
    for (const table of ["mls_listings", "mls_media", "mls_open_houses", "mls_listing_vow", "mls_listing_full", "mls_members", "mls_offices"]) {
      expect(await t.query(`select 1 from ${table}`)).toEqual([]);
    }
    expect(bucket.objects.size).toBe(0);
    expect(await deps.store.lastHighWaterMark()).toBeNull();
    await runIncremental(deps);
    expect(await keys("mls_listings")).toHaveLength(ELIGIBLE_KEYS.length);
  });
});

describe("mock marker (preview data)", () => {
  it("stores mock-mode rows as source 'mock'", async () => {
    const { t, deps } = await setup();
    await runReconcile(deps);
    for (const table of ["mls_listings", "mls_members", "mls_offices"]) {
      expect(await t.query(`select distinct source from ${table}`)).toEqual([{ source: "mock" }]);
    }
  });

  it("purge --mock removes only the fictional rows", async () => {
    const { t, deps, keys } = await setup();
    await runReconcile(deps);
    await t.query(
      `insert into mls_listings (listing_key, standard_status, modification_ts, source) values ('REAL-1', 'Active', now(), 'MLSListings')`,
    );
    const r = await runPurge(deps, { confirm: true, mockOnly: true });
    expect(r.counts).toMatchObject({ listings: ELIGIBLE_KEYS.length, members: 3 });
    expect(await keys("mls_listings")).toEqual(["REAL-1"]);
    expect(await t.query(`select 1 from mls_members`)).toEqual([]);
  });

  it("refuses a live sync while mock rows are stored (MLS-8)", async () => {
    const { deps } = await setup();
    await runReconcile(deps);
    const live = await runIncremental({ ...deps, config: { ...deps.config, mode: "live" } });
    expect(live).toMatchObject({ status: "failed", error: expect.stringMatching(/purge --mock/) });
  });

  it("rebases fixture dates for previews, keeping relative timing", () => {
    const now = new Date("2027-03-15T08:00:00Z");
    const a = buildFixtures();
    const b = buildFixtures({ now });
    const shift = Date.parse(b.properties[0]!.ModificationTimestamp) - Date.parse(a.properties[0]!.ModificationTimestamp);
    expect(shift % 86_400_000).toBe(0);
    expect(Date.parse(b.openHouses[0]!.OpenHouseStartTime!)).toBeGreaterThan(now.getTime());
    expect(b.properties[4]!.CloseDate).not.toBe(a.properties[4]!.CloseDate);
  });
});

describe("sanitizeError", () => {
  it("keeps the first line, redacts secrets and caps the length", () => {
    expect(sanitizeError(new Error("bad secret-123 here\nstack details"), ["secret-123"])).toBe("bad [redacted] here");
    expect(sanitizeError("x".repeat(900))).toHaveLength(500);
  });
});
