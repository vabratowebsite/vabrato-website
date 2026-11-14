import { after, NextResponse, type NextRequest } from "next/server";
import { STAFF_ROLES, createServiceSupabase, getProfile } from "@vabrato/lib";
import { decryptToken, dropboxAccessToken, dropboxAccount, dropboxExchangeCode, dropboxRevoke, dropboxSetup, encryptToken } from "@vabrato/lib/integrations";
import { DROPBOX_COOKIE, readOAuthCookie, sameState } from "@/lib/google-oauth";
import { supabaseServer } from "@/lib/supabase-server";

// Dropbox sends the staff member back here (Integrations PR 2). Same checks
// as Google's: our one-time state, the same signed-in person, the code with
// PKCE, a verified Dropbox email; then the refresh token is stored encrypted.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const done = (result: string) => {
    const to = new URL("/settings", req.nextUrl.origin);
    to.searchParams.set("google", result);
    const res = NextResponse.redirect(to);
    res.cookies.set(DROPBOX_COOKIE, "", { path: "/integrations/dropbox", maxAge: 0 });
    return res;
  };
  const saved = readOAuthCookie(req.cookies.get(DROPBOX_COOKIE)?.value);
  const profile = await getProfile(await supabaseServer());
  if (!profile) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  if (!STAFF_ROLES.includes(profile.role)) return done("failed");
  const q = req.nextUrl.searchParams;
  if (!saved || saved.purpose !== "dropbox" || saved.profileId !== profile.id || !sameState(q.get("state"), saved.state)) return done("expired");
  if (q.get("error")) return done("denied");
  const code = q.get("code");
  if (!code || code.length > 2000) return done("failed");
  const s = dropboxSetup();
  if (!s.ok) return done("not_ready");

  const redirectUri = new URL("/integrations/dropbox/callback", req.nextUrl.origin).toString();
  try {
    const tokens = await dropboxExchangeCode(s.setup, { code, verifier: saved.verifier, redirectUri });
    const who = await dropboxAccount(s.setup, tokens.accessToken);
    if (!who.verified) {
      await dropboxRevoke(s.setup, tokens.accessToken).catch(() => {});
      return done("unverified");
    }
    const service = createServiceSupabase();
    const { data: before } = await service.from("staff_connections").select("token_ciphertext").eq("profile_id", profile.id).eq("provider", "dropbox").maybeSingle();
    const { error } = await service.from("staff_connections").upsert(
      {
        profile_id: profile.id,
        provider: "dropbox",
        account_email: who.email,
        scopes: tokens.scopes,
        token_ciphertext: encryptToken(tokens.refreshToken, s.setup.key),
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "profile_id,provider" },
    );
    if (error) {
      await dropboxRevoke(s.setup, tokens.accessToken).catch(() => {});
      return done("failed");
    }
    // Reconnecting replaces the old token: revoke it so only one stays valid.
    if (before?.token_ciphertext) {
      after(async () => {
        try {
          const old = decryptToken(before.token_ciphertext, s.setup.key);
          if (old !== tokens.refreshToken) await dropboxRevoke(s.setup, await dropboxAccessToken(s.setup, old));
        } catch {
          // An old token we can't read or revoke stops working when the app is removed.
        }
      });
    }
    return done("dropbox_connected");
  } catch {
    return done("failed");
  }
}
