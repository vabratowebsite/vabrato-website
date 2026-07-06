import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile, UserRole } from "@vabrato/db";
import { publicEnv, serverEnv } from "../env";

export type SupabaseDb = SupabaseClient<Database>;

// Framework-agnostic cookie adapter; Next apps pass a wrapper around
// `cookies()` from next/headers.
export interface CookieAdapter {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options: CookieOptions }[]): void;
}

export function createServerSupabase(cookies: CookieAdapter): SupabaseDb {
  const env = publicEnv();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies },
  );
}

// Service-role client for trusted server contexts only (inbound-email webhook,
// notification scheduler). Bypasses RLS — never expose to request handlers
// that echo data back to users without their own access checks.
export function createServiceSupabase(): SupabaseDb {
  const env = serverEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verified auth user (server-validated, not just the cookie claim) or null. */
export async function getAuthUser(supabase: SupabaseDb) {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}

export async function getProfile(supabase: SupabaseDb): Promise<Profile | null> {
  const user = await getAuthUser(supabase);
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
}

export class UnauthorizedError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Throws unless the signed-in user's role is one of `roles`. */
export async function requireRole(supabase: SupabaseDb, roles: UserRole[]): Promise<Profile> {
  const profile = await getProfile(supabase);
  if (!profile || !roles.includes(profile.role)) {
    throw new UnauthorizedError(`Requires role: ${roles.join(" | ")}`);
  }
  return profile;
}

export const STAFF_ROLES: UserRole[] = ["admin", "agent", "va", "tc"];
