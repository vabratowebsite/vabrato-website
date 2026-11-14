"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STAFF_ROLES, getProfile } from "@vabrato/lib";
import { googleSetup } from "@vabrato/lib/integrations";
import { CALENDAR_FLAG, disconnectGoogle, syncCalendarFor } from "@/lib/calendar-sync";
import { syncMessage } from "@/lib/calendar-messages";
import type { ActionState } from "@/lib/lead-actions";
import { supabaseServer } from "@/lib/supabase-server";

// Settings → Connected accounts (Integrations PR 1). Each person acts on
// their own connection only; the switch is for admins (audited in 0042).

async function staff() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

export async function syncNowAction(_prev: ActionState): Promise<ActionState> {
  const { profile } = await staff();
  const r = await syncCalendarFor(profile.id);
  revalidatePath("/settings");
  return syncMessage(r);
}

export async function setKeyDatesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staff();
  const on = form.get("key_dates") === "true";
  // Update the row, or add it the first time (0042 lets a person change only key_dates on their row).
  const { data: changed, error: updateError } = await supabase.from("staff_calendar_prefs").update({ key_dates: on, updated_at: new Date().toISOString() }).eq("profile_id", profile.id).select("profile_id");
  const error = updateError ?? (changed?.length ? null : (await supabase.from("staff_calendar_prefs").insert({ profile_id: profile.id, key_dates: on })).error);
  if (error) return { error: "Couldn't save that. Please try again." };
  const r = await syncCalendarFor(profile.id);
  revalidatePath("/settings");
  const saved = on ? "Key dates of your deals will be on your calendar." : "Key dates are off; the ones we added are removed.";
  if (r.status === "synced" && !r.failed) return { error: null, ok: saved };
  if (r.status === "not_connected" || r.status === "off") return { error: null, ok: "Saved." };
  return { error: `Saved, but the calendar wasn't updated. ${syncMessage(r).error ?? ""}`.trim() };
}

export async function disconnectGoogleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await staff();
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  const r = await disconnectGoogle(profile.id);
  revalidatePath("/settings");
  // The panel this form sits in goes away with the connection, so the result is shown on Settings itself.
  redirect(`/settings?google=${r.revoked && r.eventsRemoved ? "disconnected" : "disconnected_partial"}`);
}

export async function setCalendarSwitchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staff();
  if (profile.role !== "admin") return { error: "Only an admin can change this." };
  const on = form.get("on") === "true";
  if (on) {
    const s = googleSetup();
    if (!s.ok) return { error: `Set ${s.missing.join(", ")} in the console's environment first.` };
  }
  const { error } = await supabase.rpc("set_integration_flag", { p_key: CALENDAR_FLAG, p_on: on });
  if (error) return { error: "Couldn't change the switch. Please try again." };
  revalidatePath("/settings");
  return { error: null, ok: on ? "Google Calendar is on: each person can connect their own." : "Google Calendar is off. Connections stay, but nothing syncs." };
}
