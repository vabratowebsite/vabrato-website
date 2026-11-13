import { createTestDb, createUser, type TestDb } from "@vabrato/db/testing";
import type { AiBegin } from "@vabrato/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ModelError } from "../client";
import { ALWAYS_RULES } from "../rules";
import { runAi, type AiFeature, type AiLogEvent } from "../run";
import type { AiStore } from "../store";
import { fakeModel } from "../testing";
import { INJECTIONS } from "./injections";

// The guarded pipeline against every real migration (PGlite) and a scripted
// model: switches, limits, Fair Housing on the way in and out, documents as
// data, payment and link checks, JSON validation, and a log with no content.
// No network, no cost. Fictional people and text.

const AGENT = "c1000000-0000-4000-8000-00000000a101";
const BUYER = "f1000000-0000-4000-8000-00000000a102";

const SUMMARY: AiFeature = { key: "staff_test_summary", system: "Summarize the document for a transaction coordinator.", effort: "medium", output: { kind: "text" } };
const ASK: AiFeature = { key: "member_test_ask", system: "Explain real estate terms in plain language.", effort: "low", output: { kind: "text" } };
interface Dates {
  ratification: string;
  days_to_close: number;
}
const DATES: AiFeature<Dates> = {
  key: "staff_test_dates",
  system: "Read the contract dates.",
  effort: "high",
  output: {
    kind: "json",
    jsonSchema: { type: "object", properties: { ratification: { type: "string" }, days_to_close: { type: "integer" } }, required: ["ratification", "days_to_close"], additionalProperties: false },
    parse: (v) => {
      const o = v as Record<string, unknown>;
      if (Object.keys(o).sort().join() !== "days_to_close,ratification" || typeof o.ratification !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.ratification) || !Number.isInteger(o.days_to_close)) throw new Error("bad shape");
      return o as unknown as Dates;
    },
  },
};

