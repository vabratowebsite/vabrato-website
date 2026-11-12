import type { SellerType } from "@vabrato/db";

// The documents a listing-side California sale needs, by seller type
// (S6b PR 7a). Our code decides what's missing; the assistant can only
// suggest which of these a file is.
//
// DRAFT for Mark's review (owner review 2026-11-13): every row with
// `confirm: true` is new or changed and waits for his "keep" or "drop". The
// keys are stored on deal_documents / deal_checklist_marks, so once this is
// live, keep existing keys and add new ones.

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
  wcmd: "Water-conserving fixtures and carbon monoxide detector notice (WCMD)",
  whsd: "Water heater and smoke detector statement (WHSD)",
  lead_paint: "Lead-based paint disclosure (FLD)",
  prelim_title: "Preliminary title report",
  home_inspection: "Home inspection report",
  pest_inspection: "Pest (wood destroying organism) report",
  contingency_removal: "Contingency removal (CR)",
  vp: "Verification of property condition (VP)",
  trust_certification: "Certification of trust",
  trust_advisory: "Trust Advisory (TA)",
  death_certificate: "Death certificate",
  letters: "Letters Testamentary or Letters of Administration",
  probate_advisory: "Probate Advisory (PA)",
  papa: "Probate purchase agreement addendum (PAPA)",
  pla: "Probate listing addendum (PLA)",
  court_confirmation: "Court confirmation order or IAEA notice of proposed action",
  rla: "Residential listing agreement (RLA)",
  sa: "Seller's Advisory (SA)",
  fhda: "Fair Housing and discrimination advisory (FHDA)",
  prbs: "Possible representation of more than one buyer or seller (PRBS)",
  wfa: "Wire Fraud Advisory (WFA)",
  sfls: "Short sale or foreclosure information (SFLS)",
  withholding: "Seller withholding (FIRPTA / California 593)",
  hoa_docs: "HOA documents",
  county_advisory: "County or local advisory",
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
  /**
   * Needed only in some sales. Listed under "If they apply" and counted in
   * "N of M" only once it's on file or marked not needed.
   */
  ifApplies?: boolean;
  /** The file types that satisfy it: any one of them (an either/or item when there are several). */
  satisfiedBy: DocType[];
  sellerTypes: SellerType[];
  /** New or changed in the 2026-11-13 draft: waiting for Mark to confirm. */
  confirm?: boolean;
}

const item = (key: string, satisfiedBy: DocType[], sellerTypes: SellerType[], extra: Partial<ChecklistItem> = {}): ChecklistItem => ({
  key,
  label: DOC_TYPES[satisfiedBy[0]!],
  satisfiedBy,
  sellerTypes,
  ...extra,
});
const ifApplies = (key: string, satisfiedBy: DocType[], sellerTypes: SellerType[], extra: Partial<ChecklistItem> = {}) => item(key, satisfiedBy, sellerTypes, { ifApplies: true, ...extra });

