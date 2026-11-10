"use server";

import { headers } from "next/headers";
import { clientIp, hashIp, leadRow, parseLeadForm, verifyTurnstile } from "@/lib/leads";
import { publicWriteSupabase } from "@/lib/public/supabase";

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

  // Insert only, no .select(): leads can't be read back by the public.
  const { error } = await publicWriteSupabase().from("leads").insert(leadRow(parsed.lead, hashIp(ip, process.env.LEAD_IP_SALT)));
  if (error) {
    if (/lead_rate_limited/.test(error.message)) {
      return { status: "error", message: "We've already received several requests from you. An agent will be in touch soon." };
    }
    return { status: "error", message: "Something went wrong sending your request. Please call us or try again shortly." };
  }
  return { status: "sent" };
}
