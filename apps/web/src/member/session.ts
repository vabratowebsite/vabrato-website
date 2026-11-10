import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { AgentProfile, Profile } from "@vabrato/db";
import type { SupabaseDb } from "@vabrato/lib";
import { isMemberRole, type MemberRole } from "./roles";
import { memberSupabase } from "./supabase-server";

export interface Member {
  user: User;
  profile: Profile;
  supabase: SupabaseDb;
}

/** The signed-in person (server-validated with getUser) and their profile, or null. */
export async function getMember(): Promise<Member | null> {
  const supabase = await memberSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return profile ? { user: data.user, profile, supabase } : null;
}

export async function requireMember(next: string): Promise<Member> {
  const m = await getMember();
  if (!m) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return m;
}

/** A signed-in, onboarded buyer/seller. Staff go to /my (console notice). */
export async function requirePortalMember(next: string): Promise<Member & { role: MemberRole }> {
  const m = await requireMember(next);
  const role = m.profile.role;
  if (!isMemberRole(role)) redirect("/my");
  if (!m.profile.onboarded_at) redirect("/my/welcome");
  return { ...m, role };
}

export type AgentCard = Pick<AgentProfile, "slug" | "display_name" | "title" | "phone" | "email">;

/** The member's agent, from the published agent profile (review item 12). */
export async function assignedAgent(supabase: SupabaseDb, agentId: string | null): Promise<AgentCard | null> {
  if (!agentId) return null;
  const { data } = await supabase
    .from("agent_profiles")
    .select("slug, display_name, title, phone, email")
    .eq("profile_id", agentId)
    .eq("published", true)
    .maybeSingle();
  return data ?? null;
}
