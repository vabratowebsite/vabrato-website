"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STAFF_ROLES, createServiceSupabase, getProfile } from "@vabrato/lib";
import { decryptToken, dropboxAccessToken, dropboxRevoke, dropboxSetup, googleSetup } from "@vabrato/lib/integrations";
import { DRIVE_FLAG, DROPBOX_FLAG, pickerSettings } from "@/lib/imports";
import { syncMessage } from "@/lib/calendar-messages";
import type { ActionState } from "@/lib/lead-actions";
import { supabaseServer } from "@/lib/supabase-server";
import { CALENDAR_FLAG, disconnectGoogleDrive, disconnectTeamCalendar, syncTeamCalendar } from "@/lib/team-calendar";

// Settings → Connected accounts (Integrations PR 1 and 2; the team calendar
// since 0045). Each person acts on their own Drive and Dropbox connections
// only; the team calendar and the switches are for admins (audited in 0042).

async function staff() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

/** An admin brings the team calendar up to date now. */
export async function syncNowAction(_prev: ActionState): Promise<ActionState> {
  const { profile } = await staff();
  if (profile.role !== "admin") return { error: "Only an admin can do this." };
  const r = await syncTeamCalendar({ wait: true });
  revalidatePath("/settings");
  return syncMessage(r);
}

/** An admin disconnects the team calendar. The "Vabrato" calendar stays in Google. */
export async function disconnectTeamCalendarAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await staff();
  if (profile.role !== "admin") return { error: "Only an admin can do this." };
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  const r = await disconnectTeamCalendar();
  revalidatePath("/settings");
  redirect(`/settings?google=${!r.revoked ? "team_disconnected_partial" : r.shared ? "team_disconnected_shared" : "team_disconnected"}`);
}

/** Disconnects this person's Google Drive imports. */
export async function disconnectGoogleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { profile } = await staff();
  if (form.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  const r = await disconnectGoogleDrive(profile.id);
  revalidatePath("/settings");
  // The panel this form sits in goes away with the connection, so the result is shown on Settings itself.
  redirect(`/settings?google=${!r.revoked ? "disconnected_partial" : r.shared ? "disconnected_shared" : "disconnected"}`);
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
    name: "Team Google Calendar",
    on: "The team Google Calendar is on: an admin can connect it in Connected accounts.",
    off: "The team Google Calendar is off. Its connection stays, but nothing syncs.",
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
