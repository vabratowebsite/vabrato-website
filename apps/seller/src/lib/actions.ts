"use server";

import { redirect } from "next/navigation";
import { signOut } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

export async function signOutAction() {
  const supabase = await supabaseServer();
  await signOut(supabase);
  redirect("/login");
}