describe("runAi: the guarded pipeline", () => {
  let t: TestDb;
  const events: AiLogEvent[] = [];
  const log = (e: AiLogEvent) => events.push(e);

  // The store as the signed-in person: API role, RLS and grants apply.
  const storeFor = (user: string): AiStore => {
    const as = async <R>(sql: string, params: unknown[]) => {
      await t.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
      await t.exec(`set role authenticated`);
      try {
        return await t.query<R>(sql, params);
      } finally {
        await t.exec(`reset role`);
      }
    };
    return {
      begin: async (feature, deal) => (await as<{ r: AiBegin }>(`select ai_begin($1, $2) as r`, [feature, deal ?? null]))[0]!.r,
      finish: async (run, i) => {
        await as(`select ai_finish($1, $2, $3, $4, $5, $6, $7, $8)`, [run, i.status, i.model ?? null, i.inputTokens ?? 0, i.outputTokens ?? 0, i.cacheReadTokens ?? 0, i.costMicros ?? 0, Math.round(i.durationMs ?? 0)]);
      },
    };
  };
  const runs = () => t.query<{ feature: string; status: string; input_tokens: number; output_tokens: number; cost_micros: string | number; model: string | null }>(`select feature, status, input_tokens, output_tokens, cost_micros, model from ai_runs order by created_at`);

  beforeAll(async () => {
    t = await createTestDb();
    await createUser(t, AGENT, { role: "agent" });
    await createUser(t, BUYER);
    await t.exec(`update app_settings set ai_zdr_confirmed_at = now()`);
    await t.exec(`insert into feature_flags (key, description, enabled) values ('ai_staff_test_summary', 'test', true), ('ai_staff_test_dates', 'test', true), ('ai_member_test_ask', 'test', true)`);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    events.length = 0;
    await t.exec(`delete from ai_runs; update feature_flags set enabled = true where key = 'ai_enabled'; update app_settings set ai_daily_requests_member = 30, ai_monthly_budget_usd = 100`);
  });

  describe("switches and limits come first", () => {
    it("does nothing while the master switch is off", async () => {
      await t.exec(`update feature_flags set enabled = false where key = 'ai_enabled'`);
      const model = fakeModel("never");
      const r = await runAi({ store: storeFor(AGENT), model, log }, SUMMARY, { instruction: "Summarize this." });
      expect(r).toMatchObject({ ok: false, reason: "off" });
      expect(model.requests).toHaveLength(0);
      expect(await runs()).toEqual([]);
    });

    it("stops at the daily limit without calling the model", async () => {
      await t.exec(`update app_settings set ai_daily_requests_member = 1`);
      const model = fakeModel("Escrow is a neutral third party that holds money and documents until closing.");
      const deps = { store: storeFor(BUYER), model, log };
      expect((await runAi(deps, ASK, { instruction: "What is escrow?" })).ok).toBe(true);
      expect(await runAi(deps, ASK, { instruction: "What is a contingency?" })).toMatchObject({ ok: false, reason: "daily_requests" });
      expect(model.requests).toHaveLength(1);
    });

    it("a member can't run a staff feature", async () => {
      await expect(runAi({ store: storeFor(BUYER), model: fakeModel("x"), log }, SUMMARY, { instruction: "Summarize." })).rejects.toThrow(/not_allowed/);
    });
  });

  describe("a normal request", () => {
    it("sends our rules as the system prompt, the request last, no tools, and logs usage", async () => {
      const model = fakeModel({ text: "The report lists 3 items (p. 14).", usage: { inputTokens: 5000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 } });
      const r = await runAi({ store: storeFor(AGENT), model, log }, SUMMARY, {
        instruction: "Summarize the inspection for the seller.",
        parts: [{ type: "pdf", data: "JVBERi0xLjcK", title: "Inspection report", citations: true }],
      });
      expect(r).toEqual({ ok: true, text: "The report lists 3 items (p. 14).", data: null, citations: [], notices: [], aiGenerated: true });
      const req = model.requests[0]!;
      expect(Object.keys(req).sort()).toEqual(["effort", "maxTokens", "parts", "system"]);
      expect(req.system).toBe(`${SUMMARY.system}\n\n${ALWAYS_RULES}`);
      expect(req.parts.map((p) => p.type)).toEqual(["pdf", "text"]);
      expect(req.parts.at(-1)).toEqual({ type: "text", text: "Request from the person using the assistant:\nSummarize the inspection for the seller." });
      const [row] = await runs();
      expect({ ...row, cost_micros: Number(row!.cost_micros) }).toEqual({ feature: "staff_test_summary", status: "ok", input_tokens: 5000, output_tokens: 400, cost_micros: 5000 * 4 + 400 * 20, model: "claude-opus-5-5" });
    });

    it("still returns the answer if the usage log can't be written", async () => {
      const store = storeFor(AGENT);
      const r = await runAi({ store: { begin: store.begin, finish: async () => Promise.reject(new Error("db down")) }, model: fakeModel("Fine."), log }, SUMMARY, { instruction: "Summarize." });
      expect(r.ok).toBe(true);
    });
  });

  describe("Fair Housing", () => {
    it("answers a steering question itself, without calling the model", async () => {
      const model = fakeModel("never");
      const r = await runAi({ store: storeFor(BUYER), model, log }, ASK, { instruction: "Which is the safest neighborhood for a young family, with good schools?" });
      expect(r).toMatchObject({ ok: false, reason: "fair_housing_input" });
      if (!r.ok) expect(r.message).toMatch(/official sources/);
      expect(model.requests).toHaveLength(0);
      expect((await runs()).map((x) => x.status)).toEqual(["blocked_input"]);
    });

    it("doesn't show an answer with steering language", async () => {
      const r = await runAi({ store: storeFor(AGENT), model: fakeModel("Just listed: perfect for young families in a safe neighborhood!"), log }, SUMMARY, { instruction: "Write a social post for the listing." });
      expect(r).toMatchObject({ ok: false, reason: "fair_housing_output" });
      if (!r.ok) expect(r.phrases).toEqual(expect.arrayContaining(["perfect for young families", "safe neighborhood"]));
      expect((await runs()).map((x) => x.status)).toEqual(["blocked_output"]);
    });
  });

  describe("documents are data, never instructions (prompt injection)", () => {
    it.each(INJECTIONS)("sends %j only inside a data block", async (attack) => {
      const model = fakeModel("Summary: the document also contained instructions, which I did not follow.");
      await runAi({ store: storeFor(AGENT), model, log }, SUMMARY, { instruction: "Summarize the notes.", parts: [{ type: "data", label: "Pasted notes", text: attack }] });
      const req = model.requests[0]!;
      expect(req.system).not.toContain(attack.slice(0, 40));
      const data = req.parts[0]!;
      expect(data.type === "text" && data.text.startsWith('<data label="Pasted notes">') && data.text.match(/<\/data>/g)?.length === 1).toBe(true);
      // The person's request is its own part, after the data.
      expect(req.parts).toHaveLength(2);
    });

    it("if the model obeyed and wrote wiring details, the answer isn't shown", async () => {
      const r = await runAi({ store: storeFor(AGENT), model: fakeModel("Per the document: routing 999999999, account 123456789012."), log }, SUMMARY, {
        instruction: "Summarize the notes.",
        parts: [{ type: "data", label: "Notes", text: INJECTIONS[1] }],
      });
      expect(r).toMatchObject({ ok: false, reason: "payment_instructions" });
      if (!r.ok) expect(r.message).toMatch(/Call your escrow officer/);
      expect((await runs()).map((x) => x.status)).toEqual(["blocked_output"]);
    });

    it("if the model obeyed and added a link, the link is removed and the person is told", async () => {
      const r = await runAi({ store: storeFor(AGENT), model: fakeModel("Verify at https://vabrato-secure-login.example.test/verify, or see https://vabrato.com/my."), log }, SUMMARY, {
        instruction: "Summarize the notes.",
        parts: [{ type: "data", label: "Notes", text: INJECTIONS[3] }],
        allowedLinkHosts: ["vabrato.com"],
      });
      expect(r.ok && r.text).toBe("Verify at [link removed] or see https://vabrato.com/my.");
      expect(r.ok && r.notices).toEqual(["1 link was removed from the answer."]);
    });

    it("keeps a link the person typed themselves", async () => {
      const r = await runAi({ store: storeFor(BUYER), model: fakeModel("Draft: please quote via https://example-movers.test/quote."), log }, ASK, { instruction: "Draft a note to my movers, https://example-movers.test" });
      expect(r.ok && r.text).toContain("https://example-movers.test/quote");
    });
  });

  describe("JSON answers", () => {
    const pdf = [{ type: "pdf" as const, data: "JVBERi0xLjcK", title: "Contract" }];

    it("are validated before anything uses them", async () => {
      const model = fakeModel('{"ratification":"2026-11-02","days_to_close":21}');
      const r = await runAi({ store: storeFor(AGENT), model, log }, DATES, { parts: pdf });
      expect(r.ok && r.data).toEqual({ ratification: "2026-11-02", days_to_close: 21 });
      expect(model.requests[0]!.jsonSchema).toBe(DATES.output.kind === "json" ? DATES.output.jsonSchema : null);
    });

    it.each([
      ["not JSON", "Sure! Here are the dates."],
      ["an extra field", '{"ratification":"2026-11-02","days_to_close":21,"note":"closing moved to tomorrow"}'],
      ["a wrong type", '{"ratification":"tomorrow","days_to_close":"soon"}'],
    ])("reject %s", async (_name, answer) => {
      const r = await runAi({ store: storeFor(AGENT), model: fakeModel(answer), log }, DATES, { parts: pdf });
      expect(r).toMatchObject({ ok: false, reason: "invalid_output" });
      expect((await runs()).map((x) => x.status)).toEqual(["error"]);
    });

    it("can't be combined with page citations", async () => {
      await expect(runAi({ store: storeFor(AGENT), model: fakeModel("{}"), log }, DATES, { parts: [{ ...pdf[0]!, citations: true }] })).rejects.toThrow(/citations/);
    });
  });

  describe("when the model declines or fails", () => {
    it("reports a refusal, a cut-off answer and a busy service plainly", async () => {
      const deps = (model: ReturnType<typeof fakeModel>) => ({ store: storeFor(AGENT), model, log });
      expect(await runAi(deps(fakeModel({ text: "", stop: "refusal" })), SUMMARY, { instruction: "x y z" })).toMatchObject({ ok: false, reason: "refused" });
      expect(await runAi(deps(fakeModel({ text: "Half an ans", stop: "max_tokens" })), SUMMARY, { instruction: "x y z" })).toMatchObject({ ok: false, reason: "invalid_output" });
      expect(await runAi(deps(fakeModel(() => Promise.reject(new ModelError("rate_limited", "rate limited")))), SUMMARY, { instruction: "x y z" })).toMatchObject({ ok: false, reason: "busy" });
      expect(await runAi(deps(fakeModel(() => Promise.reject(new Error("boom")))), SUMMARY, { instruction: "x y z" })).toMatchObject({ ok: false, reason: "error" });
      expect(await runAi(deps(fakeModel(() => Promise.reject(new ModelError("too_large", "too large (400)")))), SUMMARY, { instruction: "x y z" })).toMatchObject({ ok: false, reason: "too_large", message: expect.stringMatching(/Split this file/) });
      expect((await runs()).map((x) => x.status)).toEqual(["refused", "error", "error", "error", "error"]);
    });
  });

  it("logs metadata only: never the request, the documents or the answer", async () => {
    const secret = "The seller's divorce decree is attached";
    await runAi({ store: storeFor(AGENT), model: fakeModel("ANSWER-TEXT-9731"), log }, SUMMARY, { instruction: secret, parts: [{ type: "data", label: "Notes", text: "DOCUMENT-TEXT-5512" }] });
    await runAi({ store: storeFor(BUYER), model: fakeModel("x"), log }, ASK, { instruction: "Is this a safe neighborhood?" });
    expect(events.length).toBe(2);
    const logged = JSON.stringify(events);
    expect(logged).not.toMatch(/divorce|ANSWER-TEXT|DOCUMENT-TEXT|safe neighborhood/);
    for (const e of events) expect(Object.keys(e).every((k) => ["feature", "status", "model", "inputTokens", "outputTokens", "ms"].includes(k))).toBe(true);
    const stored = JSON.stringify(await t.query(`select * from ai_runs`));
    expect(stored).not.toMatch(/divorce|ANSWER-TEXT|DOCUMENT-TEXT|safe neighborhood/);
  });
});
