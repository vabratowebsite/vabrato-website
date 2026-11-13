import { z } from "zod";
import type { AiFeature, InputPart } from "@vabrato/ai";
import { CALL_LIMITS, addDaysISO } from "./appointment-kinds";
import { firstName } from "./draft-kinds";
import { redactContacts, tidyDraft, type DraftText } from "./drafts";

// Call notes (S6b PR 8, switch ai_staff_call_notes): the person types notes
// after a call; the assistant suggests to-dos and, if the call needs one, a
// follow-up email. The notes are the person's own words (the instruction, so
// the Fair Housing input check runs on them), with contact details redacted
// first. Our code picks the few facts sent with them. Nothing is added or
// sent by itself: the person ticks the to-dos to add and approves the email.

const SYSTEM = `You help an agent or assistant at Vabrato Real Estate Services, a residential brokerage on the San Francisco Peninsula, after a phone call. You're given their notes from the call (their own words) and a few facts about who they spoke with.

1. To-dos: list up to 8 things the person said they or the team need to do, each a short instruction starting with a verb (under 100 characters), with the number of days from today it should be done by (0 means today), or null if the notes give no timing. Only what the notes call for: don't add tasks of your own, don't repeat one, and never include phone numbers, email addresses, codes or amounts of money.

2. Follow-up: if the notes call for a message to the person they spoke with (to thank them, confirm what was agreed, or send what was promised), write it as an email draft the person will edit and send themselves: warm, plain and brief, in the first person, signed with the first name given, using the recipient's first name if you have it. Only state what the notes and facts say; if something would help but isn't given (a time, a price, an address), leave a placeholder in square brackets, like [time]. Don't promise anything on Vabrato's behalf beyond what's in the notes. If no message is called for, give null.

Answer with a JSON object: "todos" (a list of {"title", "due_in_days"}) and "followup" ({"subject", "body"} or null).`;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    todos: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, due_in_days: { anyOf: [{ type: "integer" }, { type: "null" }] } }, required: ["title", "due_in_days"], additionalProperties: false },
    },
    followup: { anyOf: [{ type: "object", properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"], additionalProperties: false }, { type: "null" }] },
  },
  required: ["todos", "followup"],
  additionalProperties: false,
};

const Answer = z
  .object({
    todos: z.array(z.object({ title: z.string().max(1000), due_in_days: z.number().int().nullable().catch(null) }).strict()).max(40),
    followup: z.object({ subject: z.string().max(400), body: z.string().max(16000) }).strict().nullable(),
  })
  .strict();
export type CallAnswer = z.infer<typeof Answer>;

export const CALL_NOTES: AiFeature<CallAnswer> = {
  key: "staff_call_notes",
  system: SYSTEM,
  effort: "medium",
  maxTokens: 3000,
  output: { kind: "json", jsonSchema: JSON_SCHEMA, parse: (v) => Answer.parse(v) },
};

const LEAD_KIND_LABEL: Record<string, string> = {
  contact: "someone who asked a question on the website",
  valuation: "someone who asked for a home valuation",
  tour: "someone who asked to tour a listing",
  transform: "someone who asked about renovation or design services",
  newsletter: "a newsletter subscriber",
  open_house_signin: "someone who signed in at an open house",
};

export type CallTarget =
  | { kind: "lead"; leadKind: string; name: string | null }
  | { kind: "deal"; address: string; sellerNames: (string | null)[]; closingDate: string };

/** The facts sent with the notes: first names, the property and dates only; never contact details. */
export function callNotesInput(target: CallTarget, senderName: string | null, today: string): InputPart[] {
  const todayText = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const lines = [`Today is ${todayText} (${today}).`];
  if (target.kind === "lead") {
    lines.push(`They spoke with ${LEAD_KIND_LABEL[target.leadKind] ?? "a lead from the website"}.`, `Their first name: ${firstName(target.name) ?? "not given"}.`);
  } else {
    const sellers = [...new Set(target.sellerNames.map(firstName).filter((n): n is string => Boolean(n)))];
    lines.push(
      `They spoke about the sale of ${target.address} (Vabrato represents the seller).`,
      `The seller's first name${sellers.length > 1 ? "s" : ""}: ${sellers.length ? sellers.join(" and ") : "not given"}.`,
      `Close of escrow: ${target.closingDate}.`,
    );
  }
  lines.push(`Sign any email as: ${firstName(senderName) ?? "[your name]"}, Vabrato Real Estate Services.`);
  return [{ type: "text", text: lines.join("\n") }];
}

export interface SuggestedTodo {
  title: string;
  /** YYYY-MM-DD, or "" for no date. */
  due: string;
}

export interface CallResult {
  todos: SuggestedTodo[];
  followup: DraftText | null;
}

const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** One line, contact details and links out, capped. */
export function cleanTodoTitle(s: string): string {
  const t = redactContacts(s.replace(/\s+/g, " ").trim()).replace(LINK, "[link]");
  return t.length > CALL_LIMITS.todoTitle ? `${t.slice(0, CALL_LIMITS.todoTitle - 1)}…` : t;
}

/** Up to 8 distinct to-dos with dates from today; the follow-up tidied. */
export function toCallResult(a: CallAnswer, today: string): CallResult {
  const seen = new Set<string>();
  const todos: SuggestedTodo[] = [];
  for (const t of a.todos) {
    const title = cleanTodoTitle(t.title);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    const n = t.due_in_days;
    todos.push({ title, due: n !== null && n >= 0 && n <= CALL_LIMITS.maxDays ? addDaysISO(today, n) : "" });
    if (todos.length === CALL_LIMITS.todos) break;
  }
  const followup = a.followup && a.followup.body.trim() ? tidyDraft(a.followup) : null;
  return { todos, followup: followup ? { subject: followup.subject.replace(LINK, "[link]"), body: followup.body.replace(LINK, "[link]") } : null };
}
