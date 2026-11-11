"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Json } from "@vabrato/db";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import type { ActionState } from "@/lib/lead-actions";
import { parseCmaSubject } from "@/lib/cma";
import { supabaseServer } from "@/lib/supabase-server";

// CMAs (S6 PR 5): a saved CMA keeps the agent's subject details and the
// chosen listing keys only; the database refuses anything else and only
// verified agents may save one while cma_enabled is on.

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return supabase;
}

const KEY = /^[A-Za-z0-9._-]{1,64}$/;

export async function createCmaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await staffClient();
  const title = z.string().trim().min(1).max(160).safeParse(form.get("title"));
  if (!title.success) return { error: "Give the CMA a title, e.g. the subject's address (up to 160 characters)." };
  const subject = parseCmaSubject(form);
  if (!subject.ok) return { error: subject.error };
  const keys = [...new Set(form.getAll("comp").map(String))];
  if (keys.length === 0) return { error: "Choose at least one comparable sale." };
  if (keys.length > 12 || keys.some((k) => !KEY.test(k))) return { error: "Choose up to 12 comparable sales." };
  const { data, error } = await supabase.from("cmas").insert({ title: title.data, subject: subject.subject as unknown as Json, comp_keys: keys }).select("id").single();
  if (error || !data) return { error: /row-level security/.test(error?.message ?? "") ? "CMAs are off, or your MLS membership isn't verified." : "Couldn't save the CMA." };
  revalidatePath("/cmas");
  redirect(`/cmas/${data.id}`);
}

export async function deleteCmaAction(id: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const supabase = await staffClient();
  const { error } = await supabase.from("cmas").delete().eq("id", z.string().uuid().parse(id));
  if (error) return { error: "Couldn't delete the CMA." };
  revalidatePath("/cmas");
  redirect("/cmas?done=deleted");
}
