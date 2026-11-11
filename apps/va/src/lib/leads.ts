// Pure helpers for the leads inbox and lead page (S6 PR 2b).

export const LEAD_VIEWS = ["new", "mine", "all", "closed"] as const;
export type LeadView = (typeof LEAD_VIEWS)[number];

export const LEAD_KINDS = ["contact", "valuation", "tour", "transform", "newsletter", "open_house_signin"] as const;
export type LeadKindKey = (typeof LEAD_KINDS)[number];

export interface LeadFilters {
  view: LeadView;
  kind: LeadKindKey | null;
  site: "vabrato" | "sancarloslife" | null;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Inbox filters from the query string; anything unknown falls back to the default. */
export function parseLeadFilters(sp: Record<string, string | string[] | undefined>): LeadFilters {
  const view = one(sp.view);
  const kind = one(sp.kind);
  const site = one(sp.site);
  return {
    view: (LEAD_VIEWS as readonly string[]).includes(view ?? "") ? (view as LeadView) : "new",
    kind: (LEAD_KINDS as readonly string[]).includes(kind ?? "") ? (kind as LeadKindKey) : null,
    site: site === "vabrato" || site === "sancarloslife" ? site : null,
  };
}

/** Query string for a filter change (keeps the other filters). */
export function filterHref(f: LeadFilters, change: Partial<LeadFilters>): string {
  const next = { ...f, ...change };
  const q = new URLSearchParams();
  if (next.view !== "new") q.set("view", next.view);
  if (next.kind) q.set("kind", next.kind);
  if (next.site) q.set("site", next.site);
  const s = q.toString();
  return s ? `/leads?${s}` : "/leads";
}

const PAYLOAD_LABELS: Record<string, string> = {
  topic: "Topic",
  agent: "Asked for agent",
  address: "Property address",
  timeline: "Timeline",
  tourDate: "Preferred day",
  tourMode: "Tour type",
  projectType: "Project",
  budget: "Budget",
  has_agent: "Working with an agent",
  hasAgent: "Working with an agent",
};

/** The request details staff see, from known payload keys only (no raw JSON). */
export function payloadRows(payload: unknown): { label: string; value: string }[] {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .filter(([k, v]) => k in PAYLOAD_LABELS && (typeof v === "string" || typeof v === "number") && String(v).trim() !== "")
    .map(([k, v]) => ({ label: PAYLOAD_LABELS[k]!, value: k === "tourMode" && v === "video" ? "Video tour" : k === "tourMode" ? "In person" : String(v).slice(0, 200) }));
}

/** "42 s", "3 min", "2 h 5 min". */
export function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Median of start→end durations in ms, or null with no complete pairs. */
export function medianDuration(pairs: { start: string; end: string | null }[]): number | null {
  const d = pairs.filter((p) => p.end).map((p) => Date.parse(p.end!) - Date.parse(p.start)).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!d.length) return null;
  const mid = Math.floor(d.length / 2);
  return d.length % 2 ? d[mid]! : Math.round((d[mid - 1]! + d[mid]!) / 2);
}

export const STATUS_LABEL: Record<string, string> = { new: "New", assigned: "In progress", closed: "Closed" };
