"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import type { ActionState } from "@/lib/lead-actions";
import { supabaseServer } from "@/lib/supabase-server";

// Seller weekly report (S6 PR 5): staff review the preview, then send. The
// database function checks deal access, sends once per deal per week and
// audits it.

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return supabase;
}

function friendly(message: string): string {
  if (/already_sent/.test(message)) return "This week's report was already sent.";
  if (/not_linked/.test(message)) return "Link the deal to its MLS listing first (deal page).";
  if (/no_sellers/.test(message)) return "No seller has portal access on this deal yet. Invite them from the deal page.";
  if (/bad_week/.test(message)) return "Pick a finished week.";
  if (/not_allowed/.test(message)) return "You don't have access to this deal.";
  return "Couldn't send the report. Please try again.";
}

export async function sendWeeklyReportAction(dealId: string, weekStart: string, _prev: ActionState, _form: FormData): Promise<ActionState> {
  const supabase = await staffClient();
  const deal = z.string().uuid().parse(dealId);
  const week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(weekStart);
  const { error } = await supabase.rpc("send_seller_weekly_report", { p_deal: deal, p_week_start: week });
  if (error) return { error: friendly(error.message) };
  revalidatePath("/reports");
  // The Send form goes away once it's sent, so the page says it.
  redirect(`/reports/${deal}?week=${week}&done=sent`);
}
