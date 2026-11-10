"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isFrequency } from "@/member/saved";
import { requireMember } from "@/member/session";

// Saved search edits. RLS limits every write to the member's own rows; the
// id comes from the form, so a forged id simply matches nothing.

const Id = z.string().uuid();

export interface SearchFormState {
  status: "idle" | "saved" | "error";
  message?: string;
}

export async function updateSearchAction(_prev: SearchFormState, form: FormData): Promise<SearchFormState> {
  const { supabase } = await requireMember("/my/searches");
  const id = Id.safeParse(form.get("id"));
  const name = z.string().trim().min(1).max(80).safeParse(form.get("name"));
  const frequency = form.get("frequency");
  if (!id.success) return { status: "error", message: "Something went wrong. Reload the page and try again." };
  if (!name.success) return { status: "error", message: "Give the search a name of up to 80 characters." };
  if (!isFrequency(frequency)) return { status: "error", message: "Choose how often to get alerts." };
  const { error } = await supabase.from("saved_searches").update({ name: name.data, frequency }).eq("id", id.data);
  if (error) return { status: "error", message: "We couldn't save that. Please try again." };
  revalidatePath("/my/searches");
  return { status: "saved", message: "Saved." };
}

export async function deleteSearchAction(form: FormData) {
  const { supabase } = await requireMember("/my/searches");
  const id = Id.safeParse(form.get("id"));
  if (id.success) await supabase.from("saved_searches").delete().eq("id", id.data);
  revalidatePath("/my/searches");
}
