import type { AiDraftKind, EmailDraftKind } from "@vabrato/db";

// AI drafts (S6b PR 3): what the console knows about each kind of draft. No
// model code here, so pages, client components and tests can use it.

export interface DraftKindInfo {
  kind: AiDraftKind;
  /** feature_flags.key (the pipeline's feature key is the same without "ai_"). */
  flag: `ai_staff_${string}`;
  /** Feature name on /assistant and in lists. */
  name: string;
  /** One draft of this kind. */
  one: string;
  /** Panel heading. */
  heading: string;
}

export const DRAFT_KINDS: Record<AiDraftKind, DraftKindInfo> = {
  lead_reply: { kind: "lead_reply", flag: "ai_staff_lead_reply", name: "Lead replies", one: "Lead reply", heading: "Draft a reply" },
  open_house_followup: { kind: "open_house_followup", flag: "ai_staff_open_house_followup", name: "Open-house follow-ups", one: "Open-house follow-up", heading: "Draft a follow-up" },
  escrow_update: { kind: "escrow_update", flag: "ai_staff_escrow_update", name: "Escrow updates", one: "Escrow update", heading: "Draft an escrow update" },
  vendor_request: { kind: "vendor_request", flag: "ai_staff_vendor_request", name: "Vendor quote requests", one: "Vendor quote request", heading: "Ask a vendor for a quote" },
  listing_kit: { kind: "listing_kit", flag: "ai_staff_listing_kit", name: "Listing launch kits", one: "Launch kit", heading: "Launch kit" },
  listing_presentation: { kind: "listing_presentation", flag: "ai_staff_presentations", name: "Presentations", one: "Listing presentation", heading: "Listing presentation" },
  buyer_presentation: { kind: "buyer_presentation", flag: "ai_staff_presentations", name: "Presentations", one: "Buyer presentation", heading: "Buyer presentation" },
  market_update: { kind: "market_update", flag: "ai_staff_market_update", name: "Market updates", one: "Market update", heading: "Market update" },
  cma_writeup: { kind: "cma_writeup", flag: "ai_staff_cma_writeup", name: "CMA write-ups", one: "CMA write-up", heading: "Summary" },
  inspection_items: { kind: "inspection_items", flag: "ai_staff_inspection_items", name: "Repair items", one: "Repair items", heading: "Repair items" },
  repair_response: { kind: "repair_response", flag: "ai_staff_repair_response", name: "Repair responses", one: "Response to the request for repairs", heading: "Response to the buyer's request for repairs" },
};

/** The draft a lead gets: open-house visitors a follow-up, everyone else a reply. */
export const leadDraftKind = (leadKind: string): EmailDraftKind => (leadKind === "open_house_signin" ? "open_house_followup" : "lead_reply");

export const DRAFT_STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved", discarded: "Discarded" };
export const SENT_VIA_LABEL: Record<string, string> = { email: "opened in email", copy: "copied", portal: "sent as a portal message", print: "printed", website: "sent to website review" };

/** Limits shared by the form and the database (0028). */
export const MAX_SUBJECT = 200;
export const MAX_BODY = 8000;
/** A portal message holds at most this much (0019). */
export const MAX_PORTAL_MESSAGE = 4000;

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/**
 * A mailto: link with the subject and body filled in, for the person's own
 * mail app. Addresses come from our records, never from the model; anything
 * that isn't a plain address is left out.
 */
export function mailtoHref(to: string[], subject: string, body: string): string {
  const addresses = to.map((a) => a.trim()).filter((a) => EMAIL.test(a));
  const query = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`].join("&");
  return `mailto:${addresses.map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",")}?${query}`;
}

/** First name for a greeting: "Dana Example, Trustee of …" → "Dana". */
export function firstName(full: string | null | undefined): string | null {
  const word = (full ?? "").trim().split(/[\s,]+/)[0] ?? "";
  return /^[\p{L}][\p{L}'’-]{0,39}$/u.test(word) ? word : null;
}
