import { MAX_CONTRACT_BYTES } from "./intake-fields";

// The VA assistant in the console (S6b). The features the console knows
// about, in the order shown on /assistant. Each has its own switch
// (feature_flags, 0027 onward) on top of the master switch ai_enabled.
// No model code here: this file is safe for pages and tests.

export interface AssistantFeature {
  /** feature_flags.key; the pipeline's feature key is the same without "ai_". */
  flag: `ai_staff_${string}`;
  name: string;
  what: string;
  /** Where staff use it. */
  where: { href: string; label: string };
}

export const ASSISTANT_FEATURES: AssistantFeature[] = [
  {
    flag: "ai_staff_contract_reader",
    name: "Contract reader",
    what: "Reads a ratified purchase contract and fills in the new-transaction form (dates, days to close, contingencies, price, rent-back), with the page and a quote for each value. You check the values, then create the transaction.",
    where: { href: "/deals/new", label: "New transaction" },
  },
];

export const MASTER_FLAG = "ai_enabled";

/** True for deal-docs paths in the caller's own staging folder: intake/<own id>/<uuid>.pdf. */
export function isOwnIntakePath(path: string, profileId: string): boolean {
  const m = /^intake\/([0-9a-f-]{36})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/.exec(path);
  return m !== null && m[1] === profileId;
}

export const intakeFolder = (profileId: string) => `intake/${profileId}`;

/** A contract upload is a PDF by its first bytes (not its name), and not too large. */
export function checkContract(size: number, head: Uint8Array): string | null {
  if (size === 0) return "Choose the contract PDF first.";
  if (size > MAX_CONTRACT_BYTES) return "The contract must be 20 MB or smaller. Export it again at a lower scan quality, or split off the disclosures.";
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (head.length < 5 || !pdf.every((b, i) => head[i] === b)) return "Upload the contract as a PDF.";
  return null;
}

/** "$12.40" from millionths of a dollar (numbers arrive as strings from Postgres bigint). */
export function usd(micros: number | string | null | undefined): string {
  const n = Number(micros ?? 0) / 1_000_000;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(n) ? n : 0);
}

/** Share of the monthly budget used, 0 to 100 (whole percent, never over 100 for the meter). */
export function budgetPercent(spentMicros: number | string, budgetUsd: number): number {
  if (!(budgetUsd > 0)) return Number(spentMicros) > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((Number(spentMicros) / (budgetUsd * 1_000_000)) * 100)));
}

/** Plain messages for the database's refusals (0026, 0027). */
export function aiSettingsError(message: string): string {
  if (/zdr_not_confirmed/.test(message)) return "Record Anthropic's written Zero Data Retention confirmation first. The assistant can't be turned on without it.";
  if (/admin_only|permission denied|row-level security/.test(message)) return "Only an admin can change the assistant's settings.";
  if (/note_required/.test(message)) return "Say where the confirmation is filed (for example: email from Anthropic, the date, who has it).";
  if (/not_an_ai_flag|not_found/.test(message)) return "That isn't an assistant feature.";
  if (/check constraint|violates/.test(message)) return "One of the limits is out of range.";
  return "Something went wrong. Please try again.";
}
