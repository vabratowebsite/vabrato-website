"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { flagEnabled } from "@/lib/public/listings";
import { VOW_TERMS_VERSION } from "@/member/join";
import { MEMBER_ROLES } from "@/member/roles";
import { requireMember } from "@/member/session";

// Account actions. Every write goes through an RPC that only touches the
// caller's own row (0016); the member can't set role, agent or VOW columns
// directly (review item 6).

export interface AccountFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

const str = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === "string" ? v : "";
};
const on = (form: FormData, k: string) => form.get(k) === "on";

const ProfileInput = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120, "Use 120 characters or fewer."),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9+(). -]{7,32}$/.test(v), "Enter a phone number with digits only, or leave it blank."),
});

const FAILED = "Something went wrong saving that. Please try again.";

export async function updateProfileAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const { supabase } = await requireMember("/my/account");
  const parsed = ProfileInput.safeParse({ fullName: str(form, "fullName"), phone: str(form, "phone") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }
  const { error } = await supabase.rpc("update_my_profile", { p_full_name: parsed.data.fullName, p_phone: parsed.data.phone || null });
  if (error) return { status: "error", message: FAILED };
  revalidatePath("/my", "layout");
  return { status: "saved", message: "Saved." };
}

export async function setAlertsAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const { supabase } = await requireMember("/my/account");
  const { error } = await supabase.rpc("set_alert_emails", { p_on: on(form, "alerts") });
  if (error) return { status: "error", message: FAILED };
  revalidatePath("/my/account");
  return { status: "saved", message: on(form, "alerts") ? "Alert emails are on." : "Alert emails are off." };
}

export async function setRoleAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const { supabase } = await requireMember("/my/account");
  const role = z.enum(MEMBER_ROLES).safeParse(str(form, "role"));
  if (!role.success) return { status: "error", fieldErrors: { role: "Choose buying, selling or both." }, message: "Please choose an option." };
  const { data, error } = await supabase.rpc("set_member_role", { p_role: role.data });
  if (error) return { status: "error", message: FAILED };
  revalidatePath("/my", "layout");
  return {
    status: "saved",
    message: data !== role.data ? "Saved. You're on a sale with us, so your portal keeps the selling pages too." : "Saved.",
  };
}

export async function acceptVowAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const { supabase } = await requireMember("/my/account");
  if (!(await flagEnabled("vow_enabled"))) return { status: "error", message: "Sold data isn't available yet." };
  if (!on(form, "vow")) return { status: "error", fieldErrors: { vow: "Tick the box to accept the Terms of Use." }, message: "Please accept the Terms of Use." };
  const { error } = await supabase.rpc("accept_vow_terms", { p_version: VOW_TERMS_VERSION });
  if (error) return { status: "error", message: FAILED };
  revalidatePath("/my", "layout");
  return { status: "saved", message: "Thanks. Sold prices and price history are now available in your portal." };
}

export async function requestDeletionAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const { supabase } = await requireMember("/my/account");
  if (!on(form, "confirm")) return { status: "error", fieldErrors: { confirm: "Tick the box to confirm." }, message: "Please confirm the request." };
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { status: "error", message: FAILED };
  revalidatePath("/my/account");
  return { status: "saved", message: "Request received. We'll confirm by email once your account is deleted." };
}

/** First /my visit without join choices (Google sign-in from /sign-in, or the cookie was lost). */
export async function onboardingAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const { supabase } = await requireMember("/my/welcome");
  const role = z.enum(MEMBER_ROLES).safeParse(str(form, "role"));
  const profile = ProfileInput.safeParse({ fullName: str(form, "fullName"), phone: str(form, "phone") });
  const fieldErrors: Record<string, string> = {};
  if (!role.success) fieldErrors.role = "Choose buying, selling or both.";
  if (!profile.success) for (const i of profile.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  if (!role.success || !profile.success) return { status: "error", message: "Please check the highlighted fields.", fieldErrors };

  const errors = [
    (await supabase.rpc("update_my_profile", { p_full_name: profile.data.fullName, p_phone: profile.data.phone || null })).error,
    (await supabase.rpc("set_member_role", { p_role: role.data })).error,
    (await supabase.rpc("set_alert_emails", { p_on: on(form, "alerts") })).error,
  ];
  if (on(form, "vow") && (await flagEnabled("vow_enabled"))) errors.push((await supabase.rpc("accept_vow_terms", { p_version: VOW_TERMS_VERSION })).error);
  if (errors.some(Boolean)) return { status: "error", message: FAILED };
  const done = await supabase.rpc("complete_onboarding");
  if (done.error) return { status: "error", message: FAILED };
  revalidatePath("/my", "layout");
  redirect("/my");
}

export async function signOutAction() {
  const { supabase } = await requireMember("/my");
  await supabase.auth.signOut();
  redirect("/");
}
