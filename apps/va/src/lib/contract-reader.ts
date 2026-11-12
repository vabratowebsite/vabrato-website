import { z } from "zod";
import type { AiFeature } from "@vabrato/ai";
import { CONTINGENCY_FIELDS, type IntakeField, type IntakeProposal, type IntakeSource } from "./intake-fields";

// Contract reader (S6b PR 2, flag ai_staff_contract_reader): reads a ratified
// purchase contract and proposes the intake values, each with the page and a
// short quote so a person can check it. Nothing here is saved: the proposal
// fills the intake form, the coordinator corrects it, and the schedule engine
// sets every deadline from what they confirm (SPEC <ai_rules>).

const SYSTEM = `You are helping a transaction coordinator at Vabrato Real Estate Services, a California brokerage, open a new transaction file. You are given a ratified residential purchase contract as a PDF, usually a California Association of Realtors purchase agreement with any counter offers and addenda in the same file.

Read the whole document before answering. Counter offers and addenda often change terms stated earlier, and the last version both sides agreed to is the one that counts.

Report the terms listed below. For each, give the value, the page of the PDF where you found it (the first page of the file is page 1) and a short exact quote from that page, under 200 characters, so the coordinator can find and check it. These values set legal deadlines once the coordinator confirms them, so a blank they fill in by hand is better than a guess: when a term isn't stated, can't be read, or you can't tell which version is final, give null and say why in the notes.

- property_address: the street address and city of the property.
- seller_names: the seller or sellers as written, including any capacity such as "Trustee of the Example Family Trust".
- seller_type: "trust" if the seller signs as trustee of a trust, "successor_trustee" if as successor trustee, "probate" if the seller is an estate, executor or administrator, otherwise "normal".
- acceptance_date: the date of final acceptance, meaning the last signature or initials that completed the agreement (on the last counter offer if there is one), as YYYY-MM-DD.
- days_to_close: the number of days after acceptance until close of escrow, when the contract states it in days.
- close_of_escrow_date: the closing date as YYYY-MM-DD, when the contract states a specific date instead.
- purchase_price: the final agreed price in dollars, as a number.
- seller_rent_back_days: the number of days the seller stays in possession after close of escrow; 0 if possession passes at close.
- contingencies (loan, appraisal, investigation of the property's condition, insurance): for each, the number of days after acceptance by which the buyer removes it, or waived true when the contract removes or waives it, for example an all-cash offer with no loan contingency.
- notes: up to 8 short, plain sentences on what the coordinator should check by hand: a counter offer that changed a term, missing signatures or initials, blanks, handwritten changes, anything unusual. Give the page.

Leave everything else out of your answer, including phone numbers, email addresses, license numbers, and any bank, deposit or wiring details.`;

const sourced = (value: Record<string, unknown>) => ({
  type: "object",
  properties: { value, page: { anyOf: [{ type: "integer" }, { type: "null" }] }, quote: { anyOf: [{ type: "string" }, { type: "null" }] } },
  required: ["value", "page", "quote"],
  additionalProperties: false,
});
const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const contingency = {
  type: "object",
  properties: { days: nullable("integer"), waived: { type: "boolean" }, page: nullable("integer"), quote: nullable("string") },
  required: ["days", "waived", "page", "quote"],
  additionalProperties: false,
};

