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

/** Why a feature is limited in AI test mode: only on test deals, or only while every MLS listing is fictional (0046). */
export type AiTestLimit = "test_deals" | "fictional_listings";

/**
 * What to say where an assistant feature can't be started, so the reason
 * reads the same on every page. `what` starts the sentence ("Presentations",
 * "Writing the response with the assistant"). Live: its own switch is off.
 * Test mode (the person is a tester): the feature's test-mode limit. Otherwise
 * the assistant isn't on yet: it's held until launch, and only named testers
 * can try it before then.
 */
export function aiUnavailableMessage(mode: AiMode, what: string, limit: AiTestLimit, plural = false): string {
  const be = plural ? "are" : "is";
  const work = plural ? "work" : "works";
  if (mode === "live") return `${what} ${be} switched off. An admin can turn ${plural ? "them" : "it"} on in Assistant settings.`;
  if (mode === "test")
    return limit === "test_deals"
      ? `In AI test mode, ${lower(what)} ${work} only on test deals. This deal has real client details, so it's held until launch.`
      : `In AI test mode, ${lower(what)} ${work} only while every MLS listing is fictional. Real listings are here now, so ${plural ? "they're" : "it's"} held until launch.`;
  return `${what} ${be} held until launch. Before then, only people an admin names as AI testers can try ${plural ? "them" : "it"}.`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Where a feature is allowed but this server has no assistant key. */
export const NO_KEY_NOTE = "The assistant isn't set up yet: it has no API key. Ask an admin.";
