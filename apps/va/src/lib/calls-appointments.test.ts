import { describe, expect, it } from "vitest";
import { runAi, type AiFeature, type AiStore, type ModelClient, type ModelRequest } from "@vabrato/ai";
import { whenText, lengthText, validTime } from "./appointment-kinds";
import { APPOINTMENT, appointmentInput, appointmentProblems, checkFields, toAppointment, type AppointmentAnswer } from "./appointments";
import { ASSISTANT_FEATURES } from "./assistant";
import { CALL_NOTES, callNotesInput, toCallResult } from "./calls";
import { prepareNote } from "./drafts";

// S6b PR 8: call notes to to-dos and a follow-up; appointment drafts. What
// each sends, and what our code keeps of the answers. Fictional people,
// places and times.

async function ask<T>(feature: AiFeature<T>, input: Parameters<typeof runAi>[2], answer: unknown) {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return { text: JSON.stringify(answer), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 800, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  const begun: { feature: string; deal: string | null }[] = [];
  const store: AiStore = {
    begin: async (f, deal) => {
      begun.push({ feature: f, deal: deal ?? null });
      return { allowed: true, run_id: "run-1" };
    },
    finish: async () => undefined,
  };
  return { result: await runAi({ store, model, log: () => undefined }, feature, input), request: requests[0], begun };
}

const TODAY = "2026-11-13"; // a Friday
const DEAL_TARGET = { kind: "deal" as const, address: "1 Fixture Way, Belmont", sellerNames: ["Dana Example, Trustee of the Example Trust", null], closingDate: "2026-12-01" };

describe("call notes", () => {
  const ANSWER = {
    todos: [
      { title: "Send the HOA documents to the buyer's agent", due_in_days: 1 },
      { title: "Send the HOA documents to the buyer's agent", due_in_days: 2 },
      { title: "Call the stager at 650-555-0123 or stage@example.com", due_in_days: 0 },
      { title: "Check https://example.com/disclosures for the new form", due_in_days: 90 },
      { title: "   ", due_in_days: 1 },
      ...Array.from({ length: 10 }, (_, i) => ({ title: `Task ${i + 1}`, due_in_days: null })),
    ],
    followup: { subject: "Thanks for the call", body: "Hi Dana,\n\n\n\nThanks for the call today. I'll send the HOA documents tomorrow.\n\nAvery" },
  };

  it("sends the person's notes as their own words, with first names, the property and dates; never contacts", async () => {
    const notes = prepareNote("Dana called (650) 555-0123, wants HOA docs sent to buyer agent pat@example.com tomorrow; stager Tuesday.");
    const { request, begun } = await ask(CALL_NOTES, { instruction: notes.note, parts: callNotesInput(DEAL_TARGET, "Avery Example", TODAY), dealId: "deal-1" }, ANSWER);
    expect(begun).toEqual([{ feature: "staff_call_notes", deal: "deal-1" }]);
    const all = JSON.stringify(request);
    expect(all).toContain("Today is Friday, November 13, 2026 (2026-11-13).");
    expect(all).toContain("The seller's first name: Dana.");
    expect(all).toContain("Close of escrow: 2026-12-01.");
    expect(all).toContain("Sign any email as: Avery, Vabrato Real Estate Services.");
    expect(all).not.toMatch(/555-0123|@example\.com|Trustee/);
    expect(all).toContain("[phone]");
  });

  it("a lead: what they asked about and their first name only", () => {
    const text = JSON.stringify(callNotesInput({ kind: "lead", leadKind: "valuation", name: "Jordan Example" }, null, TODAY));
    expect(text).toContain("someone who asked for a home valuation");
    expect(text).toContain("Their first name: Jordan.");
    expect(text).toContain("Sign any email as: [your name]");
    expect(text).not.toContain("Example");
  });

  it("notes with lockbox codes or Fair Housing wording are stopped before anything is sent", async () => {
    expect(prepareNote("Lockbox code is 1234, tell the inspector").error).toMatch(/lockbox/i);
    const { result, request } = await ask(CALL_NOTES, { instruction: "Seller wants it marketed as no children, adults only", parts: callNotesInput(DEAL_TARGET, null, TODAY) }, ANSWER);
    expect(result).toMatchObject({ ok: false, reason: "fair_housing_input" });
    expect(request).toBeUndefined();
  });

  it("to-dos: distinct, contacts and links out, dates from today, at most 8; the follow-up tidied", () => {
    const r = toCallResult(ANSWER as never, TODAY);
    expect(r.todos).toHaveLength(8);
    expect(r.todos[0]).toEqual({ title: "Send the HOA documents to the buyer's agent", due: "2026-11-14" });
    expect(r.todos[1]).toEqual({ title: "Call the stager at [phone] or [email]", due: "2026-11-13" });
    expect(r.todos[2]).toEqual({ title: "Check [link] for the new form", due: "" });
    expect(r.todos[3]).toEqual({ title: "Task 1", due: "" });
    expect(r.followup).toEqual({ subject: "Thanks for the call", body: "Hi Dana,\n\nThanks for the call today. I'll send the HOA documents tomorrow.\n\nAvery" });
    expect(toCallResult({ todos: [], followup: null }, TODAY)).toEqual({ todos: [], followup: null });
  });

  it("a follow-up with wiring details is refused", async () => {
    const { result } = await ask(CALL_NOTES, { instruction: "Seller asked how to send the deposit", parts: callNotesInput(DEAL_TARGET, null, TODAY) }, { todos: [], followup: { subject: "Deposit", body: "Wire the deposit to routing number 999999999, account 000123456789." } });
    expect(result).toMatchObject({ ok: false, reason: "payment_instructions" });
  });
});

describe("appointment drafts", () => {
  const ANSWER = (over: Partial<AppointmentAnswer> = {}): AppointmentAnswer => ({
    title: "Final walkthrough",
    date: "2026-11-17",
    start: "15:00",
    minutes: 45,
    location: "1 Fixture Way, Belmont",
    with: "Dana",
    subject: "Walkthrough on [when]",
    body: "Hi Dana,\n\nJust confirming our final walkthrough on [when] at 1 Fixture Way, Belmont. It should take about 45 minutes.\n\nAvery",
    ...over,
  });

  it("sends the sentence, today and the property; never contact or access details", async () => {
    const sentence = prepareNote("walkthrough with Dana Tuesday 3pm 45 min at the house, her cell 650-555-0123");
    const { request, begun } = await ask(APPOINTMENT, { instruction: sentence.note, parts: appointmentInput({ kind: "deal", address: "1 Fixture Way, Belmont", sellerNames: ["Dana Example"] }, "Avery Example", TODAY), dealId: "deal-1" }, ANSWER());
    expect(begun).toEqual([{ feature: "staff_appointments", deal: "deal-1" }]);
    const all = JSON.stringify(request);
    expect(all).toContain("Today is Friday, November 13, 2026 (2026-11-13).");
    expect(all).toContain("The property: 1 Fixture Way, Belmont");
    expect(all).not.toMatch(/555-0123|Example/);
    expect(request!.system).toMatch(/Never guess a time/);
    expect(prepareNote("showing at 4, gate code 4455").error).toMatch(/lockbox|access/i);
  });

  it("a lead: first name and the listing they asked about", () => {
    const text = JSON.stringify(appointmentInput({ kind: "lead", name: "Jordan Example", listingAddress: "12 Fictional Lane, San Carlos" }, null, TODAY));
    expect(text).toContain("Their first name: Jordan.");
    expect(text).toContain("The listing they asked about: 12 Fictional Lane, San Carlos.");
  });

  it("fills [when] from checked fields and keeps the times the model gave only when they're possible", () => {
    const a = toAppointment(ANSWER(), TODAY);
    expect(a.fields).toEqual({ title: "Final walkthrough", date: "2026-11-17", start: "15:00", minutes: 45, location: "1 Fixture Way, Belmont", with: "Dana" });
    expect(a.subject).toBe("Walkthrough on Tuesday, November 17 at 3:00 PM");
    expect(a.body).toContain("on Tuesday, November 17 at 3:00 PM at 1 Fixture Way");
    const bad = toAppointment(ANSWER({ date: "2026-11-10", start: "15:07", minutes: 5 }), TODAY);
    expect(bad.fields).toMatchObject({ date: "", start: "", minutes: null });
    expect(bad.body).toContain("[when]");
    expect(toAppointment(ANSWER({ date: "2027-12-01" }), TODAY).fields.date).toBe("");
    expect(toAppointment(ANSWER({ date: "2026-02-30" }), TODAY).fields.date).toBe("");
    expect(toAppointment(ANSWER({ start: "23:00" }), TODAY).fields.start).toBe("");
    expect(toAppointment(ANSWER({ date: null, start: null, minutes: null }), TODAY).fields).toMatchObject({ date: "", start: "", minutes: null });
  });

  it("strips contacts, links and access details from the fields", () => {
    const f = checkFields({ title: "Visit, call 650-555-0123", location: "Lockbox on the side gate, code 1234", with: "Dana (dana@example.com)", date: "2026-11-17", start: "09:30", minutes: 60 }, TODAY);
    expect(f).toEqual({ title: "Visit, call [phone]", date: "2026-11-17", start: "09:30", minutes: 60, location: "", with: "Dana ([email])" });
    expect(checkFields({ title: "", location: "See www.example.com" }, TODAY)).toMatchObject({ title: "Appointment", location: "See" });
  });

  it("approval: the confirmation must state the date and time the fields say", () => {
    const a = toAppointment(ANSWER(), TODAY);
    expect(appointmentProblems(a.fields, a.subject, a.body, TODAY)).toEqual([]);
    const moved = { ...a.fields, start: "16:00" };
    expect(appointmentProblems(moved, a.subject, a.body, TODAY)).toEqual(['The confirmation must say "Tuesday, November 17 at 4:00 PM" so it matches the appointment.']);
    expect(appointmentProblems({ ...a.fields, date: "", start: "", minutes: null }, a.subject, a.body, TODAY)).toEqual(["Add the date.", "Add the start time.", "Set the length (15 minutes to 8 hours)."]);
    expect(appointmentProblems(a.fields, a.subject, `${a.body}\n[parking]`, TODAY)).toEqual(["Fill in or remove [parking]."]);
    expect(appointmentProblems(a.fields, a.subject, `${a.body}\nText me at 650-555-0123.`, TODAY)[0]).toMatch(/phone numbers/);
    expect(appointmentProblems(a.fields, a.subject, `${a.body}\nThe lockbox is on the side gate.`, TODAY)[0]).toMatch(/lockbox/);
    expect(appointmentProblems(a.fields, a.subject, `${a.body}\nWire the deposit to routing 999999999 account 000123456789.`, TODAY).join(" ")).toMatch(/wiring/);
    expect(appointmentProblems(a.fields, a.subject, a.body, "2026-11-18")).toEqual(["Pick a date from today to a year ahead."]);
  });

  it("date and time wording", () => {
    expect(whenText("2026-11-17", "09:05")).toBe("Tuesday, November 17 at 9:05 AM");
    expect(whenText("2026-12-31", "12:00")).toBe("Thursday, December 31 at 12:00 PM");
    expect(lengthText(45)).toBe("45 minutes");
    expect(lengthText(90)).toBe("1 hour 30 minutes");
    expect(lengthText(120)).toBe("2 hours");
    expect(validTime("07:00")).toBe("07:00");
    expect(validTime("06:55")).toBeNull();
    expect(validTime("21:05")).toBeNull();
  });
});

it("both features have their switches on /assistant", () => {
  const flags = ASSISTANT_FEATURES.map((f) => f.flag);
  expect(flags).toContain(`ai_${CALL_NOTES.key}`);
  expect(flags).toContain(`ai_${APPOINTMENT.key}`);
});
