// Tiny SQL abstraction so the same store code runs on the Render job
// (postgres.js over DATABASE_URL, service-level access) and in tests (PGlite
// with the real migrations).

export interface Sql {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<R[]>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

/** Structural type of a PGlite instance (avoids a runtime dependency on PGlite). */
interface PgliteLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  transaction<T>(fn: (tx: { query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }> }) => Promise<T>): Promise<T>;
}

export function pgliteSql(db: PgliteLike): Sql {
  const wrap = (q: PgliteLike["query"]): Sql["query"] =>
    (async (text: string, params?: unknown[]) => (await q(text, params)).rows) as Sql["query"];
  return {
    query: wrap(db.query.bind(db)),
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: wrap(tx.query.bind(tx)),
          transaction: () => Promise.reject(new Error("Nested transactions are not supported")),
        }),
      ),
  };
}

/** Structural type of a postgres.js `sql` instance. */
interface PostgresJsLike {
  unsafe(text: string, params?: never[]): Promise<unknown[]>;
  begin<T>(fn: (tx: { unsafe(text: string, params?: never[]): Promise<unknown[]> }) => Promise<T>): Promise<unknown>;
}

export function postgresJsSql(sql: PostgresJsLike): Sql {
  const run = (u: PostgresJsLike["unsafe"]): Sql["query"] =>
    (async (text: string, params?: unknown[]) => [...(await u(text, (params ?? []) as never[]))]) as Sql["query"];
  return {
    query: run(sql.unsafe.bind(sql)),
    transaction: async <T>(fn: (tx: Sql) => Promise<T>) =>
      (await sql.begin((tx) =>
        fn({
          query: run(tx.unsafe.bind(tx)),
          transaction: () => Promise.reject(new Error("Nested transactions are not supported")),
        }),
      )) as T,
  };
}
