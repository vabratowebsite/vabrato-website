import { z } from "zod";
import { assertISODate } from "@vabrato/lib";

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

export type DealInput = z.infer<typeof dealInputSchema>;

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
  return { data: result.data, error: null };
}
