import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@vabrato/lib";

// Signed-out, cookie-less client for public pages: always the `anon` role, so
// RLS returns IDX data only (MLS-4/6/7). Responses are cached by Next for at
// most 15 minutes and tagged so the sync job can revalidate sooner (review
// item 6). Lives in lib/public, which the data-level guard test scans.

export const MLS_REVALIDATE_SECONDS = 900;
export const MLS_CACHE_TAG = "mls";
export const CONTENT_CACHE_TAG = "content";

let client: SupabaseClient | null = null;

export function publicSupabase(): SupabaseClient {
  if (client) return client;
  const env = publicEnv();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          next: { revalidate: MLS_REVALIDATE_SECONDS, tags: [MLS_CACHE_TAG, CONTENT_CACHE_TAG] },
        } as RequestInit),
    },
  });
  return client;
}
