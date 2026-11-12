import type { SellerType } from "@vabrato/db";

// The documents a listing-side California sale needs, by seller type
// (S6b PR 7a). Our code decides what's missing; the assistant can only
// suggest which of these a file is. DRAFT for the owner's review
// (2026-11-12): items and wording are easy to change here, and the keys are
// stored on deal_documents / deal_checklist_marks, so keep existing keys.

/** What a file can be. A combined disclosure packet can be several. */
export const DOC_TYPES = {
  rpa: "Residential Purchase Agreement (RPA)",
  counter_offer: "Counter offer or addendum",
  agency_disclosure: "Agency disclosure (AD)",
  sbsa: "Statewide Buyer and Seller Advisory (SBSA)",
  tds: "Transfer Disclosure Statement (TDS)",
  esd: "Exempt Seller Disclosure (ESD)",
  spq: "Seller Property Questionnaire (SPQ)",
  avid: "Agent Visual Inspection Disclosure (AVID)",
  nhd: "Natural Hazard Disclosure report (NHD)",
  whsd: "Water heater and smoke/CO detector statement (WHSD)",
  lead_paint: "Lead-based paint disclosure (FLD)",
  prelim_title: "Preliminary title report",
  home_inspection: "Home inspection report",
  pest_inspection: "Pest (wood destroying organism) report",
  contingency_removal: "Contingency removal (CR)",
  vp: "Verification of property condition (VP)",
  trust_certification: "Certification of trust",
  death_certificate: "Death certificate",
  letters: "Letters Testamentary or Letters of Administration",
  probate_advisory: "Probate Advisory (PA)",
  court_confirmation: "Court confirmation order or IAEA notice of proposed action",
} as const;

export type DocType = keyof typeof DOC_TYPES;
export const DOC_TYPE_KEYS = Object.keys(DOC_TYPES) as DocType[];
export const isDocType = (k: string): k is DocType => Object.prototype.hasOwnProperty.call(DOC_TYPES, k);

const ALL: SellerType[] = ["normal", "trust", "successor_trustee", "probate"];

export interface ChecklistItem {
  key: string;
  label: string;
  /** Shown under the label: when it applies, or what counts. */
  hint?: string;
  /** Needed only in some sales: mark it "not needed" otherwise. */
  ifApplies?: boolean;
  /** The file types that satisfy it (any one). */
  satisfiedBy: DocType[];
  sellerTypes: SellerType[];
}

const item = (key: string, satisfiedBy: DocType[], sellerTypes: SellerType[], extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  key,
  label: DOC_TYPES[satisfiedBy[0]!],
  satisfiedBy,
  sellerTypes,
  ...extra,
});

export const CHECKLIST: ChecklistItem[] = [
  item("rpa", ["rpa"], ALL),
  item("counter_offers", ["counter_offer"], ALL, { label: "Counter offers and addenda", ifApplies: true, hint: "If there were any" }),
  item("agency_disclosure", ["agency_disclosure"], ALL),
  item("sbsa", ["sbsa"], ALL),
  item("tds", ["tds"], ["normal", "trust"]),
  item("tds_or_esd", ["tds", "esd"], ["successor_trustee"], { label: "TDS, or Exempt Seller Disclosure (ESD)", hint: "A successor trustee may be exempt from the TDS" }),
  item("esd", ["esd"], ["probate"], { hint: "Probate sales are exempt from the TDS" }),
  item("spq", ["spq"], ALL),
  item("avid", ["avid"], ALL),
  item("nhd", ["nhd"], ALL),
  item("whsd", ["whsd"], ALL),
  item("lead_paint", ["lead_paint"], ALL, { ifApplies: true, hint: "If the home was built before 1978" }),
  item("prelim_title", ["prelim_title"], ALL),
  item("home_inspection", ["home_inspection"], ALL, { ifApplies: true, hint: "If one was done" }),
  item("pest_inspection", ["pest_inspection"], ALL, { ifApplies: true, hint: "If one was done" }),
  item("contingency_removal", ["contingency_removal"], ALL),
  item("vp", ["vp"], ALL, { hint: "Before close of escrow" }),
  item("trust_certification", ["trust_certification"], ["trust", "successor_trustee"]),
  item("death_certificate", ["death_certificate"], ["successor_trustee"], { hint: "Of the settlor (the trustee who died)" }),
  item("letters", ["letters"], ["probate"]),
  item("probate_advisory", ["probate_advisory"], ["probate"]),
  item("court_confirmation", ["court_confirmation"], ["probate"], { ifApplies: true, hint: "Court confirmation, or IAEA notice under full authority" }),
];

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  normal: "standard",
  trust: "trust",
  successor_trustee: "successor trustee",
  probate: "probate",
};

export interface ChecklistFile {
  id: string;
  name: string;
  doc_types: string[];
}

export interface ChecklistMark {
  item_key: string;
  note: string | null;
  marked_by_name?: string | null;
  marked_at?: string;
}

export type ChecklistStatus = "on_file" | "not_needed" | "missing";

export interface ChecklistRow extends ChecklistItem {
  status: ChecklistStatus;
  files: ChecklistFile[];
  mark: ChecklistMark | null;
}

export interface ChecklistResult {
  rows: ChecklistRow[];
  onFile: number;
  notNeeded: number;
  missing: number;
  total: number;
}

/** The checklist for a sale: each item on file (which files), not needed, or missing. */
export function checklistFor(sellerType: SellerType, files: ChecklistFile[], marks: ChecklistMark[]): ChecklistResult {
  const rows = CHECKLIST.filter((i) => i.sellerTypes.includes(sellerType)).map((i): ChecklistRow => {
    const matching = files.filter((f) => f.doc_types.some((t) => (i.satisfiedBy as string[]).includes(t)));
    const mark = marks.find((m) => m.item_key === i.key) ?? null;
    const status: ChecklistStatus = matching.length ? "on_file" : mark ? "not_needed" : "missing";
    return { ...i, status, files: matching, mark };
  });
  const count = (s: ChecklistStatus) => rows.filter((r) => r.status === s).length;
  return { rows, onFile: count("on_file"), notNeeded: count("not_needed"), missing: count("missing"), total: rows.length };
}

/** Item keys that can be marked not needed for this seller type. */
export const checklistKeys = (sellerType: SellerType) => CHECKLIST.filter((i) => i.sellerTypes.includes(sellerType)).map((i) => i.key);

/** Only known types, once each, in the checklist's order. */
export const cleanDocTypes = (types: readonly unknown[]): DocType[] => DOC_TYPE_KEYS.filter((k) => types.includes(k));
