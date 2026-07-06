import { z } from "zod";
import { assertISODate, todayISO } from "@vabrato/lib";

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

export const receiptInputSchema = z.object({
  vendor: z.string().trim().min(1, "Vendor is required"),
  amount: z.coerce.number().positive("Amount must be positive"),
  category: z
    .string()
    .trim()
    .transform((s) => s || "Other"),
  receipt_date: z
    .string()
    .transform((s) => s || todayISO())
    .pipe(isoDate),
});

export type ReceiptInput = z.infer<typeof receiptInputSchema>;

export function parseReceiptForm(
  form: FormData,
): { data: ReceiptInput; error: null } | { data: null; error: string } {
  const result = receiptInputSchema.safeParse({
    vendor: form.get("vendor") ?? "",
    amount: form.get("amount") ?? "",
    category: form.get("category") ?? "",
    receipt_date: form.get("receipt_date") ?? "",
  });
  if (!result.success) {
    const first = result.error.issues[0];
    return { data: null, error: first?.message ?? "Invalid receipt" };
  }
  return { data: result.data, error: null };
}
