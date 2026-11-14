import { NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { dropboxConsentUrl, dropboxSetup, newPkce, newState } from "@vabrato/lib/integrations";
import { DROPBOX_COOKIE, oauthCookieOptions } from "@/lib/google-oauth";
import { importSwitches } from "@/lib/imports";
import { supabaseServer } from "@/lib/supabase-server";

// Starts connecting a staff member's Dropbox (Integrations PR 2): Dropbox's
// consent page for the Vabrato app (App folder, read only), with PKCE and a
// one-time state in a short-lived httpOnly cookie, checked in the callback.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = new URL("/settings", req.nextUrl.origin);
  const profile = await getProfile(await supabaseServer());
  if (!profile) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!STAFF_ROLES.includes(profile.role)) return NextResponse.redirect(settings);
  const s = dropboxSetup();
  if (!(await importSwitches()).dropbox || !s.ok) {
    settings.searchParams.set("google", "not_ready");
    return NextResponse.redirect(settings);
  }
  const state = newState();
  const { verifier, challenge } = newPkce();
  const redirectUri = new URL("/integrations/dropbox/callback", req.nextUrl.origin).toString();
  const res = NextResponse.redirect(dropboxConsentUrl(s.setup, { redirectUri, state, challenge }));
  res.cookies.set(DROPBOX_COOKIE, JSON.stringify({ state, verifier, profileId: profile.id, purpose: "dropbox" }), oauthCookieOptions(req, "/integrations/dropbox"));
  return res;
}
