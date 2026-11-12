import { z } from "zod";
import { assertISODate, type ContingencySpec } from "@vabrato/lib";
import { CONTINGENCY_FIELDS } from "./intake-fields";

const isoDate = z.string().refine(
  (s) => {
    try {
      assertISODate(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Enter a valid date" },
);

export const dealInputSchema = z.object({
  address: z.string().trim().min(1, "Address is required"),
  escrow_number: z.string().trim().optional().or(z.literal("")),
  seller_name: z.string().trim().optional().or(z.literal("")),
  seller_type: z.enum(["normal", "trust", "successor_trustee", "probate"]),
  ratification_date: isoDate,
  days_to_close: z.coerce.number().int().min(1).max(120),
  rent_back_days: z.coerce.number().int().min(0).max(90),
  sale_price: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().min(0).nullable(),
  ),
});

export type DealInput = z.infer<typeof dealInputSchema> & {
  /** Contingency removals for the schedule; empty when the buyer has none. */
  contingencies: ContingencySpec[];
};

/**
 * Days to each contingency removal. A blank field or 0 means the contract has
 * no such contingency; a form without the field gets the usual number of days.
 */
function parseContingencies(form: FormData): { list: ContingencySpec[]; error: null } | { list: null; error: string } {
  const list: ContingencySpec[] = [];
  for (const c of CONTINGENCY_FIELDS) {
    const raw = form.get(c.field);
    if (raw === null) {
      list.push({ kind: c.kind, offsetDays: c.usual });
      continue;
    }
    const text = String(raw).trim();
    if (text === "") continue;
    const days = Number(text);
    if (!/^\d{1,3}$/.test(text) || days > 60) return { list: null, error: `${c.label} contingency: enter 1 to 60 days, or leave it blank if there is none` };
    if (days > 0) list.push({ kind: c.kind, offsetDays: days });
  }
  return { list, error: null };
}

/** Parses intake FormData; returns field values or a single friendly error. */
export function parseDealForm(
  form: FormData,
): { data: DealInput; error: null } | { data: null; error: string } {
  const raw = {
    address: form.get("address") ?? "",
    escrow_number: form.get("escrow_number") ?? "",
    seller_name: form.get("seller_name") ?? "",
    seller_type: form.get("seller_type") ?? "normal",
    ratification_date: form.get("ratification_date") ?? "",
    days_to_close: form.get("days_to_close") ?? "",
    rent_back_days: form.get("rent_back_days") || "0",
    sale_price: form.get("sale_price") ?? "",
  };
  const result = dealInputSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return { data: null, error: `${first?.path.join(".") ?? "form"}: ${first?.message ?? "invalid"}` };
  }
  const contingencies = parseContingencies(form);
  if (contingencies.error !== null) return { data: null, error: contingencies.error };
  return { data: { ...result.data, contingencies: contingencies.list }, error: null };
}
