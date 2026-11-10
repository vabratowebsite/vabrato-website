// MLS sync job entry (Render cron; see packages/mls/RENDER.md).
//
//   pnpm --filter @vabrato/mls sync incremental     every 15 minutes
//   pnpm --filter @vabrato/mls sync reconcile       nightly
//   pnpm --filter @vabrato/mls sync purge --confirm MLS-9 only
//   pnpm --filter @vabrato/mls sync purge --mock --confirm   fictional preview rows only
//
// Add --pglite (MLS_MODE=mock only) for a local dry run against an in-memory
// database with every migration applied; nothing touches Supabase.
//
// Env: MLS_* (src/config.ts), DATABASE_URL, and for MLS_PHOTO_MODE=copy
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Output is counts only, never
// records or credentials. Exits 1 when the run fails.

import postgres from "postgres";
import { mlsConfig } from "../config";
import { FIXTURE_NOW } from "../fixtures";
import {
  clientEventCounter,
  createClientFromConfig,
  createSupabaseBucket,
  MemoryBucket,
  PgSyncStore,
  pgliteSql,
  postgresJsSql,
  runIncremental,
  runPurge,
  runReconcile,
  type PhotoBucket,
  type RunResult,
  type Sql,
} from "../sync";

type Command = "incremental" | "reconcile" | "purge";

export async function main(argv: string[], env: Record<string, string | undefined> = process.env): Promise<number> {
  const command = argv[0] as Command | undefined;
  const flags = new Set(argv.slice(1));
  if (!command || !["incremental", "reconcile", "purge"].includes(command)) {
    console.error("usage: mls-sync <incremental|reconcile|purge> [--confirm] [--mock] [--pglite]");
    return 2;
  }

  const cfg = mlsConfig(env);
  const useLocal = flags.has("--pglite");
  if (useLocal && cfg.mode !== "mock") {
    console.error("--pglite is for MLS_MODE=mock only");
    return 2;
  }

  let sql: Sql;
  let close: () => Promise<void>;
  if (useLocal) {
    const { createTestDb } = await import("@vabrato/db/testing");
    const t = await createTestDb();
    sql = pgliteSql(t.db);
    close = () => t.close();
  } else {
    if (!env.DATABASE_URL) {
      console.error("DATABASE_URL is not set (Supabase Postgres connection string; Render env only)");
      return 2;
    }
    // prepare:false works with Supabase's transaction pooler as well as direct connections.
    const pg = postgres(env.DATABASE_URL, { max: 1, prepare: false, ssl: "require", onnotice: () => {} });
    sql = postgresJsSql(pg);
    close = () => pg.end({ timeout: 5 });
  }

  let bucket: PhotoBucket | null = null;
  if (useLocal) bucket = new MemoryBucket();
  else if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) bucket = createSupabaseBucket(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (cfg.photoMode === "copy" && !bucket) {
    console.error("MLS_PHOTO_MODE=copy needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    await close();
    return 2;
  }

  const events = clientEventCounter();
  const { client } = createClientFromConfig(cfg, { onEvent: events.onEvent });
  const deps = {
    client,
    store: new PgSyncStore(sql),
    config: cfg,
    bucket,
    clientEvents: events,
    // The fictional fixtures are dated around FIXTURE_NOW; keep mock runs consistent with them.
    now: cfg.mode === "mock" ? () => FIXTURE_NOW : undefined,
    redact: cfg.mode === "live" ? [cfg.clientSecret, cfg.clientId] : [],
  };

  const results: RunResult[] = [];
  try {
    if (command === "purge") {
      if (!flags.has("--confirm")) {
        console.error(flags.has("--mock") ? "purge --mock deletes the fictional preview rows. Re-run with --confirm." : "purge deletes ALL MLS data (MLS-9). Re-run with --confirm.");
        return 2;
      }
      results.push(await runPurge(deps, { confirm: true, mockOnly: flags.has("--mock") }));
    } else if (command === "reconcile") {
      results.push(await runReconcile(deps));
    } else {
      // A local dry run starts from an empty database, so seed it first.
      if (useLocal) results.push(await runReconcile(deps));
      results.push(await runIncremental(deps));
    }
  } finally {
    await close();
  }

  for (const r of results) {
    console.log(JSON.stringify({ kind: r.kind, status: r.status, highWaterMark: r.highWaterMark, counts: r.counts, error: r.error }));
  }
  return results.some((r) => r.status === "failed") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      // Config errors name variables only; anything else is reduced to its first line.
      console.error((e instanceof Error ? e.message : String(e)).split("\n")[0]);
      process.exit(1);
    },
  );
}
