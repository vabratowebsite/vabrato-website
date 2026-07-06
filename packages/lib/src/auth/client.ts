import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@vabrato/db";

// NEXT_PUBLIC_* must be referenced literally so Next.js inlines them into
// client bundles — don't route these through publicEnv().
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)",
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
