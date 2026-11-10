import type { ClientEvent, ResoClient } from "../client/client";
import { and, anyOf, date, eq, ge, gt, or, ts } from "../client/odata";
import type { MlsConfig } from "../config";
import { DISPLAYABLE_STATUSES, eligibility, isPublicOpenHouse, soldCutoff } from "../eligibility";
import type { Property } from "../resources";
import { recheckAgentAccess } from "./access";
import { planPhotos, type PhotoBucket } from "./photos";
import { listingRows, memberRow, officeRow, openHouseRow } from "./rows";
import type { Counts, PgSyncStore, RunKind } from "./store";

// Incremental sync (every 15 min, keyed on ModificationTimestamp), nightly
// reconcile, and purge. Each run is logged in mls_sync_runs (sync health).

export interface SyncDeps {
  client: ResoClient;
  store: PgSyncStore;
  config: Pick<MlsConfig, "officeId" | "photoMode" | "soldHistoryYears">;
  /** Required for MLS_PHOTO_MODE=copy and for purge of copied photos. */
  bucket?: PhotoBucket | null;
  now?: () => Date;
  /** Listing keys per `$filter` when fetching by key (keeps URLs short). */
  keysPerRequest?: number;
  /** Re-read this many minutes before the high-water mark (late-arriving updates). */
  overlapMinutes?: number;
  /** Client event tallies (retries, invalid records) to copy into the run's counts. */
  clientEvents?: ClientEventCounter;
  /** Strings that must never appear in a logged error (e.g. the client secret). */
  redact?: string[];
}

export interface RunResult {
  kind: RunKind;
  runId: string | null;
  status: "succeeded" | "failed" | "skipped";
  counts: Counts;
  highWaterMark: string | null;
  error?: string;
}

export interface ClientEventCounter {
  onEvent(e: ClientEvent): void;
  counts: { retries: number; invalidRecords: number; tokenRefreshes: number };
}

export function clientEventCounter(): ClientEventCounter {
  const counts = { retries: 0, invalidRecords: 0, tokenRefreshes: 0 };
  return {
    counts,
    onEvent(e) {
      if (e.type === "retry") counts.retries++;
      else if (e.type === "invalid_record") counts.invalidRecords++;
      else if (e.type === "token_refreshed") counts.tokenRefreshes++;
    },
  };
}

const ELIGIBILITY_FIELDS = [
  "ListingKey",
  "ModificationTimestamp",
  "StandardStatus",
  "CloseDate",
  "CountyOrParish",
  "OriginatingSystemName",
  "InternetEntireListingDisplayYN",
  "IDXParticipationYN",
] as const;

const PROPERTY_BATCH = 100;

export function sanitizeError(e: unknown, redact: string[] = []): string {
  let msg = (e instanceof Error ? e.message : String(e)).split("\n")[0] ?? "error";
  for (const secret of redact) if (secret) msg = msg.split(secret).join("[redacted]");
  return msg.slice(0, 500);
}

const maxIso = (a: string | null, b: string | null | undefined): string | null => {
  if (!b) return a;
  const bIso = new Date(b).toISOString();
  return !a || bIso > a ? bIso : a;
};

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

class Run {
  counts: Counts = {};
  constructor(readonly deps: SyncDeps) {}
  add(key: string, n = 1) {
    this.counts[key] = (this.counts[key] ?? 0) + n;
  }
  now() {
    return this.deps.now?.() ?? new Date();
  }

  async removePhotos(paths: string[]) {
    if (paths.length === 0) return;
    if (!this.deps.bucket) {
      this.add("photosOrphaned", paths.length);
      return;
    }
    await this.deps.bucket.remove(paths);
    this.add("photosRemoved", paths.length);
  }

