"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

// Staff side of member messages, tours and the buyer agreement (S5 PR 4;
// minimal until the S6 console). RLS limits staff to members they may see
// (assigned agent, deal access, admin); the DB functions check again.

export interface ReplyState {
  error: string | null;
  sent?: boolean;
}

const MemberId = z.string().uuid();

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

export async function replyAction(memberId: string, _prev: ReplyState, form: FormData): Promise<ReplyState> {
  const { supabase, profile } = await staffClient();
  const member = MemberId.safeParse(memberId);
  const body = z.string().trim().min(1).max(4000).safeParse(form.get("body"));
  if (!member.success) return { error: "Unknown member." };
  if (!body.success) return { error: "Write a reply of up to 4,000 characters." };
  const { error } = await supabase.from("messages").insert({ member_id: member.data, sender_id: profile.id, body: body.data });
  if (error) return { error: /messages_rate_limited/.test(error.message) ? "Too many messages in a short time. Try again in a few minutes." : "Couldn't send the reply." };
  revalidatePath(`/messages/${member.data}`);
  revalidatePath("/messages");
  return { error: null, sent: true };
}

export async function setBuyerAgreementAction(memberId: string, form: FormData) {
  const { supabase } = await staffClient();
  const member = MemberId.safeParse(memberId);
  if (!member.success) return;
  await supabase.rpc("set_buyer_agreement", { p_member: member.data, p_on_file: form.get("onFile") === "true" });
  revalidatePath(`/messages/${member.data}`);
}

const TourStatus = z.enum(["confirmed", "declined", "completed", "cancelled"]);

export async function setTourStatusAction(memberId: string, form: FormData) {
  const { supabase } = await staffClient();
  const lead = z.string().uuid().safeParse(form.get("lead"));
  const status = TourStatus.safeParse(form.get("status"));
  if (!lead.success || !status.success) return;
  await supabase.rpc("set_tour_status", { p_lead: lead.data, p_status: status.data });
  revalidatePath(`/messages/${memberId}`);
}

export interface MemberActionState {
  error: string | null;
  ok?: string;
}

/** Acting lead admin assigns a member's agent (0023 set_member_agent, audited). */
export async function setMemberAgentAction(memberId: string, _prev: MemberActionState, form: FormData): Promise<MemberActionState> {
  const { supabase } = await staffClient();
  const member = MemberId.safeParse(memberId);
  const raw = String(form.get("agent") ?? "");
  const agent = raw ? MemberId.safeParse(raw) : null;
  if (!member.success || (agent && !agent.success)) return { error: "Pick an agent." };
  const { error } = await supabase.rpc("set_member_agent", { p_member: member.data, p_agent: (agent?.data ?? null) as string });
  if (error) return { error: /lead_admin_only/.test(error.message) ? "Only Mark (or Viv while Mark is away) can change a member's agent." : "Couldn't change the agent." };
  revalidatePath(`/members/${member.data}`);
  revalidatePath("/members");
  return { error: null, ok: "Agent updated." };
}

/** Admins (and the acting lead admin) close a deletion request with a note. */
export async function handleDeletionAction(requestId: string, form: FormData) {
  const { supabase, profile } = await staffClient();
  const id = MemberId.parse(requestId);
  const status = z.enum(["completed", "cancelled"]).parse(form.get("status"));
  const note = z.string().trim().max(1000).optional().parse(form.get("note") || undefined);
  await supabase
    .from("account_deletion_requests")
    .update({ status, handled_by: profile.id, handled_at: new Date().toISOString(), ...(note ? { note } : {}) })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/members/deletions");
}

/**
 * Approve or decline a to-do a member added from Ask Vabrato (S5b PR 2,
 * 0037 decide_member_todo: staff who can see the member, pending only;
 * audited). The form carries the to-do and the decision.
 */
export async function decideMemberTodoAction(memberId: string, _prev: MemberActionState, form: FormData): Promise<MemberActionState> {
  const { supabase } = await staffClient();
  const member = MemberId.safeParse(memberId);
  const todo = MemberId.safeParse(form.get("todo"));
  const approve = form.get("decision") === "approve";
  if (!member.success || !todo.success) return { error: "That to-do wasn't found." };
  const { error } = await supabase.rpc("decide_member_todo", { p_id: todo.data, p_approve: approve });
  if (error) return { error: /not_found/.test(error.message) ? "That to-do was already decided, or isn't for a member you work with." : "Couldn't save that." };
  revalidatePath(`/members/${member.data}`);
  return { error: null, ok: approve ? "Approved: it's on the member's to-do list." : "Declined." };
}
