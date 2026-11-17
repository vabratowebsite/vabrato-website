import { NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { CALENDAR_SCOPE, DRIVE_SCOPE, consentUrl, googleSetup, newPkce, newState } from "@vabrato/lib/integrations";
import { OAUTH_COOKIE, oauthCookieOptions } from "@/lib/google-oauth";
import { importSwitches } from "@/lib/imports";
import { supabaseServer } from "@/lib/supabase-server";
import { teamCalendarReady } from "@/lib/team-calendar";

// Starts a Google connection: ?for=team (the team calendar, admins only; 0045)
// or ?for=drive (a staff member's own Drive imports, Integrations PR 2). Each
// asks Google for that access only, never what the account allowed before,
// so the two connections stay separate. PKCE and a one-time state are kept in
// a short-lived httpOnly cookie, checked again in the callback.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = new URL("/settings", req.nextUrl.origin);
  const profile = await getProfile(await supabaseServer());
  if (!profile) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!STAFF_ROLES.includes(profile.role)) return NextResponse.redirect(settings);
  const purpose = req.nextUrl.searchParams.get("for") === "team" ? "team" : "drive";
  if (purpose === "team" && profile.role !== "admin") {
    settings.searchParams.set("google", "admin_only");
    return NextResponse.redirect(settings);
  }
  const on = purpose === "drive" ? (await importSwitches()).drive : (await teamCalendarReady()).on;
  const s = googleSetup();
  if (!on || !s.ok) {
    settings.searchParams.set("google", "not_ready");
    return NextResponse.redirect(settings);
  }
  const state = newState();
  const { verifier, challenge } = newPkce();
  const redirectUri = new URL("/integrations/google/callback", req.nextUrl.origin).toString();
  const scopes = [purpose === "team" ? CALENDAR_SCOPE : DRIVE_SCOPE];
  const res = NextResponse.redirect(consentUrl(s.setup, { redirectUri, state, challenge, scopes, includeGranted: false, loginHint: profile.email ?? undefined }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, profileId: profile.id, purpose }), oauthCookieOptions(req));
  return res;
}
