import { describe, expect, it } from "vitest";
import { budgetStore, sanitize, worstCase } from "../live";
import type { AiFeature } from "../run";

// The live tests' shared helpers (@vabrato/ai/live): the spending cap must
// stop a call before anything is sent, and reports must carry no keys.

const feature: AiFeature<string> = { key: "member_test", system: "x".repeat(300), effort: "low", maxTokens: 1000, output: { kind: "text" } };

describe("live test helpers", () => {
  it("worst case: input from the text, output at the feature's limit, both attempts billed", () => {
    const w = worstCase(feature, { instruction: "y".repeat(300), parts: [{ type: "text", text: "z".repeat(300) }] });
    expect(w.inputTokens).toBe(300 + 2000);
    expect(w.outputTokens).toBe(1000);
    expect(w.usd).toBeCloseTo((2300 * 9 + 1000 * 45) / 1e6, 8);
  });

  it("a PDF's pages count; an unreadable one counts as 100 pages", () => {
    const pdf = Buffer.from("%PDF-1.4\n<< /Type /Pages /Count 4 >>").toString("base64");
    const bad = Buffer.from("%PDF-1.5 compressed").toString("base64");
    const base = worstCase(feature, {}).inputTokens;
    expect(worstCase(feature, { parts: [{ type: "pdf", data: pdf, title: "Fixture" }] }).inputTokens - base).toBe(4 * 5000);
    expect(worstCase(feature, { parts: [{ type: "pdf", data: bad, title: "Fixture" }] }).inputTokens - base).toBe(100 * 5000);
  });

  it("the cap refuses a call whose worst case would pass it, and counts what was spent", async () => {
    const b = budgetStore(0.05);
    b.expect({ inputTokens: 0, outputTokens: 0, usd: 0.04 });
    expect(await b.store.begin("member_test", null)).toMatchObject({ allowed: true });
    await b.store.finish("live-1", { status: "ok", model: "m", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costMicros: 30_000, durationMs: 1 });
    expect(b.spentUsd()).toBeCloseTo(0.03, 8);
    b.expect({ inputTokens: 0, outputTokens: 0, usd: 0.03 });
    expect(await b.store.begin("member_test", null)).toEqual({ allowed: false, reason: "monthly_budget" });
  });

  it("sanitize removes keys and long numbers and keeps reasons short", () => {
    expect(sanitize("bad key sk-ant-fake-abc_DEF-123 for 1234567890")).toBe("bad key [key] for [number]");
    expect(sanitize("x".repeat(200))).toHaveLength(80);
  });
});
