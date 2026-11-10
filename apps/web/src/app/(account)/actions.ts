"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, verifyTurnstile } from "@/lib/leads";
import { SITE_URL } from "@/lib/org";
import {
  JOIN_COOKIE,
  JOIN_COOKIE_MAX_AGE,
  authErrorMessage,
  authRedirectOrigin,
  callbackUrl,
  encodePendingJoin,
  parseJoinForm,
  parseSignInForm,
  safeNext,
} from "@/member/join";
import { memberSupabase } from "@/member/supabase-server";

// Join and sign-in (mockup 04). Magic link or Google, both PKCE: the code
// verifier cookie is set here and the code is exchanged in /auth/callback, so
// the link has to be opened in the same browser.

export interface AuthFormState {
  status: "idle" | "sent" | "error";
  email?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const NOT_ROBOT = "We couldn't confirm you're not a robot. Please try again.";

async function redirectOrigin() {
  const h = await headers();
  return authRedirectOrigin(h.get("origin"), {
    SITE_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    NODE_ENV: process.env.NODE_ENV,
  });
}

async function turnstileOk(form: FormData) {
  const token = form.get("cf-turnstile-response");
  return verifyTurnstile(typeof token === "string" ? token : null, clientIp(await headers()));
}

export async function joinAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = parseJoinForm(form);
  if (!parsed.ok) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  const input = parsed.data;
  // Honeypot filled: look successful, send nothing.
  if (parsed.honeypot) return { status: "sent", email: input.provider === "email" ? input.email : undefined };
  if (input.provider === "email" && !(await turnstileOk(form))) return { status: "error", message: NOT_ROBOT };

  const store = await cookies();
  store.set(JOIN_COOKIE, encodePendingJoin(input), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge: JOIN_COOKIE_MAX_AGE,
  });

  const redirectTo = callbackUrl(await redirectOrigin(), safeNext(input.next));
  const supabase = await memberSupabase();

  if (input.provider === "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error || !data.url) return { status: "error", message: "Google sign-in isn't available right now. Use the email link instead." };
    redirect(data.url);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true, data: { full_name: input.fullName } },
  });
  if (error) return { status: "error", message: authErrorMessage(error.message) };
  return { status: "sent", email: input.email };
}

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = parseSignInForm(form);
  if (!parsed.ok) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  const input = parsed.data;
  if (parsed.honeypot) return { status: "sent", email: input.email };

  const redirectTo = callbackUrl(await redirectOrigin(), safeNext(input.next));
  const supabase = await memberSupabase();

  if (input.provider === "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error || !data.url) return { status: "error", message: "Google sign-in isn't available right now. Use the email link instead." };
    redirect(data.url);
  }

  if (!input.email) return { status: "error", fieldErrors: { email: "Enter your email address." }, message: "Please check the highlighted fields." };
  if (!(await turnstileOk(form))) return { status: "error", message: NOT_ROBOT };

  // Existing accounts only. Unknown addresses get the same "check your email"
  // reply, so the form doesn't reveal who has an account.
  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error && /rate limit|too many|security purposes/i.test(error.message)) {
    return { status: "error", message: authErrorMessage(error.message) };
  }
  return { status: "sent", email: input.email };
}
