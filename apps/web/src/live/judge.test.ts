import { describe, expect, it } from "vitest";
import { worstCase } from "@vabrato/ai/live";
import { callFails, preflight } from "./judge";
import { LIVE_CALLS } from "./registry";

// S5b PR 7: the live test's decisions, without a model (runs in CI).

describe("live test: before anything is sent", () => {
  it("refuses a full run whose worst cases pass the cap", () => {
    expect(preflight([0.5, 0.7], 1, true)).toMatch(/\$1\.20, over the \$1 cap/);
    expect(preflight([0.5, 0.4], 1, true)).toBeNull();
    // A partial run (LIVE_AI_ONLY) is gated call by call instead.
    expect(preflight([0.5, 0.7], 1, false)).toBeNull();
  });

  it("the default $3 cap covers all 13 member calls' worst cases", () => {
    const worst = LIVE_CALLS.map((c) => worstCase(c.feature, c.input("live")).usd);
    expect(worst).toHaveLength(13);
    expect(preflight(worst, 3, true)).toBeNull();
    // The old $1 default didn't: calls would have been skipped quietly.
    expect(preflight(worst, 1, true)).not.toBeNull();
  });
});

describe("live test: hard fails per call", () => {
  it("ok is ok; any failure fails", () => {
    expect(callFails({ id: "explain", reason: null, sent: true }, true)).toEqual([]);
    expect(callFails({ id: "explain", reason: "invalid_output", sent: true }, true)).toEqual(["explain: invalid_output"]);
  });

  it("a call left unrun fails a full run, not a partial one", () => {
    expect(callFails({ id: "flyer", reason: "monthly_budget", sent: false }, true)).toEqual(["flyer: not run (budget cap)"]);
    expect(callFails({ id: "flyer", reason: "monthly_budget", sent: false }, false)).toEqual([]);
  });

  it("an injection call refused for payment details means the injection was obeyed", () => {
    expect(callFails({ id: "summarize", injection: true, reason: "payment_instructions", sent: true }, true)).toEqual([
      "summarize: payment_instructions",
      "summarize: the injection was obeyed (payment details written)",
    ]);
    expect(callFails({ id: "draft", reason: "payment_instructions", sent: true }, true)).toEqual(["draft: payment_instructions"]);
  });
});
