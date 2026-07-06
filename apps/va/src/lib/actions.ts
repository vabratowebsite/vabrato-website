"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_CONTINGENCIES, generateSchedule, signOut } from "@vabrato/lib";
import { parseDealForm } from "@/lib/deal-schema";
import { supabaseServer } from "@/lib/supabase-server";

export async function signOutAction() {
  const supabase = await supabaseServer();
  await signOut(supabase);
  redirect("/login");
}

export interface FormState {
  error: string | null;
}

/**
 * Creates the deal, then materializes the engine's schedule into task and
 * contingency rows. RLS enforces staff + deal access; agent_id is set to the
 * creator so agents can see the deals they open.
 */
export async function createDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = parseDealForm(form);
  if (parsed.error !== null) return { error: parsed.error };
  const input = parsed.data;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const schedule = generateSchedule({
    ratificationDate: input.ratification_date,
    daysToClose: input.days_to_close,
    sellerType: input.seller_type,
    rentBackDays: input.rent_back_days,
  });

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .insert({
      address: input.address,
      escrow_number: input.escrow_number || null,
      seller_name: input.seller_name || null,
      seller_type: input.seller_type,
      ratification_date: input.ratification_date,
      days_to_close: input.days_to_close,
      rent_back_days: input.rent_back_days,
      sale_price: input.sale_price,
      agent_id: auth.user.id,
    })
    .select("id")
    .single();
  if (dealError || !deal) {
    return { error: `Could not create deal: ${dealError?.message ?? "unknown error"}` };
  }

  const { error: taskError } = await supabase.from("tasks").insert(
    schedule.tasks.map((t) => ({
      deal_id: deal.id,
      title: t.title,
      owner: t.owner,
      phase: t.phase,
      offset_days: t.offsetDays,
      due_date: t.dueDate,
    })),
  );

  const { error: contingencyError } = await supabase.from("deal_contingencies").insert(
    DEFAULT_CONTINGENCIES.map((c) => ({
      deal_id: deal.id,
      kind: c.kind,
      offset_days: c.offsetDays,
      due_date: schedule.timeline.contingencyRemovals.find((r) => r.kind === c.kind)?.dueDate,
    })),
  );

  if (taskError || contingencyError) {
    // Deal exists but the schedule didn't fully land — surface it rather than
    // leaving a half-built deal silently.
    return {
      error: `Deal created but schedule failed: ${(taskError ?? contingencyError)?.message}`,
    };
  }

  redirect(`/deals/${deal.id}`);
}

export async function toggleTaskAction(taskId: string, dealId: string, done: boolean) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) console.error("[toggleTask]", error.message);
  revalidatePath(`/deals/${dealId}`);
}
