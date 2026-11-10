"use server";

import { headers } from "next/headers";
import { clientIp, hashIp, leadRow, parseLeadForm, signinToken, verifyTurnstile } from "@/lib/leads";
import { publicWriteSupabase } from "@/lib/public/supabase";
import { hasAuthCookie } from "@/member/cookie";
import { getMember } from "@/member/session";

export interface LeadFormState {
  status: "idle" | "sent" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

/** Server action behind every public lead form (useActionState). */
export async function submitLead(_prev: LeadFormState, form: FormData): Promise<LeadFormState> {
  const parsed = parseLeadForm(form);
  if (!parsed.ok) return { status: "error", message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  // Honeypot filled: report success, store nothing.
  if (parsed.honeypot) return { status: "sent" };

  const h = await headers();
  const ip = clientIp(h);
  const token = form.get("cf-turnstile-response");
  if (!(await verifyTurnstile(typeof token === "string" ? token : null, ip))) {
    return { status: "error", message: "We couldn't confirm you're not a robot. Please try again." };
  }

  // Open-house sign-ins (the agent's tablet): only with the event's link, on
  // the day; no IP limit (every visitor shares the tablet) and no account link.
  if (parsed.lead.kind === "open_house_signin") {
    const token = signinToken(form);
    if (!token) return { status: "error", message: "This sign-in link isn't valid. Ask the agent for a new one." };
    const hasAgent = parsed.lead.payload.hasAgent;
    const { error } = await publicWriteSupabase().rpc("submit_open_house_signin", {
      p_token: token,
      p_name: parsed.lead.name ?? "",
      p_email: parsed.lead.email,
      p_phone: parsed.lead.phone ?? "",
      p_consent_contact: parsed.lead.consentContact,
      p_has_agent: hasAgent === "yes" || hasAgent === "no" ? hasAgent : "",
    });
    if (!error) return { status: "sent" };
    if (/signin_closed|not_found/.test(error.message)) return { status: "error", message: "Sign-in for this open house is closed." };
    if (/lead_rate_limited/.test(error.message)) return { status: "error", message: "You're already signed in. Thank you!" };
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  // Signed-in members' requests are linked to their account (tours show in
  // /my/tours), inserted with their own client so RLS checks profile_id.
  const row = leadRow(parsed.lead, hashIp(ip, process.env.LEAD_IP_SALT));
  const member = hasAuthCookie(h.get("cookie") ?? "") ? await getMember() : null;
  // Insert only, no .select(): leads can't be read back by the public.
  const { error } = member
    ? await member.supabase.from("leads").insert({ ...row, profile_id: member.user.id })
    : await publicWriteSupabase().from("leads").insert(row);
  if (error) {
    if (/lead_rate_limited/.test(error.message)) {
      return { status: "error", message: "We've already received several requests from you. An agent will be in touch soon." };
    }
    return { status: "error", message: "Something went wrong sending your request. Please call us or try again shortly." };
  }
  return { status: "sent" };
}
