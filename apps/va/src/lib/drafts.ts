import { z } from "zod";
import type { EmailDraftKind } from "@vabrato/db";
import { fairHousingBlocks, listingForAi, paymentInstructionMatches, type AiFeature, type InputPart } from "@vabrato/ai";
import { MAX_BODY, MAX_SUBJECT, firstName } from "./draft-kinds";
import { payloadRows } from "./leads";

// AI drafts (S6b PR 3), server side: the four features and what each one
// sends to the model. Our code picks the facts; the model only writes the
// email. What a client or stranger wrote (a lead's message, their form
// answers, task titles someone typed) goes in as data, never as
// instructions. Contact details, prices, escrow numbers, documents and
// access details are never sent (SPEC <ai_rules>), and the tests check it.

const SHARED = `You are writing an email draft for an agent or assistant at Vabrato Real Estate Services, a residential brokerage on the San Francisco Peninsula (San Mateo and Santa Clara counties). The person will read and edit your draft, then send it themselves from their own email. Nothing is sent automatically.

Write as that person, in the first person, and sign with the first name given. Be warm, plain and brief: short paragraphs, no headings, no bullet lists unless they help, no emoji, no exclamation marks in a row, no marketing clichés. Use the recipient's first name if you have it, otherwise "Hi there". Only state facts given to you here; if something would help but isn't given (a time, a price, an address), leave a clear placeholder in square brackets, like [time], for the person to fill in. Don't promise anything on Vabrato's behalf beyond what's given.

Answer with a JSON object: "subject" (a short email subject, under 80 characters) and "body" (the email text, plain text with blank lines between paragraphs, ending with the sign-off).`;

const KIND_RULES: Record<EmailDraftKind, string> = {
  lead_reply: `This is a first reply to someone who contacted Vabrato through the website. Thank them, answer what they asked if the facts given answer it, and suggest one clear next step (a call, a showing, a valuation visit). If they asked about a specific listing, you may mention its features from the listing facts given; never describe who the home or area would suit.`,
  open_house_followup: `This is a follow-up to someone who signed in at one of Vabrato's open houses. Thank them for visiting, mention the home briefly from the listing facts given, and offer help: a second look, disclosures, or questions. If they said they already work with an agent, keep it short and courteous and don't try to win them over.`,
  escrow_update: `This is an update for the seller on their sale, written from the transaction's task list. Say where things stand: what's done recently, what's coming up in the next two weeks with the dates given, and the close of escrow date. Keep dates exactly as given and don't add deadlines. If a contingency removal date is coming up, say the buyer's side is due to remove it then. Don't mention money amounts.`,
  vendor_request: `This is a request to a vendor (an inspector, contractor or service company) for a quote or appointment for a property in escrow. Say who you are, the property address, what's needed (from the person's request), and by when if a date is given. Ask for their availability and a written quote. Don't mention the clients, the price, or how to get into the property: the person adds access details themselves.`,
};

const DRAFT_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" }, body: { type: "string" } },
  required: ["subject", "body"],
  additionalProperties: false,
};
const Draft = z.object({ subject: z.string().max(400), body: z.string().min(1).max(16000) }).strict();
export type DraftText = z.infer<typeof Draft>;

const feature = (kind: EmailDraftKind): AiFeature<DraftText> => ({
  key: `staff_${kind}`,
  system: `${SHARED}\n\n${KIND_RULES[kind]}`,
  effort: "medium",
  maxTokens: 2000,
  output: { kind: "json", jsonSchema: DRAFT_SCHEMA, parse: (v) => Draft.parse(v) },
});

export const DRAFT_FEATURES: Record<EmailDraftKind, AiFeature<DraftText>> = {
  lead_reply: feature("lead_reply"),
  open_house_followup: feature("open_house_followup"),
  escrow_update: feature("escrow_update"),
  vendor_request: feature("vendor_request"),
};

/** The model's answer, tidied to fit the draft row. */
export function tidyDraft(d: DraftText): DraftText {
  const subject = d.subject.replace(/\s+/g, " ").trim().slice(0, MAX_SUBJECT);
  const body = d.body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_BODY);
  return { subject, body };
}

// --- What each draft sends ---------------------------------------------------------------------

/**
 * Free text someone typed (a lead's message, a task title) can hold an email
 * address or phone number; contact details never go to the model.
 */