const JSON_SCHEMA = {
  type: "object",
  properties: {
    property_address: sourced(nullable("string")),
    seller_names: sourced(nullable("string")),
    seller_type: sourced({ anyOf: [{ type: "string", enum: ["normal", "trust", "successor_trustee", "probate"] }, { type: "null" }] }),
    acceptance_date: sourced(nullable("string")),
    days_to_close: sourced(nullable("integer")),
    close_of_escrow_date: sourced(nullable("string")),
    purchase_price: sourced(nullable("number")),
    seller_rent_back_days: sourced(nullable("integer")),
    contingencies: {
      type: "object",
      properties: { loan: contingency, appraisal: contingency, investigation: contingency, insurance: contingency },
      required: ["loan", "appraisal", "investigation", "insurance"],
      additionalProperties: false,
    },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["property_address", "seller_names", "seller_type", "acceptance_date", "days_to_close", "close_of_escrow_date", "purchase_price", "seller_rent_back_days", "contingencies", "notes"],
  additionalProperties: false,
};

const page = z.number().int().min(1).max(2000).nullable().catch(null);
const quote = z.string().max(600).nullable();
const field = <T extends z.ZodTypeAny>(value: T) => z.object({ value: value.nullable(), page, quote }).strict();
const cont = z.object({ days: z.number().int().nullable(), waived: z.boolean(), page, quote }).strict();

const Reading = z
  .object({
    property_address: field(z.string().max(300)),
    seller_names: field(z.string().max(300)),
    seller_type: field(z.enum(["normal", "trust", "successor_trustee", "probate"])),
    acceptance_date: field(z.string().max(40)),
    days_to_close: field(z.number().int()),
    close_of_escrow_date: field(z.string().max(40)),
    purchase_price: field(z.number()),
    seller_rent_back_days: field(z.number().int()),
    contingencies: z.object({ loan: cont, appraisal: cont, investigation: cont, insurance: cont }).strict(),
    notes: z.array(z.string().max(500)).max(20),
  })
  .strict();
export type ContractReading = z.infer<typeof Reading>;

export const CONTRACT_READER: AiFeature<ContractReading> = {
  key: "staff_contract_reader",
  system: SYSTEM,
  effort: "high",
  output: { kind: "json", jsonSchema: JSON_SCHEMA, parse: (v) => Reading.parse(v) },
};

// --- Proposal for the intake form ------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
function validDate(s: string | null): string | null {
  const m = s ? ISO.exec(s) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? s : null;
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const short = (q: string | null) => (q ? (q.length > 200 ? `${q.slice(0, 197)}…` : q) : null);

/** Turns a reading into form values, keeping only values the form would accept. */
export function toIntakeProposal(r: ContractReading): IntakeProposal {
  const values: IntakeProposal["values"] = {};
  const sources: IntakeProposal["sources"] = {};
  const ours: string[] = [];
  const set = (f: IntakeField, v: string, s: IntakeSource) => {
    values[f] = v;
    sources[f] = { page: s.page, quote: short(s.quote) };
  };

  if (r.property_address.value?.trim()) set("address", r.property_address.value.trim(), r.property_address);
  else ours.push("Property address: not found in the contract.");
  if (r.seller_names.value?.trim()) set("seller_name", r.seller_names.value.trim(), r.seller_names);
  if (r.seller_type.value) set("seller_type", r.seller_type.value, r.seller_type);

  const accepted = validDate(r.acceptance_date.value);
  if (accepted) set("ratification_date", accepted, r.acceptance_date);
  else ours.push("Acceptance date: not found or not clear. Enter the ratification date by hand.");

  const days = r.days_to_close.value;
  const closeDate = validDate(r.close_of_escrow_date.value);
  if (days !== null && days >= 1 && days <= 120) set("days_to_close", String(days), r.days_to_close);
  else if (accepted && closeDate) {
    const n = daysBetween(accepted, closeDate);
    if (n >= 1 && n <= 120) {
      set("days_to_close", String(n), r.close_of_escrow_date);
      ours.push(`Days to close: worked out as ${n} from the closing date ${closeDate} in the contract.`);
    } else ours.push(`Close of escrow: the contract's closing date (${closeDate}) is ${n} days from acceptance, outside 1 to 120. Check it.`);
  } else ours.push("Close of escrow: not found or not clear. Enter the days to close by hand.");

  const price = r.purchase_price.value;
  if (price !== null && price > 0 && price <= 1_000_000_000) set("sale_price", String(Math.round(price)), r.purchase_price);
  const rent = r.seller_rent_back_days.value;
  if (rent !== null && rent >= 0 && rent <= 90) set("rent_back_days", String(rent), r.seller_rent_back_days);
  else if (rent !== null) ours.push(`Rent-back: the contract appears to say ${rent} days, more than the 90 the schedule handles. Check it.`);

  for (const c of CONTINGENCY_FIELDS) {
    const got = r.contingencies[c.from];
    if (got.waived) {
      set(c.field, "", got);
      ours.push(`${c.label} contingency: waived or removed in the contract, so the field is blank.`);
    } else if (got.days !== null && got.days >= 1 && got.days <= 60) set(c.field, String(got.days), got);
    else if (got.days !== null) ours.push(`${c.label} contingency: the contract appears to say ${got.days} days, which the schedule can't use. The usual ${c.usual} days are shown. Check it.`);
    else ours.push(`${c.label} contingency: not found in the contract. The usual ${c.usual} days are shown; change them, or clear the field if there is none.`);
  }

  return { values, sources, notes: [...r.notes.map((n) => n.trim()).filter(Boolean).slice(0, 8), ...ours] };
}
