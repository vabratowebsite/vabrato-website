import { describe, expect, it } from "vitest";
import { MEMBER_AI_FEATURES, memberFeatureKey } from "@vabrato/lib";
import { LIVE_CALLS } from "../../live/registry";
import * as features from "./features";
import * as design from "./design";
import * as schedules from "./schedules";

// S5b: the website's live test covers every member AI feature once. Runs in CI
// (no network): it finds every exported AiFeature value by its shape, so a new
// member feature without a live call, or without a switch, fails here.

type Feature = { key: string; system: string; output: unknown };
const isFeature = (v: unknown): v is Feature => typeof v === "object" && v !== null && typeof (v as Feature).key === "string" && /^member_/.test((v as Feature).key) && typeof (v as Feature).system === "string" && "output" in v;
const ALL = [features, schedules, design].flatMap((m) => Object.values(m as Record<string, unknown>)).filter(isFeature);

describe("member assistant coverage", () => {
  it("every member AiFeature has exactly one live call", () => {
    expect(ALL.length).toBeGreaterThan(0);
    const called = LIVE_CALLS.map((c) => c.feature);
    expect(called).toHaveLength(ALL.length);
    for (const f of ALL) expect(called.filter((c) => c === f), f.key).toHaveLength(1);
  });

  it("the features' keys are exactly the member switches the console shows", () => {
    expect(ALL.map((f) => f.key).sort()).toEqual(MEMBER_AI_FEATURES.map((f) => memberFeatureKey(f.flag)).sort());
  });

  it("call ids are unique; the sentence search, the document and the listing remarks carry injections", () => {
    expect(new Set(LIVE_CALLS.map((c) => c.id)).size).toBe(LIVE_CALLS.length);
    expect(LIVE_CALLS.filter((c) => c.injection).map((c) => c.id).sort()).toEqual(["listing", "search", "summarize"]);
  });
});
