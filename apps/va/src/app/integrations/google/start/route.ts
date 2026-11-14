import { NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { consentUrl, newPkce, newState } from "@vabrato/lib/integrations";
import { calendarReady } from "@/lib/calendar-sync";
import { OAUTH_COOKIE, oauthCookieOptions } from "@/lib/google-oauth";
import { supabaseServer } from "@/lib/supabase-server";

// Starts connecting a staff member's Google Calendar (Integrations PR 1):
// Google's consent page with PKCE and a one-time state kept in a short-lived
// httpOnly cookie, checked again in the callback.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = new URL("/settings", req.nextUrl.origin);
  const profile = await getProfile(await supabaseServer());
  if (!profile) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!STAFF_ROLES.includes(profile.role)) return NextResponse.redirect(settings);
  const ready = await calendarReady();
  if (!ready.on) {
    settings.searchParams.set("google", "not_ready");
    return NextResponse.redirect(settings);
  }
  const state = newState();
  const { verifier, challenge } = newPkce();
  const redirectUri = new URL("/integrations/google/callback", req.nextUrl.origin).toString();
  const res = NextResponse.redirect(consentUrl(ready.setup, { redirectUri, state, challenge, loginHint: profile.email ?? undefined }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, profileId: profile.id }), oauthCookieOptions(req));
  return res;
}
