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
  {
    flag: "ai_staff_lead_reply",
    name: "Lead replies",
    what: "Drafts a first reply to a website lead from what they asked and the listing they asked about. You edit and approve it, then send it from your own email (or as a portal message if they have an account).",
    where: { href: "/leads", label: "Leads" },
  },
  {
    flag: "ai_staff_open_house_followup",
    name: "Open-house follow-ups",
    what: "Drafts a thank-you and follow-up to someone who signed in at an open house. You edit, approve and send it yourself.",
    where: { href: "/leads", label: "Leads" },
  },
  {
    flag: "ai_staff_escrow_update",
    name: "Escrow updates",
    what: "Drafts an update for the seller from the transaction's task list: what's done, what's next and the closing date. You edit, approve and send it yourself.",
    where: { href: "/deals", label: "Deals" },
  },
  {
    flag: "ai_staff_vendor_request",
    name: "Vendor quote requests",
    what: "Drafts a quote or appointment request to a vendor for a transaction, from what you say you need. You add access details, approve and send it yourself.",
    where: { href: "/deals", label: "Deals" },
  },
  {
    flag: "ai_staff_daily_briefing",
    name: "Daily briefing",
    what: "On the Today page: what needs your attention, from your own records (tasks due, deadlines and closings coming up, leads waiting for a reply, members waiting for an answer), with a link to each. Written when you ask; nothing is saved.",
    where: { href: "/", label: "Today" },
  },
  {
    flag: "ai_staff_member_summary",
    name: "Member activity summary",
    what: "On a member's page: what they've been looking at and asking about, what they seem to be looking for, and next steps. It reads their saved homes, searches, tour requests and last 10 messages; nothing is saved.",
    where: { href: "/members", label: "Members" },
  },
  {
    flag: "ai_staff_data_questions",
    name: "Questions about your work",
    what: "On this page: ask in plain words about your own transactions, tasks, leads and messages, and get an answer with links to the records it's based on.",
    where: { href: "/assistant", label: "Assistant" },
  },
  {
    flag: "ai_staff_listing_kit",
    name: "Listing launch kits",
    what: "For one of our own listings: the MLS description, three social posts, a \"just listed\" email and a printable flyer, from the public listing facts and your notes. You edit and approve it, then copy or print.",
    where: { href: "/listings", label: "Our listings" },
  },
  {
    flag: "ai_staff_presentations",
    name: "Presentations",
    what: "Listing and buyer presentations to print: the assistant writes the pages; your profile, Vabrato's services and the usual timeline come from our records. Never any pricing.",
    where: { href: "/presentations", label: "Presentations" },
  },
  {
    flag: "ai_staff_market_update",
    name: "Market updates",
    what: "On Market stats: an update for a city and period, written around the console's own figures (every number is checked against them). Internal until MLSListings confirms public statistics; then copy it or send it to Mark's website review.",
    where: { href: "/stats", label: "Market stats" },
  },
  {
    flag: "ai_staff_cma_writeup",
    name: "CMA write-ups",
    what: "On a CMA: a plain-language summary of the comparable sales and our range, for the homeowner. A comparison of recent sales, never an appraisal or the assistant's own value.",
    where: { href: "/cmas", label: "CMAs" },
  },
  {
    flag: "ai_staff_document_check",
    name: "Document check",
    what: "On a transaction's Documents tab: sends one file to the assistant, which suggests which checklist documents it is and points out missing signatures, initials or blanks, with pages. You save the types; nothing from the check is kept.",
    where: { href: "/deals", label: "Deals" },
  },
  {
    flag: "ai_staff_receipt_reader",
    name: "Receipt reader",
    what: "On a transaction's Receipts tab: reads an attached receipt into vendor, total, date and a category. You check the values and add the receipt; card and account numbers are never read out.",
    where: { href: "/deals", label: "Deals" },
  },
  {
    flag: "ai_staff_inspection_items",
    name: "Repair items from an inspection report",
    what: "On a transaction's Documents tab, next to a home or pest inspection report: lists the repair items with pages, by trade. You edit and approve the list; the bid list for contractors is made from it. No costs or names.",
    where: { href: "/deals", label: "Deals" },
  },
  {
    flag: "ai_staff_repair_response",
    name: "Response to the buyer's request for repairs",
    what: "On a transaction's Repairs tab: you decide each item with the seller (repair, credit, decline); the console writes the item list and totals, and the assistant writes only a short opening and closing. You approve it, then copy, email or print it.",
    where: { href: "/deals", label: "Deals" },
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
