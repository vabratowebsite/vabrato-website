import { describe, expect, it } from "vitest";
import { LIVE_CALLS } from "../live/registry";
import * as appointments from "./appointments";
import { ASSISTANT_FEATURES } from "./assistant";
import * as calls from "./calls";
import * as contract from "./contract-reader";
import * as counter from "./counter-changes";
import * as documentCheck from "./document-check";
import * as drafts from "./drafts";
import * as kits from "./kits";
import * as marketCma from "./market-cma";
import * as repairs from "./repairs";
import * as summaries from "./summaries";

// S6b PR 9: the live test covers every AI feature once. Runs in CI (no
// network): it finds every exported AiFeature value by its shape, including
// ones inside records (drafts, presentations), so a new feature without a
// live call fails here.

type Feature = { key: string; system: string; output: unknown };
const isFeature = (v: unknown): v is Feature => typeof v === "object" && v !== null && typeof (v as Feature).key === "string" && /^(staff|member)_/.test((v as Feature).key) && typeof (v as Feature).system === "string" && "output" in v;

function featuresIn(mod: Record<string, unknown>): Feature[] {
  const out: Feature[] = [];
  for (const v of Object.values(mod)) {
    if (isFeature(v)) out.push(v);
    else if (typeof v === "object" && v !== null && !Array.isArray(v)) for (const inner of Object.values(v)) if (isFeature(inner)) out.push(inner);
  }
  return out;
}

const ALL = [...new Set([appointments, calls, contract, counter, documentCheck, drafts, kits, marketCma, repairs, summaries].flatMap((m) => featuresIn(m as Record<string, unknown>)))];

describe("live test coverage", () => {
  it("every AiFeature value has exactly one live call (20 values)", () => {
    const called = LIVE_CALLS.map((c) => c.feature);
    expect(ALL).toHaveLength(20);
    expect(called).toHaveLength(ALL.length);
    for (const f of ALL) expect(called.filter((c) => c === f), f.key).toHaveLength(1);
  });

  it("the calls' feature keys are exactly the 19 switches on /assistant", () => {
    const keys = [...new Set(LIVE_CALLS.map((c) => `ai_${c.feature.key}`))].sort();
    expect(keys).toEqual(ASSISTANT_FEATURES.map((f) => f.flag).sort());
    expect(keys).toHaveLength(19);
  });

  it("call ids are unique, and the two injection pages are on document calls", () => {
    expect(new Set(LIVE_CALLS.map((c) => c.id)).size).toBe(LIVE_CALLS.length);
    expect(LIVE_CALLS.filter((c) => c.injection).map((c) => c.id)).toEqual(["document_check", "inspection_items"]);
  });
});
