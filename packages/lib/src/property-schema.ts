import { z } from "zod";

// Deterministic status ladder for tracked properties ("homes I'm pursuing";
// free-text column in the DB, the app constrains it). Used by /my in
// apps/web; shared so apps/mobile can use it too (S7).
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

/** Display steps of the portal StatusLadder (packages/ui); "lost" is shown as a pill instead. */
export const LADDER_LABEL: Partial<Record<PropertyStatus, "Watching" | "Toured" | "Offer made" | "In escrow" | "Purchased">> = {
  watching: "Watching",
  toured: "Toured",
  offer_made: "Offer made",
  in_escrow: "In escrow",
  purchased: "Purchased",
};

export const isPropertyStatus = (v: unknown): v is PropertyStatus => (PROPERTY_STATUSES as readonly string[]).includes(v as string);
