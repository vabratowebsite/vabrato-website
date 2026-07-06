import { cookies } from "next/headers";
import { createServerSupabase } from "@vabrato/lib";

export async function supabaseServer() {
  const store = await cookies();
  return createServerSupabase({
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        list.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // Server Components can't write cookies; middleware refreshes the session.
      }
    },
  });
}