  /** Upserts eligible listings and removes ineligible ones (MLS-5). Returns the keys now stored. */
  async applyProperties(props: Property[]): Promise<string[]> {
    const { store, config } = this.deps;
    const keep: Property[] = [];
    const drop: string[] = [];
    for (const p of props) {
      const e = eligibility(p, { soldHistoryYears: config.soldHistoryYears, now: this.now() });
      if (e.eligible) keep.push(p);
      else {
        drop.push(p.ListingKey);
        this.add(`ineligible.${e.reason}`);
      }
    }
    this.add("fetched", props.length);
    const { priceEvents } = await store.upsertListings(keep.map((p) => listingRows(p, config.officeId)));
    this.add("upserted", keep.length);
    this.add("priceEvents", priceEvents);
    const { removed, storagePaths } = await store.removeListings(drop);
    this.add("removed", removed.length);
    await this.removePhotos(storagePaths);
    return keep.map((p) => p.ListingKey);
  }

  /** Refreshes media and open houses for stored listings. */
  async refreshChildren(keys: string[]) {
    const { client, store, config, bucket } = this.deps;
    const size = this.deps.keysPerRequest ?? 20;
    const now = this.now();
    for (const batch of chunk(keys, size)) {
      const media = (await client.all("Media", { filter: anyOf("ResourceRecordKey", batch), orderby: "Order asc" })).filter(
        (m) => !m.ResourceName || m.ResourceName === "Property",
      );
      const existing = await store.mediaFor(batch);
      const plan = await planPhotos({ mode: config.photoMode, feed: media, existing, client, bucket: bucket ?? null });
      await store.replaceMedia(batch, plan.rows);
      await this.removePhotos(plan.stale);
      this.add("media", plan.rows.length);
      this.add("photosCopied", plan.copied);

      const ohs = (await client.all("OpenHouse", { filter: anyOf("ListingKey", batch) })).filter(
        (o) => isPublicOpenHouse(o) && (!o.OpenHouseEndTime || new Date(o.OpenHouseEndTime) >= now),
      );
      await store.replaceOpenHouses(batch, ohs.map(openHouseRow));
      this.add("openHouses", ohs.length);
    }
  }
}

async function withRun(deps: SyncDeps, kind: RunKind, body: (run: Run) => Promise<string | null>): Promise<RunResult> {
  const { store } = deps;
  await store.failAbandonedRuns();
  const runId = await store.startRun(kind);
  if (!runId) return { kind, runId: null, status: "skipped", counts: {}, highWaterMark: null };
  const run = new Run(deps);
  const before = deps.clientEvents ? { ...deps.clientEvents.counts } : null;
  const withEvents = () => {
    if (!before || !deps.clientEvents) return run.counts;
    const c = deps.clientEvents.counts;
    return {
      ...run.counts,
      retries: c.retries - before.retries,
      invalidRecords: c.invalidRecords - before.invalidRecords,
      tokenRefreshes: c.tokenRefreshes - before.tokenRefreshes,
    };
  };
  try {
    const highWaterMark = await body(run);
    const counts = withEvents();
    await store.finishRun(runId, { status: "succeeded", counts, highWaterMark });
    return { kind, runId, status: "succeeded", counts, highWaterMark };
  } catch (e) {
    const error = sanitizeError(e, deps.redact);
    const counts = withEvents();
    // A failed run never moves the high-water mark: the next run re-reads from the last success.
    await store.finishRun(runId, { status: "failed", counts, highWaterMark: null, error });
    return { kind, runId, status: "failed", counts, highWaterMark: null, error };
  }
}

/** Every 15 minutes: everything modified since the last successful run. */
export function runIncremental(deps: SyncDeps): Promise<RunResult> {
  return withRun(deps, "incremental", async (run) => {
    const { client, store } = deps;
    const hwm = await store.lastHighWaterMark();
    const since = hwm ? new Date(Date.parse(hwm) - (deps.overlapMinutes ?? 5) * 60_000) : null;
    const filter = since ? gt("ModificationTimestamp", ts(since)) : undefined;
    let maxTs = hwm;
    const touched = new Set<string>();

    let buf: Property[] = [];
    const flush = async () => {
      for (const k of await run.applyProperties(buf)) touched.add(k);
      buf = [];
    };
    for await (const p of client.records("Property", { filter, orderby: "ModificationTimestamp asc" })) {
      maxTs = maxIso(maxTs, p.ModificationTimestamp);
      buf.push(p);
      if (buf.length >= PROPERTY_BATCH) await flush();
    }
    await flush();

    if (filter) {
      // Photo or open-house changes that did not touch the Property record.
      // Their timestamps never move the high-water mark (that would skip
      // Property changes made between the two queries).
      const candidates = new Set<string>();
      for await (const m of client.records("Media", { filter, select: ["MediaKey", "ResourceRecordKey", "ModificationTimestamp"] })) {
        candidates.add(m.ResourceRecordKey);
      }
      for await (const o of client.records("OpenHouse", { filter, select: ["OpenHouseKey", "ListingKey", "ModificationTimestamp"] })) {
        candidates.add(o.ListingKey);
      }
      const extra = [...candidates].filter((k) => !touched.has(k));
      for (const k of await store.existingListingKeys(extra)) touched.add(k);
    }

    await run.refreshChildren([...touched]);
    return maxTs;
  });
}

