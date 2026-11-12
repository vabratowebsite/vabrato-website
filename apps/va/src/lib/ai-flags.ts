import type { SupabaseDb } from "@vabrato/lib";

/** Whether each assistant feature is on: the master switch and its own switch (feature_flags). */
export async function aiFeaturesOn<K extends string>(supabase: SupabaseDb, flags: K[]): Promise<Record<K, boolean>> {
  const { data } = await supabase.from("feature_flags").select("key, enabled").in("key", ["ai_enabled", ...flags]);
  const on = new Set((data ?? []).filter((f) => f.enabled).map((f) => f.key));
  return Object.fromEntries(flags.map((f) => [f, on.has("ai_enabled") && on.has(f)])) as Record<K, boolean>;
}
