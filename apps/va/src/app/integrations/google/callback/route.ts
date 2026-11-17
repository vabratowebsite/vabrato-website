import { after, NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, createServiceSupabase, getProfile } from "@vabrato/lib";
import { CALENDAR_SCOPE, DRIVE_SCOPE, accountEmail, decryptToken, encryptToken, exchangeCode, googleSetup, revokeToken, type GoogleSetup } from "@vabrato/lib/integrations";
import { OAUTH_COOKIE, readOAuthCookie, sameState } from "@/lib/google-oauth";
import { supabaseServer } from "@/lib/supabase-server";
import { googleAccountShared, syncTeamCalendar } from "@/lib/team-calendar";

// Google sends the person back here. We check the one-time state against our
// cookie and that the same person is signed in, exchange the code (PKCE),
// require a verified Google email, then store the refresh token encrypted:
// the team calendar's (0045; an admin, checked again here) or the person's
// own Drive connection (Integrations PR 2). The team calendar's first sync
// runs after the response.
export const dynamic = "force-dynamic";

/**
 * A replaced token is revoked so only one stays valid, unless it's for the
 * same Google account (the new token shares its grant: revoking one ends
 * both) or that account is still used by another connection.
 */
function revokeReplaced(setup: GoogleSetup, before: { token_ciphertext: string; account_email: string | null } | null, newEmail: string, except: { team?: boolean; profileId?: string }) {
  if (!before?.token_ciphertext || before.account_email?.toLowerCase() === newEmail.toLowerCase()) return;
  after(async () => {
    try {
      if (await googleAccountShared(before.account_email, except)) return;
      await revokeToken(setup, decryptToken(before.token_ciphertext, setup.key));
    } catch {
      // An old token we can't read or revoke expires on its own.
    }
  });
}

export async function GET(req: NextRequest) {
  const done = (result: string) => {
    const to = new URL("/settings", req.nextUrl.origin);
    to.searchParams.set("google", result);
    const res = NextResponse.redirect(to);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/integrations/google", maxAge: 0 });
    return res;
  };
  const saved = readOAuthCookie(req.cookies.get(OAUTH_COOKIE)?.value);
  const profile = await getProfile(await supabaseServer());
  if (!profile) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!STAFF_ROLES.includes(profile.role)) return done("failed");
  const q = req.nextUrl.searchParams;
  if (!saved || saved.purpose === "dropbox" || saved.profileId !== profile.id || !sameState(q.get("state"), saved.state)) return done("expired");
  const team = saved.purpose === "team";
  if (team && profile.role !== "admin") return done("admin_only");
  if (q.get("error")) return done("denied");
  const code = q.get("code");
  if (!code || code.length > 2000) return done("failed");
  const s = googleSetup();
  if (!s.ok) return done("not_ready");
  const setup = s.setup;

  const redirectUri = new URL("/integrations/google/callback", req.nextUrl.origin).toString();
  try {
    const tokens = await exchangeCode(setup, { code, verifier: saved.verifier, redirectUri });
    const who = await accountEmail(setup, tokens.accessToken);
    // Google lets a person untick a permission; without it there's nothing to store.
    // (Not revoked: that would end the account's other connection to the console too.)
    if (!tokens.scopes.includes(team ? CALENDAR_SCOPE : DRIVE_SCOPE)) return done(team ? "team_scope" : "denied");
    if (!who.verified) return done("unverified");
    const service = createServiceSupabase();
    const token_ciphertext = encryptToken(tokens.refreshToken, setup.key);
    const now = new Date().toISOString();

    if (team) {
      const { data: before } = await service.from("team_calendar").select("token_ciphertext, account_email, calendar_id").maybeSingle();
      const sameAccount = before?.account_email?.toLowerCase() === who.email.toLowerCase();
      // Another Google account can't reach the old calendar: the sync makes a new one there.
      if (before && !sameAccount) await service.from("team_calendar_events").delete().neq("source_key", "");
      const { error } = await service.from("team_calendar").upsert(
        {
          singleton: true,
          connected_by: profile.id,
          account_email: who.email,
          scopes: tokens.scopes,
          token_ciphertext,
          connected_at: now,
          last_error: null,
          ...(sameAccount ? {} : { calendar_id: null, calendar_name: null, last_synced_at: null }),
        },
        { onConflict: "singleton" },
      );
      if (error) return done("failed");
      revokeReplaced(setup, before, who.email, { team: true });
      after(() => syncTeamCalendar({ wait: true }));
      return done("team_connected");
    }

    const { data: before } = await service.from("staff_connections").select("token_ciphertext, account_email").eq("profile_id", profile.id).eq("provider", "google").maybeSingle();
    const { error } = await service.from("staff_connections").upsert(
      { profile_id: profile.id, provider: "google", account_email: who.email, scopes: tokens.scopes, token_ciphertext, connected_at: now, last_error: null },
      { onConflict: "profile_id,provider" },
    );
    if (error) return done("failed");
    revokeReplaced(setup, before, who.email, { profileId: profile.id });
    return done("drive_connected");
  } catch {
    return done("failed");
  }
}
