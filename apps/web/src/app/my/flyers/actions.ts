"use server";

import { revalidatePath } from "next/cache";
import { requirePortalMember } from "@/member/session";

// "My flyers" (S5b PR 6). The member deletes a flyer that's waiting or was
// declined; an approved one stays (0041 policy), unless they delete all their
// assistant data.

export async function deleteFlyerAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const member = await requirePortalMember("/my/flyers");
  if (!/^[0-9a-f-]{36}$/.test(String(id))) return { ok: false, error: "That flyer wasn't found." };
  const { data, error } = await member.supabase.from("member_promos").delete().eq("id", id).eq("profile_id", member.profile.id).in("status", ["pending", "declined"]).select("id");
  if (error || !data?.length) return { ok: false, error: "That flyer can't be deleted." };
  revalidatePath("/my/flyers");
  return { ok: true };
}
