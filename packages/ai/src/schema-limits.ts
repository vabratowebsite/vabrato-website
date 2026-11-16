// Anthropic's limits on a structured-output schema (output_config.format),
// from the structured outputs docs (read 2026-11-16, "Schema complexity
// limits"). A request over either one is refused with a 400 before the model
// runs, so runAi checks them first and CI checks every feature's schema.

export const SCHEMA_LIMITS = {
  /** Parameters that use anyOf or a type array (a nullable field counts). */
  unionParams: 16,
  /** Parameters not listed in their object's `required`. */
  optionalParams: 24,
} as const;

type Schema = Record<string, unknown>;
const isSchema = (v: unknown): v is Schema => typeof v === "object" && v !== null && !Array.isArray(v);

/** Counts a schema's union-typed and optional parameters, the way the API does: across the whole schema. */
export function schemaComplexity(schema: Schema): { unionParams: number; optionalParams: number } {
  let unionParams = 0;
  let optionalParams = 0;
  const walk = (s: unknown) => {
    if (!isSchema(s)) return;
    if (Array.isArray(s.anyOf) || Array.isArray(s.type)) unionParams++;
    if (isSchema(s.properties)) {
      const required = new Set(Array.isArray(s.required) ? s.required : []);
      for (const [key, value] of Object.entries(s.properties)) {
        if (!required.has(key)) optionalParams++;
        walk(value);
      }
    }
    if (s.items !== undefined) walk(s.items);
    for (const branch of [s.anyOf, s.allOf, s.oneOf]) if (Array.isArray(branch)) branch.forEach(walk);
    for (const defs of [s.$defs, s.definitions]) if (isSchema(defs)) Object.values(defs).forEach(walk);
  };
  walk(schema);
  return { unionParams, optionalParams };
}

/** Plain descriptions of the limits a schema breaks; empty when it's within them. */
export function schemaProblems(schema: Schema): string[] {
  const { unionParams, optionalParams } = schemaComplexity(schema);
  const problems: string[] = [];
  if (unionParams > SCHEMA_LIMITS.unionParams) problems.push(`${unionParams} nullable or union fields (the limit is ${SCHEMA_LIMITS.unionParams})`);
  if (optionalParams > SCHEMA_LIMITS.optionalParams) problems.push(`${optionalParams} optional fields (the limit is ${SCHEMA_LIMITS.optionalParams})`);
  return problems;
}
