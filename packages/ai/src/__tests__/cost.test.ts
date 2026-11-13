import { describe, expect, it } from "vitest";
import { attemptsFrom } from "../anthropic";
import { costMicros } from "../models";
import { runAi } from "../run";
import type { AiStore, FinishInfo } from "../store";
import { fakeModel } from "../testing";

// S6b PR 9: what a request costs when the server-side fallback fires. The
// API's top-level usage covers only the attempt that answered; usage.iterations
// lists every attempt it ran (and may bill). The console's budget counts them
// all, so a fallback can't be under-counted.

const store = () => {
  const finished: FinishInfo[] = [];
  const s: AiStore = { begin: async () => ({ allowed: true, run_id: "run-1" }), finish: async (_id, info) => void finished.push(info) };
  return { s, finished };
};
const feature = { key: "staff_test" as const, system: "Test feature.", effort: "low" as const, output: { kind: "text" as const } };
const u = (inputTokens: number, outputTokens: number, cacheReadTokens = 0, cacheWriteTokens = 0) => ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens });

describe("attempts from usage.iterations", () => {
  it("maps the requested model's attempt and the fallback's, with their own models", () => {
    expect(
      attemptsFrom([
        { type: "message", model: null, input_tokens: 4000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 4000, output_tokens: 900, cache_read_input_tokens: 100, cache_creation_input_tokens: 50, cache_creation: null },
      ] as never),
    ).toEqual([
      { model: "claude-opus-5-5", usage: u(4000, 300) },
      { model: "claude-opus-4-8", usage: u(4000, 900, 100, 50) },
    ]);
  });

  it("nothing to map: no iterations, or only other kinds", () => {
    expect(attemptsFrom(null)).toBeUndefined();
    expect(attemptsFrom([])).toBeUndefined();
    expect(attemptsFrom([{ type: "compaction", input_tokens: 1, output_tokens: 1 }] as never)).toBeUndefined();
  });
});

describe("the cost runAi records", () => {
  it("one attempt: priced as before", async () => {
    const { s, finished } = store();
    await runAi({ store: s, model: fakeModel({ text: "Fine.", usage: u(5000, 400) }) }, feature, { instruction: "Say fine." });
    expect(finished[0]).toMatchObject({ status: "ok", inputTokens: 5000, outputTokens: 400, costMicros: costMicros("claude-opus-5-5", u(5000, 400)) });
  });

  it("a fallback after a mid-stream decline: both attempts counted, each at its own model's price", async () => {
    const { s, finished } = store();
    const attempts = [
      { model: "claude-opus-5-5", usage: u(5000, 250) },
      { model: "claude-opus-4-8", usage: u(5000, 600) },
    ];
    await runAi({ store: s, model: fakeModel({ text: "Fine.", model: "claude-opus-4-8", usage: u(5000, 600), attempts }) }, feature, { instruction: "Say fine." });
    const expected = costMicros("claude-opus-5-5", u(5000, 250)) + costMicros("claude-opus-4-8", u(5000, 600));
    expect(finished[0]).toMatchObject({ model: "claude-opus-4-8", inputTokens: 10000, outputTokens: 850, costMicros: expected });
    expect(expected).toBeGreaterThan(costMicros("claude-opus-4-8", u(5000, 600)));
  });

  it("a decline before any output is still counted (conservative: never under the bill)", async () => {
    const { s, finished } = store();
    const attempts = [
      { model: "claude-opus-5-5", usage: u(5000, 0) },
      { model: "claude-opus-4-8", usage: u(5000, 600) },
    ];
    await runAi({ store: s, model: fakeModel({ text: "Fine.", model: "claude-opus-4-8", usage: u(5000, 600), attempts }) }, feature, { instruction: "Say fine." });
    expect(finished[0]!.costMicros).toBe(costMicros("claude-opus-5-5", u(5000, 0)) + costMicros("claude-opus-4-8", u(5000, 600)));
  });
});