export const CHECKLIST: ChecklistItem[] = [
  // Required, every sale.
  item("rpa", ["rpa"], ALL),
  item("agency_disclosure", ["agency_disclosure"], ALL),
  item("sbsa", ["sbsa"], ALL),
  // Disclosure statements by seller type (either/or where an exemption may apply).
  item("tds", ["tds"], ["normal"]),
  item("tds_or_esd", ["tds", "esd"], ["trust", "successor_trustee"], { label: "TDS, or Exempt Seller Disclosure (ESD)", hint: "A trustee may be exempt from the TDS", confirm: true }),
  item("esd", ["esd"], ["probate"], { hint: "Probate sales are exempt from the TDS and SPQ", confirm: true }),
  item("spq", ["spq"], ["normal", "trust"], { confirm: true }),
  item("spq_or_esd", ["spq", "esd"], ["successor_trustee"], { label: "SPQ, or Exempt Seller Disclosure (ESD)", confirm: true }),
  item("avid", ["avid"], ALL),
  item("nhd", ["nhd"], ALL),
  item("wcmd", ["wcmd"], ALL, { confirm: true }),
  item("prelim_title", ["prelim_title"], ALL),
  item("contingency_removal", ["contingency_removal"], ALL),
  item("vp", ["vp"], ALL, { hint: "Before close of escrow" }),
  // Trusts and estates.
  item("trust_certification", ["trust_certification"], ["trust", "successor_trustee"]),
  item("trust_advisory", ["trust_advisory"], ["trust", "successor_trustee"], { confirm: true }),
  item("death_certificate", ["death_certificate"], ["successor_trustee"], { hint: "Of the settlor (the trustee who died)" }),
  item("letters", ["letters"], ["probate"]),
  item("probate_advisory", ["probate_advisory"], ["probate"]),
  item("papa", ["papa"], ["probate"], { confirm: true }),
  item("pla", ["pla"], ["probate"], { confirm: true }),
  // If they apply, every sale.
  ifApplies("counter_offers", ["counter_offer"], ALL, { label: "Counter offers and addenda", hint: "If there were any" }),
  ifApplies("whsd", ["whsd"], ALL, { confirm: true }),
  ifApplies("lead_paint", ["lead_paint"], ALL, { hint: "If the home was built before 1978" }),
  ifApplies("home_inspection", ["home_inspection"], ALL, { hint: "If one was done" }),
  ifApplies("pest_inspection", ["pest_inspection"], ALL, { hint: "If one was done" }),
  ifApplies("court_confirmation", ["court_confirmation"], ["probate"], { hint: "Court confirmation, or IAEA notice under full authority" }),
  // If they apply: flagged for Mark to keep or drop.
  ifApplies("rla", ["rla"], ALL, { confirm: true }),
  ifApplies("sa", ["sa"], ALL, { confirm: true }),
  ifApplies("fhda", ["fhda"], ALL, { confirm: true }),
  ifApplies("prbs", ["prbs"], ALL, { confirm: true }),
  ifApplies("wfa", ["wfa"], ALL, { confirm: true }),
  ifApplies("sfls", ["sfls"], ALL, { confirm: true }),
  ifApplies("withholding", ["withholding"], ALL, { confirm: true }),
  ifApplies("hoa_docs", ["hoa_docs"], ALL, { hint: "If the home is in an HOA", confirm: true }),
  ifApplies("county_advisory", ["county_advisory"], ALL, { confirm: true }),
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

/** "open": an if-applies item nobody has decided on yet (not missing, not counted). */
export type ChecklistStatus = "on_file" | "not_needed" | "missing" | "open";

export interface ChecklistRow extends ChecklistItem {
  status: ChecklistStatus;
  files: ChecklistFile[];
  mark: ChecklistMark | null;
}

export interface ChecklistResult {
  /** Required items, in order. */
  required: ChecklistRow[];
  /** If-applies items, in order. */
  ifApplies: ChecklistRow[];
  /** Both groups, required first. */
  rows: ChecklistRow[];
  /** "N" in "N of M": required items done plus if-applies items decided (on file or not needed). */
  done: number;
  /** "M": required items plus decided if-applies items. */
  total: number;
  /** Required items not on file and not marked not needed. */
  missing: number;
}

/** The checklist for a sale: each item on file (which files), not needed, missing or (if applies) open. */
export function checklistFor(sellerType: SellerType, files: ChecklistFile[], marks: ChecklistMark[]): ChecklistResult {
  const rows = CHECKLIST.filter((i) => i.sellerTypes.includes(sellerType)).map((i): ChecklistRow => {
    const matching = files.filter((f) => f.doc_types.some((t) => (i.satisfiedBy as string[]).includes(t)));
    const mark = marks.find((m) => m.item_key === i.key) ?? null;
    const status: ChecklistStatus = matching.length ? "on_file" : mark ? "not_needed" : i.ifApplies ? "open" : "missing";
    return { ...i, status, files: matching, mark };
  });
  const required = rows.filter((r) => !r.ifApplies);
  const optional = rows.filter((r) => r.ifApplies);
  const decided = optional.filter((r) => r.status !== "open").length;
  const missing = required.filter((r) => r.status === "missing").length;
  return { required, ifApplies: optional, rows: [...required, ...optional], done: required.length - missing + decided, total: required.length + decided, missing };
}

/** Item keys that can be marked not needed for this seller type. */
export const checklistKeys = (sellerType: SellerType) => CHECKLIST.filter((i) => i.sellerTypes.includes(sellerType)).map((i) => i.key);

/** Only known types, once each, in the checklist's order. */
export const cleanDocTypes = (types: readonly unknown[]): DocType[] => DOC_TYPE_KEYS.filter((k) => types.includes(k));
