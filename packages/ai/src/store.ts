import type { AiBegin } from "@vabrato/db";
import type { SupabaseDb } from "@vabrato/lib";

// Switches, limits and the usage log live in the database (0026). The
// pipeline talks to them through this interface; tests use PGlite.

export interface FinishInfo {
  status: "ok" | "blocked_input" | "blocked_output" | "refused" | "error";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  costMicros?: number;
  durationMs?: number;
}

export interface AiStore {
  begin(feature: string, dealId?: string | null): Promise<AiBegin>;
  finish(runId: string, info: FinishInfo): Promise<void>;
}

/** Uses the signed-in person's own client, so the database knows who is asking. */
export function supabaseAiStore(supabase: SupabaseDb): AiStore {
  return {
    async begin(feature, dealId) {
      const { data, error } = await supabase.rpc("ai_begin", { p_feature: feature, ...(dealId ? { p_deal: dealId } : {}) });
      if (error) throw new Error(`ai_begin failed: ${error.message}`);
      return data as unknown as AiBegin;
    },
    async finish(runId, info) {
      const { error } = await supabase.rpc("ai_finish", {
        p_run: runId,
        p_status: info.status,
        ...(info.model ? { p_model: info.model } : {}),
        p_input_tokens: info.inputTokens ?? 0,
        p_output_tokens: info.outputTokens ?? 0,
        p_cache_read_tokens: info.cacheReadTokens ?? 0,
        p_cost_micros: info.costMicros ?? 0,
        ...(info.durationMs !== undefined ? { p_duration_ms: Math.round(info.durationMs) } : {}),
      });
      if (error) throw new Error(`ai_finish failed: ${error.message}`);
    },
  };
}
