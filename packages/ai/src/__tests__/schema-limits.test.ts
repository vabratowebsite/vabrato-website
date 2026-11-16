import { describe, expect, it } from "vitest";
import { runAi, type AiFeature } from "../run";
import { SCHEMA_LIMITS, schemaComplexity, schemaProblems } from "../schema-limits";
import type { AiStore } from "../store";
import { fakeModel } from "../testing";

// Anthropic refuses a structured-output schema with more than 16 nullable or
// union fields, or more than 24 optional ones, with a 400 before the model
// runs. The first live run (2026-11-16) found two console features over the
// first limit; these checks keep any feature from shipping like that again.

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const objectOf = (n: number, field: (i: number) => Record<string, unknown>, required = true) => {
  const properties = Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, field(i)]));
  return { type: "object", properties, required: required ? Object.keys(properties) : [], additionalProperties: false };
};

describe("schema limits", () => {
  it("counts nullable fields, type arrays and optional fields at every depth", () => {
    const schema = {
      type: "object",
      properties: {
        a: nullable("string"),
        b: { type: ["integer", "null"] },
        c: { type: "object", properties: { d: nullable("string"), e: { type: "string" } }, required: ["d"], additionalProperties: false },
        f: { type: "array", items: { type: "object", properties: { g: nullable("integer") }, required: [], additionalProperties: false } },
      },
      required: ["a", "b", "c"],
      additionalProperties: false,
    };
    expect(schemaComplexity(schema)).toEqual({ unionParams: 4, optionalParams: 3 });
  });

  it("allows exactly the limits and names what's over them", () => {
    expect(schemaProblems(objectOf(SCHEMA_LIMITS.unionParams, () => nullable("string")))).toEqual([]);
    expect(schemaProblems(objectOf(SCHEMA_LIMITS.unionParams + 1, () => nullable("string")))).toEqual(["17 nullable or union fields (the limit is 16)"]);
    expect(schemaProblems(objectOf(SCHEMA_LIMITS.optionalParams, () => ({ type: "string" }), false))).toEqual([]);
    expect(schemaProblems(objectOf(SCHEMA_LIMITS.optionalParams + 1, () => ({ type: "string" }), false))).toEqual(["25 optional fields (the limit is 24)"]);
  });

  it("runAi refuses a feature over the limits before any switch, limit or model call", async () => {
    const untouched = new Proxy({}, { get: () => () => Promise.reject(new Error("the store must not be used")) }) as AiStore;
    const model = fakeModel("{}");
    const TOO_BIG: AiFeature<unknown> = { key: "staff_test_too_big", system: "Read the contract.", effort: "low", output: { kind: "json", jsonSchema: objectOf(17, () => nullable("string")), parse: (v) => v } };
    await expect(runAi({ store: untouched, model }, TOO_BIG, { instruction: "Fictional text." })).rejects.toThrow(/over Anthropic's limits: 17 nullable or union fields/);
    expect(model.requests).toHaveLength(0);
  });
});
