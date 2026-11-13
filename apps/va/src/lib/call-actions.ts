"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAi } from "@vabrato/ai";
import { STAFF_ROLES, computeCoe, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { APPT_LIMITS, CALL_LIMITS, pacificToday, validDate, type AppointmentFields } from "@/lib/appointment-kinds";
import { APPOINTMENT, appointmentInput, appointmentProblems, checkFields, toAppointment, type AppointmentTarget } from "@/lib/appointments";
import { CALL_NOTES, callNotesInput, cleanTodoTitle, toCallResult, type CallTarget, type SuggestedTodo } from "@/lib/calls";
import type { DraftView } from "@/lib/draft-actions";
import { prepareNote } from "@/lib/drafts";
import { supabaseServer } from "@/lib/supabase-server";

// Call notes, appointment drafts and staff to-dos (S6b PR 8). Every read and
// write runs as the signed-in staff member, so RLS decides (0028 drafts,
// 0035 to-dos: staff who work the lead or the deal). The assistant suggests;
// nothing is added, booked or sent until the person does it.

export type Target = { kind: "lead"; id: string } | { kind: "deal"; id: string };
const TargetSchema = z.object({ kind: z.enum(["lead", "deal"]), id: z.string().uuid() });
const Id = z.string().uuid();
const NO_KEY = "The assistant isn't set up yet: it has no API key. Ask an admin.";
const NOT_YOURS = "That isn't a lead or transaction you work on.";

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

const pathFor = (t: Target) => (t.kind === "lead" ? `/leads/${t.id}` : `/deals/${t.id}`);
const targetCols = (t: Target) => (t.kind === "lead" ? { lead_id: t.id } : { deal_id: t.id });

interface LoadedTarget {
  call: CallTarget;
  appointment: AppointmentTarget;
  dealId: string | null;
}

/** The lead or deal as the caller sees it (RLS), with only what the assistant may be told. */
async function loadTarget(supabase: Supabase, t: Target): Promise<LoadedTarget | null> {
  if (t.kind === "lead") {
    const { data: lead } = await supabase.from("leads").select("id, kind, name, listing_key").eq("id", t.id).maybeSingle();
    if (!lead) return null;
    let listingAddress: string | null = null;
    if (lead.listing_key) {
      const { data: listing } = await supabase.from("mls_listings").select("data").eq("listing_key", lead.listing_key).maybeSingle();
      const d = (listing?.data ?? null) as Record<string, unknown> | null;
      if (d && d.InternetAddressDisplayYN !== false && typeof d.UnparsedAddress === "string") listingAddress = d.UnparsedAddress.slice(0, 200);
    }
    return { call: { kind: "lead", leadKind: lead.kind, name: lead.name }, appointment: { kind: "lead", name: lead.name, listingAddress }, dealId: null };
  }
  const { data: deal } = await supabase.from("deals").select("id, address, ratification_date, days_to_close, seller_name").eq("id", t.id).maybeSingle();
  if (!deal) return null;
  const { data: members } = await supabase.from("deal_members").select("profiles(full_name)").eq("deal_id", deal.id).eq("member_role", "seller");
  const names = (members ?? []).map((m) => (m.profiles as { full_name: string | null } | null)?.full_name ?? null);
  const sellerNames = names.some(Boolean) ? names : [deal.seller_name];
  return {
    call: { kind: "deal", address: deal.address, sellerNames, closingDate: computeCoe(deal.ratification_date, deal.days_to_close) },
    appointment: { kind: "deal", address: deal.address, sellerNames },
    dealId: deal.id,
  };
}

// --- Call notes ------------------------------------------------------------------------------------

const DRAFT_COLS = "id, kind, subject, body, status, sent_via, vendor_id";

export type CallNotesResult = { ok: true; todos: SuggestedTodo[]; followup: DraftView | null; noteSaved: boolean; message: string } | { ok: false; error: string };

/**
 * Reads the person's call notes: suggested to-dos come back to the screen
 * (nothing is added yet) and a follow-up, if the call needs one, is saved as
 * their draft. On a lead, the notes are saved as a lead note only if asked.
 */
export async function readCallNotesAction(rawTarget: Target, notes: string, saveOnLead: boolean): Promise<CallNotesResult> {
  const target = TargetSchema.safeParse(rawTarget);
  if (!target.success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const t = target.data as Target;
  const text = String(notes ?? "").trim();
  if (!text) return { ok: false, error: "Type your notes from the call first." };
  if (text.length > CALL_LIMITS.notes) return { ok: false, error: `Keep the notes under ${CALL_LIMITS.notes.toLocaleString("en-US")} characters.` };
  const prepared = prepareNote(text);
  if (prepared.error) return { ok: false, error: prepared.error.replace("the note", "your notes") };
  try {
    const { supabase, profile } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const loaded = await loadTarget(supabase, t);
    if (!loaded) return { ok: false, error: NOT_YOURS };
    const today = pacificToday();
    const result = await runAi(aiDeps(supabase), CALL_NOTES, { instruction: prepared.note, parts: callNotesInput(loaded.call, profile.full_name || null, today), dealId: loaded.dealId });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const call = toCallResult(result.data, today);

    let followup: DraftView | null = null;
    if (call.followup) {
      const { data, error } = await supabase.from("ai_drafts").insert({ kind: "call_followup", ...targetCols(t), subject: call.followup.subject, body: call.followup.body }).select(DRAFT_COLS).single();
      if (error || !data) return { ok: false, error: "Couldn't save the follow-up draft. Please try again." };
      followup = data as DraftView;
    }
    let noteSaved = false;
    if (saveOnLead && t.kind === "lead") {
      const { error } = await supabase.from("lead_notes").insert({ lead_id: t.id, author_id: profile.id, body: text });
      noteSaved = !error;
    }
    revalidatePath(pathFor(t));
    const parts = [`${call.todos.length ? `${call.todos.length} suggested to-do${call.todos.length === 1 ? "" : "s"}` : "No to-dos suggested"}`, followup ? "a follow-up draft" : "no follow-up needed"];
    return { ok: true, todos: call.todos, followup, noteSaved, message: `Read. ${parts.join(", ")}.${noteSaved ? " Your notes are saved on the lead." : ""}` };
  } catch (e) {
    console.error("[readCallNotes]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong reading your notes. Please try again." };
  }
}

// --- To-dos ----------------------------------------------------------------------------------------

export type TodoResult = { ok: true; message: string } | { ok: false; error: string };

const TodoInput = z.object({ title: z.string().max(400), due: z.string().max(20) });

function cleanTodo(raw: { title: string; due: string }): { title: string; due_date: string | null } | null {
  const title = cleanTodoTitle(String(raw.title ?? "")).slice(0, 200);
  if (!title) return null;
  return { title, due_date: validDate(raw.due) };
}

/** Adds the to-dos the person ticked (from call notes) or typed. */
export async function addTodosAction(rawTarget: Target, todos: { title: string; due: string }[], source: "call_notes" | "manual"): Promise<TodoResult> {
  const target = TargetSchema.safeParse(rawTarget);
  const list = z.array(TodoInput).max(CALL_LIMITS.todos).safeParse(todos);
  if (!target.success || !list.success || (source !== "call_notes" && source !== "manual")) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const rows = list.data.map(cleanTodo).filter((r): r is { title: string; due_date: string | null } => r !== null);
  if (!rows.length) return { ok: false, error: source === "manual" ? "Type the to-do first." : "Tick at least one to-do." };
  const { supabase, profile } = await staffClient();
  const t = target.data as Target;
  const { error } = await supabase.from("staff_todos").insert(rows.map((r) => ({ ...targetCols(t), ...r, source, created_by: profile.id })));
  if (error) return { ok: false, error: error.message.includes("row-level security") ? NOT_YOURS : "Couldn't add the to-dos. Please try again." };
  revalidatePath(pathFor(t));
  revalidatePath("/");
  return { ok: true, message: rows.length === 1 ? "Added 1 to-do." : `Added ${rows.length} to-dos.` };
}

export async function setTodoDoneAction(id: string, done: boolean): Promise<TodoResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const { data, error } = await supabase
    .from("staff_todos")
    .update({ done: Boolean(done), done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .select("lead_id, deal_id");
  if (error || !data?.length) return { ok: false, error: "Couldn't update the to-do. Please try again." };
  revalidatePath(data[0]!.lead_id ? `/leads/${data[0]!.lead_id}` : `/deals/${data[0]!.deal_id}`);
  revalidatePath("/");
  return { ok: true, message: done ? "Done." : "Back on the list." };
}

export async function deleteTodoAction(id: string): Promise<TodoResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const { data, error } = await supabase.from("staff_todos").delete().eq("id", id).select("lead_id, deal_id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the to-do. Please try again." };
  revalidatePath(data[0]!.lead_id ? `/leads/${data[0]!.lead_id}` : `/deals/${data[0]!.deal_id}`);
  revalidatePath("/");
  return { ok: true, message: "Deleted." };
}

// --- Appointments ------------------------------------------------------------------------------------

export type StartResult = { ok: true; id: string } | { ok: false; error: string };

/** From one sentence: the assistant proposes the appointment and its confirmation; saved as the caller's draft. */
export async function startAppointmentAction(rawTarget: Target, sentence: string): Promise<StartResult> {
  const target = TargetSchema.safeParse(rawTarget);
  if (!target.success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const t = target.data as Target;
  const text = String(sentence ?? "").trim();
  if (!text) return { ok: false, error: "Describe the appointment first: what, when, how long and where." };
  if (text.length > APPT_LIMITS.sentence) return { ok: false, error: `Keep it under ${APPT_LIMITS.sentence} characters.` };
  const prepared = prepareNote(text);
  if (prepared.error) return { ok: false, error: prepared.error.replace("the note", "the description") };
  try {
    const { supabase, profile } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: NO_KEY };
    const loaded = await loadTarget(supabase, t);
    if (!loaded) return { ok: false, error: NOT_YOURS };
    const today = pacificToday();
    const result = await runAi(aiDeps(supabase), APPOINTMENT, { instruction: prepared.note, parts: appointmentInput(loaded.appointment, profile.full_name || null, today), dealId: loaded.dealId });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const draft = toAppointment(result.data, today);
    const { data, error } = await supabase.from("ai_drafts").insert({ kind: "appointment", ...targetCols(t), subject: draft.subject, body: draft.body, content: draft.fields as never }).select("id").single();
    if (error || !data) return { ok: false, error: "Couldn't save the appointment draft. Please try again." };
    revalidatePath(pathFor(t));
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[startAppointment]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong drafting the appointment. Please try again." };
  }
}

export interface AppointmentView {
  id: string;
  status: "draft" | "approved" | "discarded";
  fields: AppointmentFields;
  subject: string;
  body: string;
  sent_via: string | null;
}
export type AppointmentResult = { ok: true; appointment: AppointmentView; message: string } | { ok: false; error: string; appointment?: AppointmentView };

const FieldsInput = z.object({
  title: z.string().max(400),
  date: z.string().max(20),
  start: z.string().max(10),
  minutes: z.number().int().nullable(),
  location: z.string().max(1000),
  with: z.string().max(1000),
});
const TextInput = z.object({ subject: z.string().max(1000), body: z.string().max(20000) });

const view = (r: { id: string; status: string; content: unknown; subject: string; body: string; sent_via: string | null }): AppointmentView => ({
  id: r.id,
  status: r.status as AppointmentView["status"],
  fields: r.content as AppointmentFields,
  subject: r.subject,
  body: r.body,
  sent_via: r.sent_via,
});

async function loadAppointment(supabase: Supabase, id: string) {
  const { data } = await supabase.from("ai_drafts").select("id, kind, status, content, subject, body, sent_via, lead_id, deal_id").eq("id", id).eq("kind", "appointment").maybeSingle();
  return data;
}

/** Saves the person's edits. Fields are kept as typed when they're possible, blank when not. */
export async function saveAppointmentAction(id: string, fields: AppointmentFields, text: { subject: string; body: string }): Promise<AppointmentResult> {
  const f = FieldsInput.safeParse(fields);
  const tx = TextInput.safeParse(text);
  if (!Id.safeParse(id).success || !f.success || !tx.success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const current = await loadAppointment(supabase, id);
  if (!current) return { ok: false, error: "That appointment draft isn't yours." };
  if (current.status !== "draft") return { ok: false, error: current.status === "approved" ? "This appointment is approved and can't be changed. Draft a new one." : "This draft was discarded.", appointment: view(current) };
  // A past date is kept while editing (so the person sees what they typed); approval refuses it.
  const kept = checkFields(f.data, pacificToday(), { allowPast: true });
  const { data, error } = await supabase
    .from("ai_drafts")
    .update({ content: kept as never, subject: tx.data.subject.replace(/\s+/g, " ").trim().slice(0, 200), body: tx.data.body.replace(/\r\n/g, "\n").trim().slice(0, 8000) })
    .eq("id", id)
    .select("id, status, content, subject, body, sent_via")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save your changes. Please try again.", appointment: view(current) };
  return { ok: true, appointment: view(data), message: "Saved." };
}

/** Approves the appointment as it now reads, after our checks; then the calendar file and the confirmation are ready. */
export async function approveAppointmentAction(id: string, fields: AppointmentFields, text: { subject: string; body: string }): Promise<AppointmentResult> {
  const saved = await saveAppointmentAction(id, fields, text);
  if (!saved.ok) return saved;
  const a = saved.appointment;
  const problems = appointmentProblems(a.fields, a.subject, a.body, pacificToday());
  if (problems.length) return { ok: false, error: `Not approved yet. ${problems.join(" ")}`, appointment: a };
  const { supabase } = await staffClient();
  const { data, error } = await supabase.from("ai_drafts").update({ status: "approved" }).eq("id", id).eq("status", "draft").select("id, status, content, subject, body, sent_via, lead_id, deal_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't approve the appointment. Please try again.", appointment: a };
  revalidatePath(data.lead_id ? `/leads/${data.lead_id}` : `/deals/${data.deal_id}`);
  revalidatePath("/assistant");
  return { ok: true, appointment: view(data), message: "Approved. Add it to your calendar with the file below, and send the confirmation yourself." };
}

/** Records that the confirmation was copied, opened in email or printed (once). */
export async function markAppointmentUsedAction(id: string, via: "email" | "copy" | "print"): Promise<void> {
  if (!Id.safeParse(id).success || !["email", "copy", "print"].includes(via)) return;
  const { supabase } = await staffClient();
  await supabase.from("ai_drafts").update({ sent_via: via }).eq("id", id).eq("kind", "appointment").eq("status", "approved").is("sent_via", null);
}
