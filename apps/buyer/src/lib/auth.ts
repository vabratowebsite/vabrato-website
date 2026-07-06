import { redirect } from "next/navigation";
import type { Profile, UserRole } from "@vabrato/db";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

// Buyers plus staff (staff preview client-facing screens).
const ALLOWED: UserRole[] = ["buyer", ...STAFF_ROLES];

export async function requireSignIn(): Promise<{ profile: Profile; allowed: boolean }> {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile) redirect("/login");
  return { profile, allowed: ALLOWED.includes(profile.role) };
}
