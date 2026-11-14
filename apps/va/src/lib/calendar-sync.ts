import { createServiceSupabase } from "@vabrato/lib";
import {
  CALENDAR_SCOPE,
  accessTokenFor,
  appointmentEvent,
  calendarApi,
  decryptToken,
  GoogleReconnectError,
  googleSetup,
  keyDateEvents,
  planSync,
  revokeToken,
  runSync,
  TokenDecryptError,
  type DealInput,
  type EventSpec,
  type GoogleSetup,
} from "@vabrato/lib/integrations";
import { addDaysISO, pacificToday, type AppointmentFields } from "@/lib/appointment-kinds";

// Google Calendar for a staff member (Integrations PR 1). Server only: it
// reads the encrypted token with the service role, gets a fresh access token,
// and makes their calendar match what the console says should be on it
// (approved appointments they own; key dates of deals they work, if they
// want them). Only events we made are touched, and nothing here throws to
// the caller: a failed sync never blocks the action that started it.

export const CALENDAR_FLAG = "integration_google_calendar";

/** Approved appointments and deals this far back still sync; older ones are left as they are. */
const LOOKBACK_DAYS = 60;

export type CalendarReady = { on: true; setup: GoogleSetup } | { on: false; reason: "off" | "not_set_up"; missing?: string[] };

/** Whether Google Calendar can be used now: the switch is on and the env is set. */
export async function calendarReady(): Promise<CalendarReady> {
  const service = createServiceSupabase();
  const { data } = await service.from("feature_flags").select("enabled").eq("key", CALENDAR_FLAG).maybeSingle();
  if (!data?.enabled) return { on: false, reason: "off" };
  const s = googleSetup();
  return s.ok ? { on: true, setup: s.setup } : { on: false, reason: "not_set_up", missing: s.missing };
}

export const consoleOrigin = () => (process.env.CONSOLE_URL?.trim() || "https://console.vabrato.com").replace(/\/+$/, "");

export type SyncResult =
  | { status: "synced"; changes: number; failed: number; capped: boolean }
  | { status: "not_connected" | "off" | "reconnect" | "failed" };

/** What should be on this person's calendar now. */
export async function desiredEvents(profileId: string): Promise<EventSpec[]> {
  const service = createServiceSupabase();
  const since = addDaysISO(pacificToday(), -LOOKBACK_DAYS);
  const origin = consoleOrigin();
  const out: EventSpec[] = [];

  const { data: appts } = await service
    .from("ai_drafts")
    .select("id, content")
    .eq("kind", "appointment")
    .eq("status", "approved")
    .eq("owner_id", profileId)
    .gte("content->>date", since)
    .limit(500);
  for (const a of appts ?? []) {
    const f = a.content as unknown as AppointmentFields;
    const e = f?.date && f.start && f.minutes ? appointmentEvent({ id: a.id, consoleUrl: origin, fields: { ...f, minutes: f.minutes } }) : null;
    if (e) out.push(e);
  }

  const { data: prefs } = await service.from("staff_calendar_prefs").select("key_dates").eq("profile_id", profileId).maybeSingle();
  if (prefs?.key_dates === false) return out;

  // Deals they work: as the deal's agent or a member of it (not every deal an admin can see).
  const { data: memberOf } = await service.from("deal_members").select("deal_id").eq("profile_id", profileId).neq("member_role", "seller");
  const ids = (memberOf ?? []).map((m) => m.deal_id);
  const cols = "id, address, status, ratification_date, days_to_close, rent_back_days";
  const [{ data: own }, { data: joined }] = await Promise.all([
    service.from("deals").select(cols).eq("agent_id", profileId).neq("status", "cancelled").limit(500),
    ids.length ? service.from("deals").select(cols).in("id", ids.slice(0, 500)).neq("status", "cancelled") : Promise.resolve({ data: [] as never[] }),
  ]);
  const deals = new Map<string, DealInput>();
  for (const d of [...(own ?? []), ...(joined ?? [])]) {
    // A closed deal keeps its dates for a while, then drops off.
    if (d.status === "closed" && d.ratification_date < addDaysISO(since, -120)) continue;
    deals.set(d.id, d as DealInput);
  }
  if (!deals.size) return out;
  const { data: cons } = await service.from("deal_contingencies").select("deal_id, kind, due_date").in("deal_id", [...deals.keys()]);
  for (const d of deals.values()) {
    out.push(...keyDateEvents(d, (cons ?? []).filter((c) => c.deal_id === d.id), origin));
  }
  return out;
}

