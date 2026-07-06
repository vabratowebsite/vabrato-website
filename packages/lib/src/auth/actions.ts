import type { SupabaseDb } from "./server";

export interface AuthResult {
  error: string | null;
}

export interface OAuthResult extends AuthResult {
  /** Provider consent URL — caller redirects the browser here. */
  url: string | null;
}

/** Sends a magic-link email. `redirectTo` is the app's /auth/callback URL. */
export async function signInWithMagicLink(
  supabase: SupabaseDb,
  opts: { email: string; redirectTo: string },
): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email: opts.email,
    options: { emailRedirectTo: opts.redirectTo },
  });
  return { error: error?.message ?? null };
}

export async function signInWithGoogle(
  supabase: SupabaseDb,
  opts: { redirectTo: string },
): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: opts.redirectTo },
  });
  return { url: data?.url ?? null, error: error?.message ?? null };
}

export async function signOut(supabase: SupabaseDb): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

/** Exchanges the code in a magic-link/OAuth callback for a session. */
export async function exchangeCodeForSession(
  supabase: SupabaseDb,
  code: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return { error: error?.message ?? null };
}
