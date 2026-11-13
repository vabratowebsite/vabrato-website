import { anthropicClient, supabaseAiStore, type AiDeps } from "@vabrato/ai";
import type { SupabaseDb } from "@vabrato/lib";

// Server-side only: what the guarded pipeline (packages/ai) needs to run a
// request for the signed-in member (S5b). The store uses the member's own
// cookie client, so ai_begin sees the member: their role, their daily limits.
// The log line carries metadata only (feature, outcome, tokens, time), never
// the question or the answer.

export const aiKeyConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export function aiDeps(supabase: SupabaseDb): AiDeps {
  return {
    store: supabaseAiStore(supabase),
    model: anthropicClient(),
    log: (e) => console.info("[ai]", JSON.stringify(e)),
  };
}
