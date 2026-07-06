import { z } from "zod";

// Deterministic status ladder for tracked properties (free-text column in the
// DB; the app constrains it).
export const PROPERTY_STATUSES = [
  "watching",
  "toured",
  "offer_made",
  "in_escrow",
  "purchased",
  "lost",
] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  watching: "Watching",
  toured: "Toured",
  offer_made: "Offer made",
  in_escrow: "In escrow",
  purchased: "Purchased",
  lost: "Lost",
};

export const propertyInputSchema = z.object({
  address: z.string().trim().min(1, "Address is required"),
  source: z
    .string()
    .trim()
    .transform((s) => s || null),
  status: z.enum(PROPERTY_STATUSES),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export function parsePropertyForm(
  form: FormData,
): { data: PropertyInput; error: null } | { data: null; error: string } {
  const result = propertyInputSchema.safeParse({
    address: form.get("address") ?? "",
    source: form.get("source") ?? "",
    status: form.get("status") ?? "watching",
  });
  if (!result.success) {
    const first = result.error.issues[0];
    return { data: null, error: first?.message ?? "Invalid property" };
  }
  return { data: result.data, error: null };
}
