// In-process Postgres (PGlite) with a small Supabase shim, for RLS tests.
//
// The shim recreates the parts of Supabase our migrations and policies rely
// on: the anon / authenticated / service_role roles, Supabase's default
// grants on `public`, auth.users + auth.uid() (read from the same
// request.jwt.claim.sub setting PostgREST sets), and a stub storage schema.
// Every migration in supabase/migrations then runs in order, so the tests
// exercise the exact SQL that is applied to the hosted project.
//
// Not covered here: PostGIS (not available in PGlite) and Supabase's real
// storage API. The hosted project is checked separately with the security
// advisor after each migration.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations", import.meta.url));

const SUPABASE_SHIM = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- Supabase's default privileges: API roles get table privileges on public;
-- RLS is what actually protects rows.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Role = "anon" | "authenticated" | "service_role";

export interface TestDb {
  db: PGlite;
  /** Run `fn` as an API role, optionally as a signed-in user, inside a transaction that is rolled back. */
  as<T>(role: Role, userId: string | null, fn: (q: Query) => Promise<T>): Promise<T>;
  /** Superuser query (test setup only). */
  exec(sql: string): Promise<void>;
  query: Query;
  close(): Promise<void>;
}

export type Query = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }

  const query: Query = async (sql, params) => (await db.query(sql, params)).rows as never;

  return {
    db,
    query,
    exec: async (sql) => {
      await db.exec(sql);
    },
    async as(role, userId, fn) {
      return db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
        await tx.exec(`set local role ${role}`);
        const q: Query = async (sql, params) => (await tx.query(sql, params)).rows as never;
        const result = await fn(q);
        await tx.rollback();
        return result;
      }) as Promise<never>;
    },
    close: () => db.close(),
  };
}

/** Creates an auth user (the signup trigger creates the profile) and optionally sets its role. */
export async function createUser(
  t: TestDb,
  id: string,
  opts: { role?: string; email?: string } = {},
): Promise<string> {
  await t.query(`insert into auth.users (id, email) values ($1, $2)`, [id, opts.email ?? `${id.slice(0, 8)}@example.test`]);
  if (opts.role) await t.query(`update public.profiles set role = $2 where id = $1`, [id, opts.role]);
  return id;
}
