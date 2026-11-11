"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

// Leads inbox and routing settings (S6 PR 2b). Every change goes through the
// 0022 database functions, which check who may do what again (lead admin,
// assignee, settings managers) and write the audit log.

export interface ActionState {
  error: string | null;
  ok?: string;
}

const Id = z.string().uuid();

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

function friendly(message: string): string {
  if (/lead_admin_only/.test(message)) return "Only Mark (or Viv while Mark is away) can reassign leads.";
  if (/not_allowed/.test(message)) return "You can't change this.";
  if (/not_an_agent|agent or admin/.test(message)) return "Pick an agent or admin.";
  if (/until_in_past/.test(message)) return "The away end time must be in the future.";
  if (/row-level security/.test(message)) return "You can't add notes to this lead.";
  return "Something went wrong. Please try again.";
}

const refresh = (leadId: string) => {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/");
};

export async function markRepliedAction(leadId: string) {
  const { supabase } = await staffClient();
  await supabase.rpc("mark_lead_replied", { p_lead: Id.parse(leadId) });
  refresh(leadId);
}

export async function setLeadStatusAction(leadId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const status = z.enum(["new", "assigned", "closed"]).safeParse(form.get("status"));
  if (!status.success) return { error: "Unknown status." };
  const reason = z.string().trim().max(200).optional().safeParse(form.get("reason") ?? undefined);
  if (!reason.success) return { error: "Keep the reason under 200 characters." };
  const { error } = await supabase.rpc("set_lead_status", { p_lead: Id.parse(leadId), p_status: status.data, ...(reason.data ? { p_reason: reason.data } : {}) });
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  return { error: null, ok: status.data === "closed" ? "Closed." : "Reopened." };
}

export async function reassignLeadAction(leadId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const agent = Id.safeParse(form.get("agent"));
  if (!agent.success) return { error: "Pick an agent." };
  const { error } = await supabase.rpc("reassign_lead", { p_lead: Id.parse(leadId), p_agent: agent.data });
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  return { error: null, ok: "Reassigned. They've been notified." };
}

export async function addLeadNoteAction(leadId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staffClient();
  const body = z.string().trim().min(1).max(2000).safeParse(form.get("body"));
  if (!body.success) return { error: "Write a note of up to 2,000 characters." };
  const { error } = await supabase.from("lead_notes").insert({ lead_id: Id.parse(leadId), author_id: profile.id, body: body.data });
  if (error) return { error: friendly(error.message) };
  refresh(leadId);
  return { error: null, ok: "Note added." };
}

export async function setRoutingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const parsed = z
    .object({
      lead: z.union([Id, z.literal("")]),
      backup: z.union([Id, z.literal("")]),
      escalation: z.coerce.number().int().min(15).max(1440),
      flood: z.coerce.number().int().min(1).max(1000),
    })
    .safeParse({ lead: form.get("lead") ?? "", backup: form.get("backup") ?? "", escalation: form.get("escalation"), flood: form.get("flood") });
  if (!parsed.success) return { error: "Escalation must be 15 to 1,440 minutes and the email cap 1 to 1,000 an hour." };
  const { lead, backup, escalation, flood } = parsed.data;
  if (lead && lead === backup) return { error: "Pick a different person as the backup." };
  const { error } = await supabase.rpc("set_lead_routing", {
    p_lead_admin: (lead || null) as string,
    p_backup_admin: (backup || null) as string,
    p_escalation_minutes: escalation,
    p_flood_cap: flood,
  });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings");
  revalidatePath("/");
  return { error: null, ok: "Routing saved." };
}

export async function setAwayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const away = form.get("away") === "true";
  const untilRaw = String(form.get("until") ?? "").trim();
  let until: string | undefined;
  if (away && untilRaw) {
    // datetime-local is in the browser's zone; the form sends the offset too.
    const offset = Number(form.get("tzOffset") ?? 0);
    const ms = Date.parse(`${untilRaw}:00Z`) + (Number.isFinite(offset) ? offset : 0) * 60_000;
    if (!Number.isFinite(ms)) return { error: "Enter a valid end time." };
    until = new Date(ms).toISOString();
  }
  const { error } = await supabase.rpc("set_lead_admin_away", { p_away: away, ...(until ? { p_until: until } : {}) });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings");
  revalidatePath("/");
  return { error: null, ok: "Saved." };
}

export async function setSyncLiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await staffClient();
  const live = form.get("live") === "true";
  const { error } = await supabase.rpc("set_mls_sync_live", { p_live: live });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/settings");
  revalidatePath("/mls");
  return { error: null, ok: "Saved." };
}
