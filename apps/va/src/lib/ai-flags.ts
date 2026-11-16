import type { SupabaseDb } from "@vabrato/lib";

export type AiMode = "off" | "live" | "test";

/**
 * Which assistant features the signed-in person can start here, from the
 * database's own answer (0044 ai_features_available, the same rule as
 * ai_begin). Live: the master switch and each feature's switch. Test mode
 * (before Zero Data Retention): named testers only, on test deals and their
 * own typed text. Pass the deal for a page about one deal. `flags` are the
 * feature switch keys (ai_staff_…), as everywhere in the console.
 */
export async function aiAccess<K extends string>(supabase: SupabaseDb, flags: K[], dealId?: string | null): Promise<{ on: Record<K, boolean>; mode: AiMode }> {
  const off = { on: Object.fromEntries(flags.map((f) => [f, false])) as Record<K, boolean>, mode: "off" as AiMode };
  const { data, error } = await supabase.rpc("ai_features_available", { p_features: flags.map((f) => f.replace(/^ai_/, "")), ...(dealId ? { p_deal: dealId } : {}) });
  if (error || !data) return off;
  const answer = data as { mode?: AiMode; features?: Record<string, boolean> };
  return {
    on: Object.fromEntries(flags.map((f) => [f, answer.features?.[f.replace(/^ai_/, "")] === true])) as Record<K, boolean>,
    mode: answer.mode === "live" || answer.mode === "test" ? answer.mode : "off",
  };
}

/** Whether each assistant feature can be started here (see aiAccess). */
export async function aiFeaturesOn<K extends string>(supabase: SupabaseDb, flags: K[], dealId?: string | null): Promise<Record<K, boolean>> {
  return (await aiAccess(supabase, flags, dealId)).on;
}
