"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { fairHousingBlocks, paymentInstructionMatches } from "@vabrato/ai";
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

/**
 * Approve a member's flyer with one of our own listings (and optionally one of
 * its open houses), or decline it with a note (S5b PR 6, 0041
 * decide_member_promo: staff who can see the member, pending only; our own
 * listing; audited). The words are checked again first: they were written in
 * the member's browser.
 */
export async function decideMemberPromoAction(memberId: string, _prev: MemberActionState, form: FormData): Promise<MemberActionState> {
  const { supabase } = await staffClient();
  const member = MemberId.safeParse(memberId);
  const promo = MemberId.safeParse(form.get("promo"));
  const approve = form.get("decision") === "approve";
  if (!member.success || !promo.success) return { error: "That flyer wasn't found." };
  if (approve) {
    const listing = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).safeParse(form.get("listing"));
    if (!listing.success) return { error: "Choose the listing." };
    const ohRaw = String(form.get("open_house") ?? "");
    const openHouse = ohRaw ? z.string().min(1).max(128).safeParse(ohRaw) : null;
    if (openHouse && !openHouse.success) return { error: "That open house wasn't found." };
    const { data: row } = await supabase.from("member_promos").select("headline, highlights, blurb, instagram, facebook").eq("id", promo.data).maybeSingle();
    if (!row) return { error: "That flyer wasn't found." };
    const text = [row.headline, row.highlights, row.blurb, row.instagram, row.facebook].join("\n");
    const fh = fairHousingBlocks(text);
    if (fh.length) return { error: `It uses "${fh[0]!.match}", which Fair Housing rules don't allow. Decline it with a note.` };
    if (paymentInstructionMatches(text).length) return { error: "It mentions payment or wiring details. Decline it with a note." };
    if (/\$\s?\d/.test(text)) return { error: "It has a dollar figure; the price comes from the listing. Decline it with a note." };
    if (/\bhttps?:\/\/|\bwww\./i.test(text)) return { error: "It has a link. Decline it with a note." };
    const { error } = await supabase.rpc("decide_member_promo", { p_id: promo.data, p_approve: true, p_listing_key: listing.data, ...(openHouse?.success ? { p_open_house_key: openHouse.data } : {}) });
    if (error) {
      if (/not_our_listing/.test(error.message)) return { error: "Choose one of our own listings." };
      if (/not_this_open_house/.test(error.message)) return { error: "That open house isn't for this listing, or it's over." };
      return { error: /not_found/.test(error.message) ? "That flyer was already decided, or isn't for a member you work with." : "Couldn't save that." };
    }
    revalidatePath(`/members/${member.data}`);
    return { error: null, ok: "Approved: the member can print the flyer and copy the posts." };
  }
  const note = z.string().trim().max(300).safeParse(String(form.get("note") ?? ""));
  if (!note.success) return { error: "Keep the note under 300 characters." };
  const { error } = await supabase.rpc("decide_member_promo", { p_id: promo.data, p_approve: false, ...(note.data ? { p_note: note.data } : {}) });
  if (error) return { error: /not_found/.test(error.message) ? "That flyer was already decided, or isn't for a member you work with." : "Couldn't save that." };
  revalidatePath(`/members/${member.data}`);
  return { error: null, ok: "Declined. The member sees your note." };
}