/**
 * Nightly: compares every eligible listing in the feed with what we store,
 * deletes anything no longer eligible or gone from the feed (MLS-5),
 * re-fetches drifted records, refreshes photos and open houses, syncs the
 * office roster and re-checks FULL access (ACC-1).
 */
export function runReconcile(deps: SyncDeps): Promise<RunResult> {
  return withRun(deps, "reconcile", async (run) => {
    const { client, store, config } = deps;
    const now = run.now();
    const hwm = await store.lastHighWaterMark();
    let maxTs = hwm;

    // Server-side filter by status keeps the scan small; county and display
    // flags are checked here (feeds differ in how they spell counties).
    const filter = or(
      anyOf("StandardStatus", DISPLAYABLE_STATUSES),
      and(eq("StandardStatus", "Closed"), ge("CloseDate", date(soldCutoff({ soldHistoryYears: config.soldHistoryYears, now })))),
    );
    const feed = new Map<string, string>();
    for await (const p of client.records("Property", { filter, select: ELIGIBILITY_FIELDS })) {
      maxTs = maxIso(maxTs, p.ModificationTimestamp);
      if (eligibility(p, { soldHistoryYears: config.soldHistoryYears, now }).eligible) {
        feed.set(p.ListingKey, new Date(p.ModificationTimestamp).toISOString());
      }
    }
    run.add("feedEligible", feed.size);

    const local = await store.listingVersions();
    const gone = [...local.keys()].filter((k) => !feed.has(k));
    const { removed, storagePaths } = await store.removeListings(gone);
    run.add("removed", removed.length);
    await run.removePhotos(storagePaths);

    const drifted = [...feed.keys()].filter((k) => local.get(k) !== feed.get(k));
    run.add("drifted", drifted.length);
    for (const batch of chunk(drifted, deps.keysPerRequest ?? 20)) {
      await run.applyProperties(await client.all("Property", { filter: anyOf("ListingKey", batch) }));
    }

    await run.refreshChildren(await store.existingListingKeys([...feed.keys()]));

    const members = await client.all("Member", { filter: eq("OfficeMlsId", config.officeId) });
    const { removed: membersRemoved } = await store.replaceMembers(members.map(memberRow));
    run.add("members", members.length);
    run.add("membersRemoved", membersRemoved);
    const offices = await client.all("Office", { filter: eq("OfficeMlsId", config.officeId) });
    await store.upsertOffices(offices.map(officeRow));
    run.add("offices", offices.length);

    const access = await recheckAgentAccess(store, { officeId: config.officeId, now });
    run.add("accessChecked", access.checked);
    run.add("accessLocked", access.locked);
    return maxTs;
  });
}

/** MLS-9: delete all MLS data (license terminated). Requires explicit confirmation. */
export function runPurge(deps: SyncDeps, opts: { confirm: boolean }): Promise<RunResult> {
  if (!opts.confirm) return Promise.reject(new Error("Purge deletes all MLS data: pass confirm"));
  return withRun(deps, "purge", async (run) => {
    const res = await deps.store.purgeAll();
    run.add("listings", res.listings);
    run.add("members", res.members);
    await run.removePhotos(res.storagePaths);
    if (deps.bucket) run.add("bucketObjectsRemoved", await deps.bucket.removeAll());
    return null;
  });
}
