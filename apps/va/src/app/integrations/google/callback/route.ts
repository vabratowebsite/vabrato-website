import { after, NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, createServiceSupabase, getProfile } from "@vabrato/lib";
import { accountEmail, decryptToken, encryptToken, exchangeCode, revokeToken } from "@vabrato/lib/integrations";
import { calendarReady, syncCalendarFor } from "@/lib/calendar-sync";
import { OAUTH_COOKIE, readOAuthCookie, sameState } from "@/lib/google-oauth";
import { supabaseServer } from "@/lib/supabase-server";

// Google sends the staff member back here (Integrations PR 1). We check the
// one-time state against our cookie and that the same person is signed in,
// exchange the code (PKCE), require a verified Google email, then store the
// refresh token encrypted. The first sync runs after the response.
export const dynamic = "force-dynamic";

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
  if (!saved || saved.profileId !== profile.id || !sameState(q.get("state"), saved.state)) return done("expired");
  if (q.get("error")) return done("denied");
  const code = q.get("code");
  if (!code || code.length > 2000) return done("failed");
  const ready = await calendarReady();
  if (!ready.on) return done("not_ready");

  const redirectUri = new URL("/integrations/google/callback", req.nextUrl.origin).toString();
  try {
    const tokens = await exchangeCode(ready.setup, { code, verifier: saved.verifier, redirectUri });
    const who = await accountEmail(ready.setup, tokens.accessToken);
    if (!who.verified) {
      await revokeToken(ready.setup, tokens.refreshToken).catch(() => {});
      return done("unverified");
    }
    const service = createServiceSupabase();
    const { data: before } = await service.from("staff_connections").select("token_ciphertext").eq("profile_id", profile.id).eq("provider", "google").maybeSingle();
    const { error } = await service.from("staff_connections").upsert(
      {
        profile_id: profile.id,
        provider: "google",
        account_email: who.email,
        scopes: tokens.scopes,
        token_ciphertext: encryptToken(tokens.refreshToken, ready.setup.key),
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "profile_id,provider" },
    );
    if (error) {
      await revokeToken(ready.setup, tokens.refreshToken).catch(() => {});
      return done("failed");
    }
    // Reconnecting replaces the old token: revoke it so only one stays valid.
    if (before?.token_ciphertext) {
      after(async () => {
        try {
          const old = decryptToken(before.token_ciphertext, ready.setup.key);
          if (old !== tokens.refreshToken) await revokeToken(ready.setup, old);
        } catch {
          // An old token we can't read or revoke expires on its own.
        }
      });
    }
    after(() => syncCalendarFor(profile.id, ready));
    return done("connected");
  } catch {
    return done("failed");
  }
}