export function redactContacts(text: string): string {
  return text
    .replace(/[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]");
}

type Fields = Record<string, unknown>;
const LEAD_KIND_LABEL: Record<string, string> = {
  contact: "a general question from the contact form",
  valuation: "a home valuation request",
  tour: "a request to tour a listing",
  transform: "an enquiry about renovation or design services",
  newsletter: "a newsletter sign-up",
  open_house_signin: "an open-house sign-in",
};
/** Form answers worth sending. Not "address": a valuation lead's own home address identifies them. */
const LEAD_PAYLOAD_SENT = new Set(["Topic", "Timeline", "Preferred day", "Tour type", "Project", "Budget", "Working with an agent", "Asked for agent"]);

export interface LeadFacts {
  kind: string;
  name: string | null;
  message: string | null;
  payload: unknown;
  /** The listing's record (mls_listings.data), if the lead is about one. */
  listing: Fields | null;
  /** When the open house was, for a sign-in. */
  openHouse: { start: string; end: string | null } | null;
  /** Who signs the email. */
  senderName: string | null;
}

export function leadParts(f: LeadFacts): InputPart[] {
  const lines = [
    `What came in: ${LEAD_KIND_LABEL[f.kind] ?? "a website enquiry"}.`,
    `Their first name: ${firstName(f.name) ?? "not given"}.`,
    `Sign the email as: ${firstName(f.senderName) ?? "[your name]"}, Vabrato Real Estate Services.`,
  ];
  if (f.openHouse) lines.push(`The open house was on ${fmtDateTime(f.openHouse.start)}.`);
  const parts: InputPart[] = [{ type: "text", text: lines.join("\n") }];
  const answers = payloadRows(f.payload).filter((r) => LEAD_PAYLOAD_SENT.has(r.label));
  if (answers.length) parts.push({ type: "data", label: "Their answers on the form", text: redactContacts(answers.map((r) => `${r.label}: ${r.value}`).join("\n")) });
  if (f.message?.trim()) parts.push({ type: "data", label: "Their message", text: redactContacts(f.message.trim().slice(0, 4000)) });
  if (f.listing) parts.push({ type: "data", label: "The listing (public listing facts)", text: JSON.stringify(listingForAi(f.listing as never, "IDX")) });
  return parts;
}

export interface EscrowFacts {
  address: string;
  ratificationDate: string;
  coeDate: string;
  rentBackDays: number;
  /** The seller's names as on the deal, or the seller members' names. */
  sellerNames: (string | null)[];
  tasks: { title: string; owner: string; due_date: string; done: boolean }[];
  contingencies: { kind: string; due_date: string | null; removed_at: string | null }[];
  senderName: string | null;
  today: string;
}

const CONTINGENCY_LABEL: Record<string, string> = {
  insurance: "insurance",
  financing: "loan",
  appraisal: "appraisal",
  property_condition: "property condition (inspections)",
};

export function escrowParts(f: EscrowFacts): InputPart[] {
  const sellers = [...new Set(f.sellerNames.map(firstName).filter((n): n is string => Boolean(n)))];
  const lines = [
    `Property: ${f.address}.`,
    `Today is ${f.today}. Accepted on ${f.ratificationDate}. Close of escrow: ${f.coeDate}.`,
    f.rentBackDays > 0 ? `The seller stays for ${f.rentBackDays} days after close of escrow.` : "Possession passes at close of escrow.",
    `Write to: ${sellers.length ? sellers.join(" and ") : "the seller (no first name on file)"}.`,
    `Sign the email as: ${firstName(f.senderName) ?? "[your name]"}, Vabrato Real Estate Services.`,
  ];
  const conts = f.contingencies.map(
    (c) => `${CONTINGENCY_LABEL[c.kind] ?? c.kind}: ${c.removed_at ? "removed" : c.due_date ? `removal due ${c.due_date}` : "no date"}`,
  );
  if (conts.length) lines.push(`Contingencies: ${conts.join("; ")}.`);
  else lines.push("Contingencies: none.");
  const tasks = f.tasks
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .map((t) => `${t.due_date} | ${t.done ? "done" : "open"} | ${t.owner} | ${redactContacts(t.title.slice(0, 160))}`);
  return [
    { type: "text", text: lines.join("\n") },
    { type: "data", label: "Task list (due date | status | who | task)", text: tasks.join("\n").slice(0, 12000) || "No tasks." },
  ];
}

export interface VendorFacts {
  vendorName: string;
  vendorRole: string;
  address: string;
  coeDate: string;
  senderName: string | null;
}

export function vendorParts(f: VendorFacts): InputPart[] {
  return [
    {
      type: "text",
      text: [
        `Vendor: ${f.vendorName.slice(0, 120)} (${f.vendorRole.slice(0, 80)}).`,
        `Property: ${f.address}.`,
        `The sale is due to close on ${f.coeDate}.`,
        `Sign the email as: ${firstName(f.senderName) ?? "[your name]"}, Vabrato Real Estate Services.`,
      ].join("\n"),
    },
  ];
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Access details the person might type into their note; they never go to the model (SPEC <ai_rules>). */
const ACCESS_DETAILS = /\b(?:lock\s?box|key\s?safe|supra|gate\s+code|door\s+code|garage\s+code|alarm\s+code|access\s+code|showing\s+instructions?|key\s+is\s+(?:under|in|behind))\b/i;

/**
 * The person's own note, ready to send: access details are refused (they add
 * those to the email themselves), and phone numbers and email addresses are
 * replaced with placeholders.
 */
export function prepareNote(note: string | undefined): { note?: string; error?: string } {
  const text = note?.trim();
  if (!text) return {};
  if (ACCESS_DETAILS.test(text)) return { error: "Leave lockbox codes and access details out of the note. Add them to the email yourself after you approve it." };
  return { note: redactContacts(text) };
}

// --- The text a person approves ----------------------------------------------------------------

/**
 * Checks the final text before it can be approved: the person may have
 * edited the draft, and what leaves Vabrato must pass the same checks as
 * what the model wrote. Returns problems in plain words, or none.
 */
export function approvalProblems(subject: string, body: string): string[] {
  const text = `${subject}\n${body}`;
  const problems: string[] = [];
  const fh = fairHousingBlocks(text);
  if (fh.length) problems.push(`Fair Housing: reword ${fh.map((i) => `"${i.match}"`).join(", ")}. Describe the home and the place, not who it would suit.`);
  if (paymentInstructionMatches(text).length) problems.push("Remove the payment or wiring details. Vabrato never sends those by email; clients call escrow to verify wiring.");
  if (!body.trim()) problems.push("The email is empty.");
  if (subject.length > MAX_SUBJECT) problems.push(`Shorten the subject to ${MAX_SUBJECT} characters.`);
  if (body.length > MAX_BODY) problems.push(`Shorten the email to ${MAX_BODY.toLocaleString("en-US")} characters.`);
  return problems;
}
