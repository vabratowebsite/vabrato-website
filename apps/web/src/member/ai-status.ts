import { MEMBER_AI_FEATURES, type MemberAiFeature, type SupabaseDb } from "@vabrato/lib";
import type { Member } from "./session";

// Ask Vabrato's switches (S5b), for the menu and the page. No model code, so
// every /my page can use it.

export type MemberAiFlag = MemberAiFeature["flag"];

/**
 * Which member features are on right now: the master switch and each
 * feature's own. Read fresh (not the 15-minute public cache) so a switch
 * takes effect at once. ai_begin checks again in the database before any
 * model call.
 */
export async function memberAiStatus(supabase: SupabaseDb): Promise<{ on: MemberAiFlag[] }> {
  const keys = ["ai_enabled", ...MEMBER_AI_FEATURES.map((f) => f.flag)];
  const { data } = await supabase.from("feature_flags").select("key, enabled").in("key", keys);
  const enabled = new Set((data ?? []).filter((r) => r.enabled).map((r) => r.key));
  if (!enabled.has("ai_enabled")) return { on: [] };
  return { on: MEMBER_AI_FEATURES.map((f) => f.flag).filter((k) => enabled.has(k)) };
}

/**
 * The listing data level a member may see (and so the most the assistant may
 * be given about a listing): VOW once sold data is on and they've accepted
 * the VOW terms, otherwise IDX. Never FULL (ACC-1).
 */
export function memberDataLevel(member: Pick<Member, "profile">, vowEnabled: boolean): "IDX" | "VOW" {
  return vowEnabled && member.profile.vow_accepted_at ? "VOW" : "IDX";
}
