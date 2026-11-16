import { MEMBER_AI_FEATURES, type MemberAiFeature, type SupabaseDb } from "@vabrato/lib";
import type { Member } from "./session";

// Ask Vabrato's switches (S5b), for the menu and the page. No model code, so
// every /my page can use it.

export type MemberAiFlag = MemberAiFeature["flag"];

/**
 * Which member features this person can start right now, from the database's
 * own answer (0044 ai_features_available, the same rule as ai_begin): the
 * master switch and each feature's switch (listing features also need the
 * MLSListings approval, 0039), or AI test mode for a named tester (their own
 * typed text and uploads; never listing data). Read fresh, not from the
 * public cache, so a switch takes effect at once. ai_begin checks again in
 * the database before any model call.
 */
export async function memberAiStatus(supabase: SupabaseDb): Promise<{ on: MemberAiFlag[]; testMode: boolean }> {
  const { data, error } = await supabase.rpc("ai_features_available", { p_features: MEMBER_AI_FEATURES.map((f) => f.flag.replace(/^ai_/, "")) });
  if (error || !data) return { on: [], testMode: false };
  const answer = data as { mode?: string; features?: Record<string, boolean> };
  return {
    on: MEMBER_AI_FEATURES.filter((f) => answer.features?.[f.flag.replace(/^ai_/, "")] === true).map((f) => f.flag),
    testMode: answer.mode === "test",
  };
}

/**
 * The listing data level a member may see (and so the most the assistant may
 * be given about a listing): VOW once sold data is on and they've accepted
 * the VOW terms, otherwise IDX. Never FULL (ACC-1).
 */
export function memberDataLevel(member: Pick<Member, "profile">, vowEnabled: boolean): "IDX" | "VOW" {
  return vowEnabled && member.profile.vow_accepted_at ? "VOW" : "IDX";
}
