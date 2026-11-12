// Repair items and the response to the buyer's request (S6b PR 7b): the
// parts that pages, client components and tests share. No model code here.

// --- Trades ------------------------------------------------------------------------------------------

export const TRADES = [
  { key: "roofing", label: "Roofing", vendor: /roof/i },
  { key: "plumbing", label: "Plumbing", vendor: /plumb/i },
  { key: "sewer_lateral", label: "Sewer lateral", vendor: /sewer|lateral|plumb/i },
  { key: "electrical", label: "Electrical", vendor: /electric/i },
  { key: "hvac", label: "HVAC", vendor: /hvac|heating|furnace|air\s?condition/i },
  { key: "foundation", label: "Foundation and structural", vendor: /foundation|structur|engineer/i },
  { key: "pest", label: "Pest and wood damage", vendor: /pest|termite|wood/i },
  { key: "chimney", label: "Chimney and fireplace", vendor: /chimney|fireplace/i },
  { key: "water_heater", label: "Water heater", vendor: /water\s?heater|plumb/i },
  { key: "windows_doors", label: "Windows and doors", vendor: /window|door|glass/i },
  { key: "drainage", label: "Drainage and grading", vendor: /drain|grading|landscap/i },
  { key: "pool_spa", label: "Pool and spa", vendor: /pool|spa/i },
  { key: "appliances", label: "Appliances", vendor: /applian/i },
  { key: "general", label: "General repairs", vendor: /handy|general|contractor/i },
  { key: "other", label: "Other", vendor: /$^/ },
] as const;
export type TradeKey = (typeof TRADES)[number]["key"];
export const tradeLabel = (k: string) => TRADES.find((t) => t.key === k)?.label ?? "Other";

export const SEVERITIES = ["safety", "repair", "maintenance", "monitor"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const MAX_ITEMS = 60;

/** Fixed lines (owner review 2026-11-13; wording for Mark to confirm). */
export const NOT_THE_REPORT = "A summary, not a replacement for the report.";
export const FORM_GOVERNS = "This summary is for convenience; the signed Request for Repair response form governs."; // confirm with Mark
export const REPAIR_WORDING = "Seller will repair, by a licensed contractor before close of escrow"; // confirm with Mark

// --- Items -------------------------------------------------------------------------------------------

export interface RepairItem {
  id: string;
  title: string;
  detail: string;
  location: string;
  severity: Severity;
  /** The report's own words for it, when the report has categories ("Section 1", "Safety concern"). */
  severity_label: string;
  trade: TradeKey;
  page: number | null;
  /** Added by the agent, not from the report. */
  added?: boolean;
}

export interface ItemsContent {
  document_id: string;
  document_name: string;
  items: RepairItem[];
  /** The assistant returned the most items it may: the report may have more. */
  may_be_incomplete: boolean;
  /** Revised from this approved list. */
  revised_from?: string;
}

/** Items grouped by trade, in the trade list's order, for the bid list. */
export function groupByTrade(items: RepairItem[]): { trade: TradeKey; label: string; items: RepairItem[] }[] {
  return TRADES.map((t) => ({ trade: t.key, label: t.label, items: items.filter((i) => i.trade === t.key) })).filter((g) => g.items.length);
}

/** Vendors for a trade: the ones whose role matches first, then the rest (preferred first in each). */
export function vendorsFor<V extends { role: string; preferred: boolean; name: string }>(trade: TradeKey, vendors: V[]): { matching: V[]; others: V[] } {
  const re = TRADES.find((t) => t.key === trade)?.vendor ?? /$^/;
  const sort = (a: V, b: V) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name);
  return { matching: vendors.filter((v) => re.test(v.role)).sort(sort), others: vendors.filter((v) => !re.test(v.role)).sort(sort) };
}

/** A trade's items as plain text for a vendor (our code, no AI): what and where, with report pages. */
export function tradeRequestText(address: string, label: string, items: RepairItem[]): string {
  return [
    `Quote request: ${address}`,
    "",
    `Please quote the following ${label.toLowerCase()} items from the inspection report:`,
    ...items.map((i) => `- ${i.title}${i.location ? ` (${i.location})` : ""}${i.page ? `, report page ${i.page}` : ""}`),
  ].join("\n");
}

// --- The response to the buyer's request -------------------------------------------------------------

export const DECISIONS = ["not_requested", "repair", "credit", "decline"] as const;
export type Decision = (typeof DECISIONS)[number];

export interface DecisionRow {
  id: string;
  title: string;
  decision: Decision;
  /** Dollars, two decimals, for a credit. */
  amount: number | null;
  added?: boolean;
}

export interface ResponseContent {
  items_id: string;
  decisions: DecisionRow[];
  seller_approved: true;
  opening: string;
  closing: string;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Decisions every item starts with: not requested, so nothing is in the letter until the agent decides. */
export const defaultDecisions = (items: RepairItem[]): DecisionRow[] => items.map((i) => ({ id: i.id, title: i.title, decision: "not_requested", amount: null }));

/** Problems with the decisions themselves (before anything is written). */
export function decisionProblems(rows: DecisionRow[]): string[] {
  const problems: string[] = [];
  const asked = rows.filter((r) => r.decision !== "not_requested");
  if (!asked.length) problems.push("Mark at least one item repair, credit or decline. Items left as not requested aren't in the response.");
  for (const r of asked) {
    if (!r.title.trim()) problems.push("Every item in the response needs a title.");
    if (r.decision === "credit" && !(r.amount !== null && Number.isFinite(r.amount) && r.amount > 0 && r.amount < 1_000_000)) problems.push(`Enter the credit for "${r.title}".`);
  }
  return [...new Set(problems)];
}

/** Our code's part of the letter: the items in the response, the credit total, the fixed line. */
export function letterList(rows: DecisionRow[]): string {
  const asked = rows.filter((r) => r.decision !== "not_requested");
  const lines = asked.map((r, n) => {
    const what = r.decision === "repair" ? `${REPAIR_WORDING}.` : r.decision === "credit" ? `Credit to the buyer of ${money(r.amount ?? 0)}.` : "Declined.";
    return `${n + 1}. ${r.title}: ${what}`;
  });
  const total = asked.filter((r) => r.decision === "credit").reduce((s, r) => s + (r.amount ?? 0), 0);
  return [...lines, ...(total > 0 ? ["", `Total credits: ${money(Math.round(total * 100) / 100)}`] : []), "", FORM_GOVERNS].join("\n");
}

/** The whole letter: our greeting, the assistant's opening, our list, its closing, our signature. */
export function composeLetter(opts: { opening: string; closing: string; rows: DecisionRow[]; agentName: string }): string {
  return ["Hello,", "", opts.opening.trim(), "", letterList(opts.rows), "", opts.closing.trim(), "", opts.agentName.trim() || "Vabrato Real Estate Services", "Vabrato Real Estate Services"].join("\n");
}

