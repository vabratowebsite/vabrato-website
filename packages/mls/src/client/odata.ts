// Minimal OData v4 query builder for the RESO Web API.
//
//   filter: and(gt("ModificationTimestamp", ts("2026-11-01T00:00:00Z")), eq("StandardStatus", "Active"))
//   -> ModificationTimestamp gt 2026-11-01T00:00:00Z and StandardStatus eq 'Active'

export type Literal = string | number | boolean | null | Timestamp;
export interface Timestamp {
  readonly kind: "timestamp" | "date";
  readonly iso: string;
}

/** A DateTimeOffset literal (written unquoted). */
export function ts(value: string | Date): Timestamp {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new Error("Invalid timestamp literal");
  return { kind: "timestamp", iso: d.toISOString() };
}

/** An Edm.Date literal (YYYY-MM-DD, unquoted), e.g. for CloseDate. */
export function date(value: string | Date): Timestamp {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date literal");
  return { kind: "date", iso: d.toISOString().slice(0, 10) };
}

const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\/[A-Za-z_][A-Za-z0-9_]*)*$/;

function field(name: string): string {
  if (!FIELD.test(name)) throw new Error(`Invalid OData field name: ${name}`);
  return name;
}

export function literal(v: Literal): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("Invalid numeric literal");
    return String(v);
  }
  if (typeof v === "object") return v.iso;
  return `'${v.replace(/'/g, "''")}'`;
}

type Op = "eq" | "ne" | "gt" | "ge" | "lt" | "le";
const cmp = (op: Op) => (name: string, value: Literal) => `${field(name)} ${op} ${literal(value)}`;

export const eq = cmp("eq");
export const ne = cmp("ne");
export const gt = cmp("gt");
export const ge = cmp("ge");
export const lt = cmp("lt");
export const le = cmp("le");

const join = (op: "and" | "or", parts: (string | false | null | undefined)[]) => {
  const kept = parts.filter((p): p is string => Boolean(p));
  if (kept.length === 0) return "";
  if (kept.length === 1) return kept[0]!;
  return kept.map((p) => `(${p})`).join(` ${op} `);
};

export const and = (...parts: (string | false | null | undefined)[]) => join("and", parts);
export const or = (...parts: (string | false | null | undefined)[]) => join("or", parts);

/** `field eq a or field eq b ...` (portable alternative to `in`, which not every RESO server supports). */
export function anyOf(name: string, values: readonly Literal[]): string {
  if (values.length === 0) throw new Error("anyOf needs at least one value");
  return or(...values.map((v) => eq(name, v)));
}

export interface ODataQuery {
  filter?: string;
  select?: readonly string[];
  orderby?: string | readonly string[];
  top?: number;
  skip?: number;
  count?: boolean;
  expand?: readonly string[];
}

export function queryString(q: ODataQuery): string {
  const params = new URLSearchParams();
  if (q.filter) params.set("$filter", q.filter);
  if (q.select?.length) params.set("$select", q.select.map(field).join(","));
  if (q.orderby) {
    const list = typeof q.orderby === "string" ? [q.orderby] : q.orderby;
    for (const o of list) {
      const [name, dir, ...rest] = o.trim().split(/\s+/);
      if (!name || rest.length || (dir && dir !== "asc" && dir !== "desc")) throw new Error(`Invalid $orderby: ${o}`);
      field(name);
    }
    params.set("$orderby", list.join(","));
  }
  if (q.top !== undefined) params.set("$top", String(nonNegativeInt(q.top)));
  if (q.skip !== undefined) params.set("$skip", String(nonNegativeInt(q.skip)));
  if (q.count) params.set("$count", "true");
  if (q.expand?.length) params.set("$expand", q.expand.map(field).join(","));
  return params.toString();
}

function nonNegativeInt(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error("Expected a non-negative integer");
  return n;
}
