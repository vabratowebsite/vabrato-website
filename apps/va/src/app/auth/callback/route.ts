import { NextResponse } from "next/server";
import { STAFF_ROLES, createServiceSupabase, exchangeCodeForSession, getProfile } from "@vabrato/lib";
import { supabaseServer } from "@/lib/supabase-server";

// Console sign-in callback. After the session is set, ACC-1: check whether
// this staff member is an active MLSListings member of our office
// (MLS_OFFICE_ID) and record FULL access (0023 verify_agent_access, service
// role). A failed check never blocks sign-in: the person just stays at IDX
// level, and Settings shows their access state.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    console.error("[auth/callback] no code in URL");
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }
  const supabase = await supabaseServer();
  const { error } = await exchangeCodeForSession(supabase, code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, url.origin));
  }
  await verifyMlsAccess(supabase);
  return NextResponse.redirect(new URL("/", url.origin));
}

async function verifyMlsAccess(supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const office = process.env.MLS_OFFICE_ID;
  if (!office) return;
  try {
    const profile = await getProfile(supabase);
    if (!profile || !STAFF_ROLES.includes(profile.role)) return;
    const { error } = await createServiceSupabase().rpc("verify_agent_access", { p_profile: profile.id, p_email: profile.email, p_office: office });
    if (error) console.error("[auth/callback] ACC-1 check failed:", error.code ?? "unknown");
  } catch (e) {
    console.error("[auth/callback] ACC-1 check failed:", (e as Error).message.slice(0, 120));
  }
}
