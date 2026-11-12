// Intake form fields the contract reader can fill, shared by the form (client)
// and the reader (server). No model code here.

/** Contingency-day inputs on the intake form, in the order shown. */
export const CONTINGENCY_FIELDS = [
  { field: "cont_insurance", kind: "insurance", label: "Insurance", from: "insurance", usual: 7 },
  { field: "cont_financing", kind: "financing", label: "Loan", from: "loan", usual: 7 },
  { field: "cont_appraisal", kind: "appraisal", label: "Appraisal", from: "appraisal", usual: 8 },
  { field: "cont_property_condition", kind: "property_condition", label: "Property condition", from: "investigation", usual: 8 },
] as const;

export type ContingencyField = (typeof CONTINGENCY_FIELDS)[number]["field"];
export type IntakeField = "address" | "seller_name" | "seller_type" | "ratification_date" | "days_to_close" | "rent_back_days" | "sale_price" | ContingencyField;

export interface IntakeSource {
  page: number | null;
  quote: string | null;
}

export interface IntakeProposal {
  /** Values for the form, as strings. A field left out wasn't found or wasn't usable. */
  values: Partial<Record<IntakeField, string>>;
  /** Where each value came from, for the coordinator to check. */
  sources: Partial<Record<IntakeField, IntakeSource>>;
  /** Things to check by hand: the model's notes, then ours. */
  notes: string[];
}

/** Largest contract PDF the reader takes (the model's request limit is 32 MB after encoding). */
export const MAX_CONTRACT_BYTES = 20 * 1024 * 1024;
