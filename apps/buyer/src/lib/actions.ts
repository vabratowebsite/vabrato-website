"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@vabrato/lib";
import { parsePropertyForm, PROPERTY_STATUSES, type PropertyStatus } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

export async function signOutAction() {
  const supabase = await supabaseServer();
  await signOut(supabase);
  redirect("/login");
}

export interface FormState {
  error: string | null;
}

export async function addPropertyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parsePropertyForm(form);
  if (parsed.error !== null) return { error: parsed.error };

  // buyer_id defaults to auth.uid(); RLS restricts rows to the owner.
  const supabase = await supabaseServer();
  const { error } = await supabase.from("tracked_properties").insert({
    address: parsed.data.address,
    source: parsed.data.source,
    status: parsed.data.status,
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { error: null };
}

export async function updateStatusAction(propertyId: string, status: string) {
  if (!PROPERTY_STATUSES.includes(status as PropertyStatus)) return;
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("tracked_properties")
    .update({ status })
    .eq("id", propertyId);
  if (error) console.error("[updateStatus]", error.message);
  revalidatePath("/");
  revalidatePath(`/properties/${propertyId}`);
}

export async function deletePropertyAction(propertyId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase.from("tracked_properties").delete().eq("id", propertyId);
  if (error) console.error("[deleteProperty]", error.message);
  revalidatePath("/");
  redirect("/");
}
