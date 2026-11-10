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
