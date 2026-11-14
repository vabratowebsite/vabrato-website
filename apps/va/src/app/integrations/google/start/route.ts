import { NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, createServiceSupabase, getProfile } from "@vabrato/lib";
import { CALENDAR_SCOPE, DRIVE_SCOPE, consentUrl, googleSetup, newPkce, newState } from "@vabrato/lib/integrations";
import { calendarReady } from "@/lib/calendar-sync";
import { OAUTH_COOKIE, oauthCookieOptions } from "@/lib/google-oauth";
import { importSwitches } from "@/lib/imports";
import { supabaseServer } from "@/lib/supabase-server";

// Starts connecting a staff member's Google account (Integrations PR 1 and
// 2): ?for=calendar (default) or ?for=drive. Google's consent page asks for
// that access plus whatever the person already allowed (one connection per
// person), with PKCE and a one-time state kept in a short-lived httpOnly
// cookie, checked again in the callback.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = new URL("/settings", req.nextUrl.origin);
  const profile = await getProfile(await supabaseServer());
  if (!profile) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!STAFF_ROLES.includes(profile.role)) return NextResponse.redirect(settings);
  const purpose = req.nextUrl.searchParams.get("for") === "drive" ? "drive" : "calendar";
  const on = purpose === "drive" ? (await importSwitches()).drive : (await calendarReady()).on;
  const s = googleSetup();
  if (!on || !s.ok) {
    settings.searchParams.set("google", "not_ready");
    return NextResponse.redirect(settings);
  }
  const { data: conn } = await createServiceSupabase().from("staff_connections").select("scopes").eq("profile_id", profile.id).eq("provider", "google").maybeSingle();
  const scopes = [...new Set([...(conn?.scopes ?? []).filter((x) => x === CALENDAR_SCOPE || x === DRIVE_SCOPE), purpose === "drive" ? DRIVE_SCOPE : CALENDAR_SCOPE])];
  const state = newState();
  const { verifier, challenge } = newPkce();
  const redirectUri = new URL("/integrations/google/callback", req.nextUrl.origin).toString();
  const res = NextResponse.redirect(consentUrl(s.setup, { redirectUri, state, challenge, scopes, loginHint: profile.email ?? undefined }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, profileId: profile.id, purpose }), oauthCookieOptions(req));
  return res;
}
