import { redirect } from "next/navigation";
import type { Profile } from "@vabrato/db";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

/** Signed-in profile or redirect to /login. `isStaff` drives the access gate. */
export async function requireSignIn(): Promise<{ profile: Profile; isStaff: boolean }> {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile) redirect("/login");
  return { profile, isStaff: STAFF_ROLES.includes(profile.role) };
}
