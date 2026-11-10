import { cookies } from "next/headers";
import { createServerSupabase, type SupabaseDb } from "@vabrato/lib";

// Signed-in (cookie) Supabase client for /my, /auth and member API routes.
// Requests run as the member, so RLS decides what they see. Never use it on
// cached public pages; those use lib/public/supabase.ts (anon only).
export async function memberSupabase(): Promise<SupabaseDb> {
  const store = await cookies();
  return createServerSupabase({
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        list.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // Server Components can't write cookies; middleware refreshes them.
      }
    },
  });
}
