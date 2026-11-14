"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STAFF_ROLES, createServiceSupabase, getProfile } from "@vabrato/lib";
import { decryptToken, dropboxAccessToken, dropboxRevoke, dropboxSetup, googleSetup } from "@vabrato/lib/integrations";
import { CALENDAR_FLAG, disconnectGoogle, syncCalendarFor } from "@/lib/calendar-sync";
import { DRIVE_FLAG, DROPBOX_FLAG, pickerSettings } from "@/lib/imports";
import { syncMessage } from "@/lib/calendar-messages";
import type { ActionState } from "@/lib/lead-actions";
import { supabaseServer } from "@/lib/supabase-server";

// Settings → Connected accounts (Integrations PR 1 and 2). Each person acts
// on their own connections only; the switches are for admins (audited in 0042).

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

/** Disconnects Dropbox: revokes the console's access there and deletes our record of it. */
export async function disconnectDropboxAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await staff();
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  const service = createServiceSupabase();
  const { data: conn } = await service.from("staff_connections").select("token_ciphertext").eq("profile_id", profile.id).eq("provider", "dropbox").maybeSingle();
  let revoked = !conn;
  const d = dropboxSetup();
  if (conn && d.ok) {
    try {
      await dropboxRevoke(d.setup, await dropboxAccessToken(d.setup, decryptToken(conn.token_ciphertext, d.setup.key)));
      revoked = true;
    } catch {
      revoked = false;
    }
  }
  await service.from("staff_connections").delete().eq("profile_id", profile.id).eq("provider", "dropbox");
  revalidatePath("/settings");
  redirect(`/settings?google=${revoked ? "dropbox_disconnected" : "dropbox_disconnected_partial"}`);
}

const SWITCHES: Record<string, { name: string; on: string; off: string; missing: () => string[] }> = {
  [CALENDAR_FLAG]: {
    name: "Google Calendar",
    on: "Google Calendar is on: each person can connect their own.",
    off: "Google Calendar is off. Connections stay, but nothing syncs.",
    missing: () => {
      const g = googleSetup();
      return g.ok ? [] : g.missing;
    },
  },
  [DRIVE_FLAG]: {
    name: "Google Drive import",
    on: "Google Drive import is on: each person allows it once in Settings.",
    off: "Google Drive import is off. Connections stay, but nothing can be imported.",
    missing: () => {
      const g = googleSetup();
      return [...(g.ok ? [] : g.missing), ...(pickerSettings() ? [] : ["GOOGLE_PICKER_API_KEY", "GOOGLE_CLOUD_PROJECT_NUMBER"])];
    },
  },
  [DROPBOX_FLAG]: {
    name: "Dropbox import",
    on: "Dropbox import is on: each person can connect their own Dropbox.",
    off: "Dropbox import is off. Connections stay, but nothing can be imported.",
    missing: () => {
      const d = dropboxSetup();
      return d.ok ? [] : d.missing;
    },
  },
};

/** An admin turns an integration on or off (audited by set_integration_flag). */
export async function setIntegrationSwitchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await staff();
  if (profile.role !== "admin") return { error: "Only an admin can change this." };
  const key = String(form.get("key") ?? "");
  const sw = SWITCHES[key];
  if (!sw) return { error: "Unknown switch." };
  const on = form.get("on") === "true";
  if (on) {
    const missing = sw.missing();
    if (missing.length) return { error: `Set ${missing.join(", ")} in the console's environment first.` };
  }
  const { error } = await supabase.rpc("set_integration_flag", { p_key: key, p_on: on });
  if (error) return { error: "Couldn't change the switch. Please try again." };
  revalidatePath("/settings");
  return { error: null, ok: on ? sw.on : sw.off };
}
