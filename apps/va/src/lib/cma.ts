// CMA subject and search criteria (S6 PR 5). Only these keys are stored
// (0025 cma_subject_ok): the agent's own description of the subject and the
// search they ran, never MLS fields.

export const SUB_TYPES = ["Single Family Residence", "Condominium", "Townhouse"] as const;

export interface CmaSubject {
  city_slug: string;
  sub_type?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  min_beds?: number;
  max_beds?: number;
  min_baths?: number;
  min_sqft?: number;
  max_sqft?: number;
  months?: number;
  notes?: string;
}

type Source = { get(name: string): FormDataEntryValue | string | null };

const int = (src: Source, name: string, min: number, max: number): number | undefined | null => {
  const raw = String(src.get(name) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export function parseCmaSubject(src: Source): { ok: true; subject: CmaSubject } | { ok: false; error: string } {
  const city_slug = String(src.get("city") ?? "").trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(city_slug)) return { ok: false, error: "Pick a city." };
  const subject: CmaSubject = { city_slug };
  const sub = String(src.get("sub_type") ?? "").trim();
  if (sub) {
    if (!(SUB_TYPES as readonly string[]).includes(sub)) return { ok: false, error: "Pick a property type." };
    subject.sub_type = sub;
  }
  const fields: [keyof CmaSubject, number, number][] = [
    ["beds", 0, 20],
    ["baths", 0, 20],
    ["sqft", 100, 20000],
    ["min_beds", 0, 20],
    ["max_beds", 0, 20],
    ["min_baths", 0, 20],
    ["min_sqft", 0, 20000],
    ["max_sqft", 0, 20000],
    ["months", 1, 24],
  ];
  for (const [name, min, max] of fields) {
    const v = int(src, name, min, max);
    if (v === null) return { ok: false, error: `Check the ${name.replace("_", " ")} value (a whole number from ${min} to ${max}).` };
    if (v !== undefined) (subject as unknown as Record<string, number>)[name] = v;
  }
  if (subject.min_beds != null && subject.max_beds != null && subject.min_beds > subject.max_beds) return { ok: false, error: "Minimum beds is more than maximum beds." };
  if (subject.min_sqft != null && subject.max_sqft != null && subject.min_sqft > subject.max_sqft) return { ok: false, error: "Minimum size is more than maximum size." };
  const notes = String(src.get("notes") ?? "").trim();
  if (notes.length > 2000) return { ok: false, error: "Keep notes under 2,000 characters." };
  if (notes) subject.notes = notes;
  return { ok: true, subject };
}

/** cma_comps() arguments for a subject's search. */
export function compSearchArgs(s: CmaSubject) {
  return {
    p_city_slugs: [s.city_slug],
    ...(s.sub_type ? { p_sub_types: [s.sub_type] } : {}),
    ...(s.min_beds != null ? { p_min_beds: s.min_beds } : {}),
    ...(s.max_beds != null ? { p_max_beds: s.max_beds } : {}),
    ...(s.min_baths != null ? { p_min_baths: s.min_baths } : {}),
    ...(s.min_sqft != null ? { p_min_sqft: s.min_sqft } : {}),
    ...(s.max_sqft != null ? { p_max_sqft: s.max_sqft } : {}),
    p_months: s.months ?? 6,
    p_limit: 30,
  };
}
