import { describe, expect, it } from "vitest";
import type { SupabaseDb } from "@vabrato/lib";
import { aiAccess, aiFeaturesOn, aiUnavailableMessage } from "./ai-flags";

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

describe("aiUnavailableMessage", () => {
  it("live: points to the feature's own switch", () => {
    expect(aiUnavailableMessage("live", "Presentations", "fictional_listings", true)).toBe("Presentations are switched off. An admin can turn them on in Assistant settings.");
  });
  it("test mode: says why it's limited, with no switch to look for", () => {
    expect(aiUnavailableMessage("test", "Writing the response with the assistant", "test_deals")).toBe(
      "In AI test mode, writing the response with the assistant works only on test deals. This deal has real client details, so it's held until launch.",
    );
    expect(aiUnavailableMessage("test", "Presentations", "fictional_listings", true)).toBe(
      "In AI test mode, presentations work only while every MLS listing is fictional. Real listings are here now, so they're held until launch.",
    );
  });
  it("before launch for everyone else: held, and who can try it", () => {
    const m = aiUnavailableMessage("off", "Reading reports into repair items", "test_deals");
    expect(m).toBe("Reading reports into repair items is held until launch. Before then, only people an admin names as AI testers can try it.");
    expect(m).not.toMatch(/switched off|turn it on/);
  });
});