async function connection(profileId: string) {
  const service = createServiceSupabase();
  const { data } = await service.from("staff_connections").select("token_ciphertext, last_error, scopes").eq("profile_id", profileId).eq("provider", "google").maybeSingle();
  // A Google connection made for Drive only (Integrations PR 2) isn't a calendar connection.
  return data && data.scopes.includes(CALENDAR_SCOPE) ? data : null;
}

async function markConnection(profileId: string, patch: { last_error: "reconnect" | "sync_failed" | null; last_synced_at?: string }) {
  await createServiceSupabase().from("staff_connections").update(patch).eq("profile_id", profileId).eq("provider", "google");
}

/** Makes this person's Google Calendar match the console. Never throws. */
export async function syncCalendarFor(profileId: string, ready?: CalendarReady): Promise<SyncResult> {
  // Not knowing whether the switch is on or the person connected counts as off:
  // nothing to report to someone who never connected a calendar.
  let r: CalendarReady;
  let conn: Awaited<ReturnType<typeof connection>>;
  try {
    r = ready ?? (await calendarReady());
    if (!r.on) return { status: "off" };
    conn = await connection(profileId);
    if (!conn) return { status: "not_connected" };
  } catch {
    return { status: "off" };
  }
  try {
    const service = createServiceSupabase();
    let access: string;
    try {
      access = await accessTokenFor(r.setup, decryptToken(conn.token_ciphertext, r.setup.key));
    } catch (e) {
      if (e instanceof GoogleReconnectError || e instanceof TokenDecryptError) {
        await markConnection(profileId, { last_error: "reconnect" });
        return { status: "reconnect" };
      }
      throw e;
    }
    const [desired, { data: stored }] = await Promise.all([desiredEvents(profileId), service.from("calendar_events").select("source_key, google_event_id, content_hash").eq("profile_id", profileId)]);
    const result = await runSync(planSync(desired, stored ?? []), calendarApi(r.setup, access));
    if (result.saved.length) {
      await service.from("calendar_events").upsert(
        result.saved.map((s) => ({ ...s, profile_id: profileId, updated_at: new Date().toISOString() })),
        { onConflict: "profile_id,source_key" },
      );
    }
    if (result.removed.length) await service.from("calendar_events").delete().eq("profile_id", profileId).in("source_key", result.removed);
    if (result.reconnect) {
      await markConnection(profileId, { last_error: "reconnect" });
      return { status: "reconnect" };
    }
    await markConnection(profileId, { last_error: result.failed ? "sync_failed" : null, last_synced_at: new Date().toISOString() });
    return { status: "synced", changes: result.saved.length + result.removed.length, failed: result.failed, capped: result.capped };
  } catch {
    await markConnection(profileId, { last_error: "sync_failed" }).catch(() => {});
    return { status: "failed" };
  }
}

/**
 * Disconnects Google: removes the events we added (while the token still
 * works), revokes the token at Google and deletes our records. Our records
 * go even if Google can't be reached.
 */
export async function disconnectGoogle(profileId: string): Promise<{ removedEvents: number; eventsRemoved: boolean; revoked: boolean }> {
  const service = createServiceSupabase();
  // The whole Google connection, whatever it was for (Calendar, Drive or both).
  const { data: conn } = await service.from("staff_connections").select("token_ciphertext").eq("profile_id", profileId).eq("provider", "google").maybeSingle();
  let removedEvents = 0;
  let eventsRemoved = false;
  let revoked = false;
  const s = googleSetup();
  if (conn && s.ok) {
    try {
      const refresh = decryptToken(conn.token_ciphertext, s.setup.key);
      try {
        const access = await accessTokenFor(s.setup, refresh);
        const { data: stored } = await service.from("calendar_events").select("source_key, google_event_id, content_hash").eq("profile_id", profileId);
        const result = await runSync(planSync([], stored ?? []), calendarApi(s.setup, access), 1000);
        removedEvents = result.removed.length;
        eventsRemoved = !result.failed && !result.capped && !result.reconnect;
      } catch {
        // The events stay on their calendar; they can delete them there.
      }
      await revokeToken(s.setup, refresh);
      revoked = true;
    } catch {
      revoked = false;
    }
  }
  await service.from("calendar_events").delete().eq("profile_id", profileId);
  await service.from("staff_connections").delete().eq("profile_id", profileId).eq("provider", "google");
  return { removedEvents, eventsRemoved, revoked };
}
