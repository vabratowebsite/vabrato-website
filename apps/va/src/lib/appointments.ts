import { z } from "zod";
import type { AiFeature, InputPart } from "@vabrato/ai";
import { APPT_LIMITS, addDaysISO, validDate, validTime, whenText, type AppointmentFields } from "./appointment-kinds";
import { firstName } from "./draft-kinds";
import { ACCESS_DETAILS, approvalProblems, redactContacts, tidyDraft } from "./drafts";

// Appointment drafts (S6b PR 8, switch ai_staff_appointments): from one
// sentence the person types, the assistant proposes the appointment and a
// confirmation email. Our code checks every field (a real date from today
// to a year ahead, 07:00-21:00 in 5-minute steps, 15-480 minutes) and leaves
// anything wrong blank for the person. At approval the confirmation must
// state the date and time exactly as the fields say. It goes on a calendar
// only when a person opens the calendar file; the console books nothing.

const SYSTEM = `You help an agent or assistant at Vabrato Real Estate Services, a residential brokerage on the San Francisco Peninsula, set up an appointment. You're given one sentence from them describing it, today's date, and a few facts. All times are California time.

Give the appointment's fields:
- title: a short name for it, like "Final walkthrough" or "Valuation visit" (under 60 characters).
- date: YYYY-MM-DD. Work out weekdays and "tomorrow" from today's date (a weekday means the next one after today). If the sentence gives no date or it's unclear, null.
- start: the start time as HH:MM on a 24-hour clock. If none is given or it's unclear, null. Never guess a time.
- minutes: the length in minutes if given, otherwise null.
- location: where, as given; "the house" or "the property" means the property address given. Otherwise an empty string.
- with: who it's with, first names only, as the sentence says.

Then write a short confirmation email to the person they're meeting, for the agent or assistant to edit and send themselves: warm, plain and brief, in the first person, signed with the first name given. Where the date and time go, write the placeholder [when] exactly; our system fills it in. Include the place. Don't add anything that isn't given; leave a placeholder in square brackets, like [parking], if something would help. Never include lockbox, gate or door codes, or how to get into the property.

Answer with a JSON object: "title", "date", "start", "minutes", "location", "with", "subject" and "body".`;

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    date: nullable("string"),
    start: nullable("string"),
    minutes: nullable("integer"),
    location: { type: "string" },
    with: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["title", "date", "start", "minutes", "location", "with", "subject", "body"],
  additionalProperties: false,
};

const Answer = z
  .object({
    title: z.string().max(1000),
    date: z.string().max(40).nullable(),
    start: z.string().max(40).nullable(),
    minutes: z.number().int().nullable().catch(null),
    location: z.string().max(1000),
    with: z.string().max(1000),
    subject: z.string().max(400),
    body: z.string().max(16000),
  })
  .strict();
export type AppointmentAnswer = z.infer<typeof Answer>;

export const APPOINTMENT: AiFeature<AppointmentAnswer> = {
  key: "staff_appointments",
  system: SYSTEM,
  effort: "medium",
  maxTokens: 2000,
  output: { kind: "json", jsonSchema: JSON_SCHEMA, parse: (v) => Answer.parse(v) },
};

export type AppointmentTarget = { kind: "lead"; name: string | null; listingAddress: string | null } | { kind: "deal"; address: string; sellerNames: (string | null)[] };

/** What an appointment draft sends with the sentence: today, the property, first names. Never contact or access details. */
export function appointmentInput(target: AppointmentTarget, senderName: string | null, today: string): InputPart[] {
  const todayText = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const lines = [`Today is ${todayText} (${today}).`];
  if (target.kind === "deal") {
    const sellers = [...new Set(target.sellerNames.map(firstName).filter((n): n is string => Boolean(n)))];
    lines.push(`The property: ${target.address} (Vabrato represents the seller).`, `The seller's first name${sellers.length > 1 ? "s" : ""}: ${sellers.length ? sellers.join(" and ") : "not given"}.`);
  } else {
    lines.push(`It's with a lead from the website. Their first name: ${firstName(target.name) ?? "not given"}.`);
    if (target.listingAddress) lines.push(`The listing they asked about: ${target.listingAddress}.`);
  }
  lines.push(`Sign the email as: ${firstName(senderName) ?? "[your name]"}, Vabrato Real Estate Services.`);
  return [{ type: "text", text: lines.join("\n") }];
}

