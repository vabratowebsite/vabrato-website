import { describe, expect, it } from "vitest";
import type { SupabaseDb } from "@vabrato/lib";
import { aiAccess, aiFeaturesOn } from "./ai-flags";

// The console shows an assistant feature only when the database says it can
// be started (0044 ai_features_available): this checks how its answer is read.

function fake(answer: unknown, error: unknown = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: answer, error };
    },
  } as unknown as SupabaseDb;
  return { supabase, calls };
}

describe("aiAccess", () => {
  it("asks for the features without the ai_ prefix, with the deal when given", async () => {
    const { supabase, calls } = fake({ mode: "test", features: { staff_document_check: true, staff_counter_changes: false } });
    const r = await aiAccess(supabase, ["ai_staff_document_check", "ai_staff_counter_changes"], "deal-1");
    expect(calls).toEqual([{ fn: "ai_features_available", args: { p_features: ["staff_document_check", "staff_counter_changes"], p_deal: "deal-1" } }]);
    expect(r).toEqual({ mode: "test", on: { ai_staff_document_check: true, ai_staff_counter_changes: false } });
  });

  it("sends no deal for pages that aren't about one", async () => {
    const { supabase, calls } = fake({ mode: "live", features: { staff_daily_briefing: true } });
    expect(await aiFeaturesOn(supabase, ["ai_staff_daily_briefing"])).toEqual({ ai_staff_daily_briefing: true });
    expect(calls[0]!.args).toEqual({ p_features: ["staff_daily_briefing"] });
  });

  it("anything missing, odd or failed counts as off", async () => {
    expect(await aiAccess(fake(null, { message: "boom" }).supabase, ["ai_staff_receipt_reader"])).toEqual({ mode: "off", on: { ai_staff_receipt_reader: false } });
    expect(await aiAccess(fake({ mode: "weird", features: { staff_receipt_reader: "yes" } }).supabase, ["ai_staff_receipt_reader"])).toEqual({ mode: "off", on: { ai_staff_receipt_reader: false } });
    expect(await aiAccess(fake({ mode: "live" }).supabase, ["ai_staff_receipt_reader"])).toEqual({ mode: "live", on: { ai_staff_receipt_reader: false } });
  });
});
