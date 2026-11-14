import { MEMBER_AI_FEATURES, MLS_AI_GATE, type MemberAiFeature, type SupabaseDb } from "@vabrato/lib";
import type { Member } from "./session";

// Ask Vabrato's switches (S5b), for the menu and the page. No model code, so
// every /my page can use it.

export type MemberAiFlag = MemberAiFeature["flag"];

/**
 * Which member features are on right now: the master switch and each
 * feature's own, and for listing features the MLSListings approval. Read fresh (not the 15-minute public cache) so a switch
 * takes effect at once. ai_begin checks again in the database before any
 * model call.
 */
export async function memberAiStatus(supabase: SupabaseDb): Promise<{ on: MemberAiFlag[] }> {
  const keys = ["ai_enabled", MLS_AI_GATE, ...MEMBER_AI_FEATURES.map((f) => f.flag)];
  const { data } = await supabase.from("feature_flags").select("key, enabled").in("key", keys);
  const enabled = new Set((data ?? []).filter((r) => r.enabled).map((r) => r.key));
  if (!enabled.has("ai_enabled")) return { on: [] };
  // Listing features also need MLSListings' approval (the database enforces it too, 0039).
  return { on: MEMBER_AI_FEATURES.filter((f) => enabled.has(f.flag) && (!f.needsMlsApproval || enabled.has(MLS_AI_GATE))).map((f) => f.flag) };
}

/**
 * The listing data level a member may see (and so the most the assistant may
 * be given about a listing): VOW once sold data is on and they've accepted
 * the VOW terms, otherwise IDX. Never FULL (ACC-1).
 */
export function memberDataLevel(member: Pick<Member, "profile">, vowEnabled: boolean): "IDX" | "VOW" {
  return vowEnabled && member.profile.vow_accepted_at ? "VOW" : "IDX";
}