const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const clean = (s: string, max: number) => redactContacts(s.replace(/\s+/g, " ").trim()).replace(LINK, "").replace(/\s+/g, " ").trim().slice(0, max);

/** The fields a person may save: each checked, anything wrong left blank. While editing, a past date is kept (approval refuses it). */
export function checkFields(f: Partial<Record<keyof AppointmentFields, unknown>>, today: string, opts: { allowPast?: boolean } = {}): AppointmentFields {
  const date = validDate(typeof f.date === "string" ? f.date : null);
  const inRange = date !== null && (opts.allowPast || date >= today) && date <= addDaysISO(today, 365);
  const minutes = typeof f.minutes === "number" && Number.isInteger(f.minutes) && f.minutes >= APPT_LIMITS.minMinutes && f.minutes <= APPT_LIMITS.maxMinutes ? f.minutes : null;
  return {
    title: clean(typeof f.title === "string" ? f.title : "", APPT_LIMITS.title) || "Appointment",
    date: inRange ? date! : "",
    start: validTime(typeof f.start === "string" ? f.start : null) ?? "",
    minutes,
    location: ACCESS_DETAILS.test(String(f.location ?? "")) ? "" : clean(typeof f.location === "string" ? f.location : "", APPT_LIMITS.location),
    with: clean(typeof f.with === "string" ? f.with : "", APPT_LIMITS.with),
  };
}

export interface AppointmentDraft {
  fields: AppointmentFields;
  subject: string;
  body: string;
}

/** The model's proposal, checked: fields as above, [when] filled in when the date and time are known. */
export function toAppointment(a: AppointmentAnswer, today: string): AppointmentDraft {
  const fields = checkFields(a, today);
  const text = tidyDraft({ subject: a.subject, body: a.body });
  const when = fields.date && fields.start ? whenText(fields.date, fields.start) : null;
  const fill = (s: string) => (when ? s.replaceAll("[when]", when) : s).replace(LINK, "[link]");
  return { fields, subject: fill(text.subject), body: fill(text.body) };
}

const PLACEHOLDER = /\[[^\]\n]{1,40}\]/;
const CONTACT = (s: string) => redactContacts(s) !== s;

/**
 * What stops an appointment being approved, in plain words: missing or
 * impossible fields, a confirmation that doesn't state the date and time as
 * the fields say, placeholders left, contact or access details, and the
 * draft checks (Fair Housing, wiring, length).
 */
export function appointmentProblems(fields: AppointmentFields, subject: string, body: string, today: string): string[] {
  const problems: string[] = [];
  const checked = checkFields(fields, today);
  if (!checked.date) problems.push(fields.date ? "Pick a date from today to a year ahead." : "Add the date.");
  if (!checked.start) problems.push(fields.start ? "Pick a start time between 7:00 AM and 9:00 PM, in 5-minute steps." : "Add the start time.");
  if (checked.minutes === null) problems.push(`Set the length (${APPT_LIMITS.minMinutes} minutes to ${APPT_LIMITS.maxMinutes / 60} hours).`);
  if (checked.date && checked.start) {
    const when = whenText(checked.date, checked.start);
    if (!body.includes(when)) problems.push(`The confirmation must say "${when}" so it matches the appointment.`);
  }
  const text = `${subject}\n${body}\n${fields.title}\n${fields.location}\n${fields.with}`;
  const left = PLACEHOLDER.exec(`${subject}\n${body}`);
  if (left) problems.push(`Fill in or remove ${left[0]}.`);
  if (CONTACT(text)) problems.push("Remove phone numbers and email addresses; the person has yours already.");
  if (ACCESS_DETAILS.test(text)) problems.push("Leave lockbox, gate or door codes and access details out of the appointment.");
  problems.push(...approvalProblems(subject, body));
  return problems;
}
