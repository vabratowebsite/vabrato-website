import { z } from "zod";
import { MEMBER_ROLES, type MemberRole } from "./roles";

// Join and sign-in input, the "pending join" cookie that carries a new
// member's choices through the magic-link / Google round trip, and redirect
// safety. Pure functions, unit-tested.

/** Version of the VOW Terms of Use shown at /vow-terms (stored on acceptance). */
export const VOW_TERMS_VERSION = "2026-11-10";

export const JOIN_COOKIE = "vabrato_join";
export const JOIN_COOKIE_MAX_AGE = 60 * 60; // the link must be used within an hour

const PHONE = /^[0-9+(). -]{7,32}$/;
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const base = {
  role: z.enum(MEMBER_ROLES, { errorMap: () => ({ message: "Choose buying, selling or both." }) }),
  vow: checkbox,
  alerts: checkbox,
  next: z.string().optional(),
};

const EmailJoin = z.object({
  ...base,
  provider: z.literal("email"),
  fullName: z.string().trim().min(1, "Enter your name.").max(120, "Use 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === "" || PHONE.test(v), "Enter a phone number with digits only, or leave it blank.")
    .transform((v) => v || undefined),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
});

const GoogleJoin = z.object({ ...base, provider: z.literal("google") });

export type JoinInput = z.infer<typeof EmailJoin> | z.infer<typeof GoogleJoin>;

export type Parsed<T> = { ok: true; data: T; honeypot: boolean } | { ok: false; fieldErrors: Record<string, string> };

const fieldErrors = (e: z.ZodError) => {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
};

const formObject = (form: FormData) => {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return {
    get,
    honeypot: Boolean(get("website")),
  };
};

export function parseJoinForm(form: FormData): Parsed<JoinInput> {
  const { get, honeypot } = formObject(form);
  const provider = get("provider") === "google" ? "google" : "email";
  const raw = {
    provider,
    role: get("role"),
    vow: get("vow"),
    alerts: get("alerts"),
    next: get("next"),
    fullName: get("fullName") ?? "",
    phone: get("phone") ?? "",
    email: get("email") ?? "",
  };
  const parsed = provider === "google" ? GoogleJoin.safeParse(raw) : EmailJoin.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data, honeypot } : { ok: false, fieldErrors: fieldErrors(parsed.error) };
}

const SignIn = z.object({
  provider: z.enum(["email", "google"]),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address.").optional(),
  next: z.string().optional(),
});
export type SignInInput = z.infer<typeof SignIn>;

export function parseSignInForm(form: FormData): Parsed<SignInInput> {
  const { get, honeypot } = formObject(form);
  const provider = get("provider") === "google" ? "google" : "email";
  const parsed = SignIn.safeParse({ provider, email: provider === "email" ? (get("email") ?? "") : undefined, next: get("next") });
  return parsed.success ? { ok: true, data: parsed.data, honeypot } : { ok: false, fieldErrors: fieldErrors(parsed.error) };
}

// Pending join cookie --------------------------------------------------------

const Pending = z.object({
  role: z.enum(MEMBER_ROLES),
  fullName: z.string().max(120).optional(),
  phone: z.string().regex(PHONE).optional(),
  vow: z.boolean(),
  alerts: z.boolean(),
});
export type PendingJoin = z.infer<typeof Pending>;

export function encodePendingJoin(input: JoinInput): string {
  const p: PendingJoin = {
    role: input.role,
    vow: input.vow,
    alerts: input.alerts,
    ...(input.provider === "email" ? { fullName: input.fullName, ...(input.phone ? { phone: input.phone } : {}) } : {}),
  };
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

/** The cookie is set by our own server action; anything malformed is ignored. */
export function decodePendingJoin(value: string | undefined | null): PendingJoin | null {
  if (!value || value.length > 2048) return null;
  try {
    const parsed = Pending.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Minimal RPC surface used to apply the choices (the member's own client). */
export interface MemberRpc {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
}

/**
 * Applies a new member's join choices after sign-in, as that member (RLS and
 * the RPCs' own checks apply). VOW acceptance only when the flag is on and
 * they ticked it. Returns the steps that failed (logged, never shown raw).
 */
export async function applyPendingJoin(db: MemberRpc, p: PendingJoin, opts: { vowEnabled: boolean }): Promise<string[]> {
  const failed: string[] = [];
  const call = async (fn: string, args?: Record<string, unknown>, ignore?: RegExp) => {
    const { error } = await db.rpc(fn, args);
    if (error && !(ignore && ignore.test(error.message))) failed.push(fn);
  };
  if (p.fullName) await call("update_my_profile", { p_full_name: p.fullName, p_phone: p.phone ?? null });
  // Staff who use the join form keep their role (the RPC refuses).
  await call("set_member_role", { p_role: p.role }, /role_not_member/);
  await call("set_alert_emails", { p_on: p.alerts });
  if (p.vow && opts.vowEnabled) await call("accept_vow_terms", { p_version: VOW_TERMS_VERSION });
  if (failed.length === 0) await call("complete_onboarding");
  return failed;
}

// Redirects ------------------------------------------------------------------

/** Only same-site paths; anything else goes to the portal. */
export function safeNext(next: string | null | undefined, fallback = "/my"): string {
  if (!next || next.length > 300) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "https://vabrato.invalid");
    if (u.origin !== "https://vabrato.invalid") return fallback;
    if (u.pathname.startsWith("/auth/") || u.pathname === "/join" || u.pathname === "/sign-in") return fallback;
    return `${u.pathname}${u.search}`;
  } catch {
    return fallback;
  }
}

/**
 * Origin for the magic-link / OAuth redirect. The request's Origin is used
 * only if it's one of ours (production, localhost, this Vercel deployment);
 * Supabase's redirect allowlist checks it again.
 */
export function authRedirectOrigin(
  origin: string | null,
  env: { SITE_URL: string; VERCEL_URL?: string; VERCEL_BRANCH_URL?: string; NODE_ENV?: string },
): string {
  const allowed = new Set([new URL(env.SITE_URL).origin]);
  if (env.VERCEL_URL) allowed.add(`https://${env.VERCEL_URL}`);
  if (env.VERCEL_BRANCH_URL) allowed.add(`https://${env.VERCEL_BRANCH_URL}`);
  if (env.NODE_ENV !== "production") allowed.add("http://localhost:3003");
  return origin && allowed.has(origin) ? origin : new URL(env.SITE_URL).origin;
}

export function callbackUrl(origin: string, next: string): string {
  const u = new URL("/auth/callback", origin);
  if (next !== "/my") u.searchParams.set("next", next);
  return u.toString();
}

/** Friendly message for Supabase Auth errors (never the raw text). */
export function authErrorMessage(message: string | undefined): string {
  if (message && /rate limit|too many|security purposes/i.test(message)) {
    return "Too many sign-in emails were sent. Please wait a few minutes and try again.";
  }
  return "We couldn't send your sign-in link. Please try again shortly.";
}

export type { MemberRole };
