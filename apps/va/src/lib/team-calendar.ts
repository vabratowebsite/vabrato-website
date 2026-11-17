import { createServiceSupabase } from "@vabrato/lib";
import {
  accessTokenFor,
  appointmentEvent,
  calendarApi,
  calendarExists,
  createCalendar,
  decryptToken,
  GoogleError,
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

// The team Google Calendar (0045; replaces the per-person calendars of
// Integrations PR 1). An admin connects one Google account once; the console
// makes a calendar called "Vabrato" there and keeps it matching what the
// console says: every approved appointment and every real deal's key dates,
// each titled with who it's for. The owner shares that calendar with the team
// in Google Calendar. Server only (service role); nothing here throws to the
// caller, so a failed sync never blocks the action that started it.

export const CALENDAR_FLAG = "integration_google_calendar";
export const TEAM_CALENDAR_NAME = "Vabrato";
const TIME_ZONE = "America/Los_Angeles";
const DESCRIPTION = "Appointments and deal key dates from the Vabrato console. The console keeps this calendar up to date; changes made here are replaced.";

/** Approved appointments and deals this far back still sync; older ones are left as they are. */
const LOOKBACK_DAYS = 60;
/** A closed deal keeps its dates this much longer, then drops off. */
const CLOSED_KEEP_DAYS = 120;
/** How long one sync may hold the lease before another may take over. */
const LEASE_MS = 2 * 60_000;

export type CalendarReady = { on: true; setup: GoogleSetup } | { on: false; reason: "off" | "not_set_up"; missing?: string[] };

/** Whether the team calendar can be used now: the switch is on and the env is set. */
export async function teamCalendarReady(): Promise<CalendarReady> {
  const service = createServiceSupabase();
  const { data } = await service.from("feature_flags").select("enabled").eq("key", CALENDAR_FLAG).maybeSingle();
  if (!data?.enabled) return { on: false, reason: "off" };
  const s = googleSetup();
  return s.ok ? { on: true, setup: s.setup } : { on: false, reason: "not_set_up", missing: s.missing };
}

export const consoleOrigin = () => (process.env.CONSOLE_URL?.trim() || "https://console.vabrato.com").replace(/\/+$/, "");

export type SyncResult =
  | { status: "synced"; changes: number; failed: number; capped: boolean; recreated: boolean }
  | { status: "not_connected" | "off" | "reconnect" | "failed" | "busy" | "calendar_gone" };

const nameOf = (p: { full_name: string | null } | null | undefined) => p?.full_name?.trim() || null;

/** What should be on the team calendar now. */
export async function desiredTeamEvents(): Promise<EventSpec[]> {
  const service = createServiceSupabase();
  const since = addDaysISO(pacificToday(), -LOOKBACK_DAYS);
  const origin = consoleOrigin();
  const out: EventSpec[] = [];

  // Deals: every real one (test deals are fictional, 0044, and never go on a real calendar).
  const { data: deals } = await service
    .from("deals")
    .select("id, address, status, ratification_date, days_to_close, rent_back_days, is_test, agent:profiles!deals_agent_id_fkey(full_name)")
    .neq("status", "cancelled")
    .limit(1000);
  const testDeals = new Set<string>();
  const live = new Map<string, DealInput>();
  for (const d of deals ?? []) {
    if (d.is_test) {
      testDeals.add(d.id);
      continue;
    }
    if (d.status === "closed" && d.ratification_date < addDaysISO(since, -CLOSED_KEEP_DAYS)) continue;
    live.set(d.id, {
      id: d.id,
      address: d.address,
      status: d.status as DealInput["status"],
      ratification_date: d.ratification_date,
      days_to_close: d.days_to_close,
      rent_back_days: d.rent_back_days,
      who: nameOf(d.agent as { full_name: string | null } | null),
    });
  }
  // A test deal that was cancelled still isn't real: its appointments stay off too.
  const { data: cancelledTests } = await service.from("deals").select("id").eq("is_test", true).eq("status", "cancelled").limit(1000);
  for (const d of cancelledTests ?? []) testDeals.add(d.id);

  const { data: appts } = await service
    .from("ai_drafts")
    .select("id, content, deal_id, owner:profiles!ai_drafts_owner_id_fkey(full_name)")
    .eq("kind", "appointment")
    .eq("status", "approved")
    .gte("content->>date", since)
    .limit(1000);
  for (const a of appts ?? []) {
    if (a.deal_id && testDeals.has(a.deal_id)) continue;
    const f = a.content as unknown as AppointmentFields;
    const e =
      f?.date && f.start && f.minutes
        ? appointmentEvent({ id: a.id, consoleUrl: origin, who: nameOf(a.owner as { full_name: string | null } | null), fields: { ...f, minutes: f.minutes } })
        : null;
    if (e) out.push(e);
  }

  if (live.size) {
    const ids = [...live.keys()];
    const { data: cons } = await service.from("deal_contingencies").select("deal_id, kind, due_date").in("deal_id", ids);
    for (const d of live.values()) out.push(...keyDateEvents(d, (cons ?? []).filter((c) => c.deal_id === d.id), origin));
  }
  return out;
}

type Mark = { last_error?: "reconnect" | "sync_failed" | "calendar_gone" | null; last_synced_at?: string; calendar_id?: string | null; calendar_name?: string | null; sync_lock_until?: string | null };
const mark = (patch: Mark) => createServiceSupabase().from("team_calendar").update(patch).eq("singleton", true);

/** Takes the sync lease if it's free (or its holder ran out of time). */
async function takeLease(): Promise<boolean> {
  // Two conditional updates (free, then expired), each atomic: PostgREST's
  // `or` filter on an update fails for a column the update doesn't set.
  const now = new Date();
  const lease = { sync_lock_until: new Date(now.getTime() + LEASE_MS).toISOString() };
  const service = createServiceSupabase();
  const { data: free } = await service.from("team_calendar").update(lease).eq("singleton", true).is("sync_lock_until", null).select("singleton");
  if (free?.length) return true;
  const { data: expired } = await service.from("team_calendar").update(lease).eq("singleton", true).lt("sync_lock_until", now.toISOString()).select("singleton");
  return Boolean(expired?.length);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A new "Vabrato" calendar in the connected account; what we put on the old one is forgotten. */
async function newCalendar(setup: GoogleSetup, access: string): Promise<string> {
  const id = await createCalendar(setup, access, { name: TEAM_CALENDAR_NAME, timeZone: TIME_ZONE, description: DESCRIPTION });
  const service = createServiceSupabase();
  await service.from("team_calendar_events").delete().neq("source_key", "");
  await mark({ calendar_id: id, calendar_name: TEAM_CALENDAR_NAME });
  return id;
}

/**
 * Makes the team calendar match the console. Never throws. One sync runs at a
 * time: with `wait`, it waits (up to about half a minute) for one already
 * running to finish, so the change that started it isn't missed.
 */
export async function syncTeamCalendar(o: { wait?: boolean } = {}): Promise<SyncResult> {
  let r: CalendarReady;
  try {
    r = await teamCalendarReady();
    if (!r.on) return { status: "off" };
    const { data: exists } = await createServiceSupabase().from("team_calendar").select("singleton").maybeSingle();
    if (!exists) return { status: "not_connected" };
  } catch {
    return { status: "off" };
  }
  let leased = false;
  try {
    for (let i = 0; i < (o.wait ? 15 : 1) && !(leased = await takeLease()); i++) if (o.wait) await sleep(2000);
    if (!leased) return { status: "busy" };
    return await syncHoldingLease(r.setup);
  } catch {
    return { status: "failed" };
  } finally {
    if (leased) await mark({ sync_lock_until: null }).then(
      () => {},
      () => {},
    );
  }
}

async function syncHoldingLease(setup: GoogleSetup): Promise<SyncResult> {
  const service = createServiceSupabase();
  const { data: conn } = await service.from("team_calendar").select("token_ciphertext, calendar_id").maybeSingle();
  if (!conn) return { status: "not_connected" };
  let stage: "token" | "calendar" | "events" = "token";
  try {
    const access = await accessTokenFor(setup, decryptToken(conn.token_ciphertext, setup.key));
    stage = "calendar";
    let recreated = false;
    let calendarId = conn.calendar_id;
    if (!calendarId || !(await calendarExists(setup, access, calendarId))) {
      calendarId = await newCalendar(setup, access);
      recreated = Boolean(conn.calendar_id);
    }
    stage = "events";
    let changes = 0;
    let failed = 0;
    let capped = false;
    // Twice at most: once more if the calendar disappears partway through.
    for (let attempt = 0; attempt < 2; attempt++) {
      const [desired, { data: stored }] = await Promise.all([desiredTeamEvents(), service.from("team_calendar_events").select("source_key, google_event_id, content_hash")]);
      const result = await runSync(planSync(desired, stored ?? []), calendarApi(setup, access, calendarId));
      if (result.saved.length) {
        await service.from("team_calendar_events").upsert(
          result.saved.map((s) => ({ ...s, updated_at: new Date().toISOString() })),
          { onConflict: "source_key" },
        );
      }
      if (result.removed.length) await service.from("team_calendar_events").delete().in("source_key", result.removed);
      if (result.reconnect) throw new GoogleReconnectError();
      changes += result.saved.length + result.removed.length;
      failed = result.failed;
      capped = result.capped;
      if (!result.calendarGone) break;
      if (attempt === 1) throw new CalendarStillGone();
      stage = "calendar";
      calendarId = await newCalendar(setup, access);
      recreated = true;
      stage = "events";
    }
    await mark({ last_error: failed ? "sync_failed" : null, last_synced_at: new Date().toISOString() });
    return { status: "synced", changes, failed, capped, recreated };
  } catch (e) {
    // A token Google refused, one we can't read, or one without calendar access (403): reconnect.
    if (e instanceof GoogleReconnectError || e instanceof TokenDecryptError || (stage === "calendar" && e instanceof GoogleError && e.status === 403)) {
      await mark({ last_error: "reconnect" });
      return { status: "reconnect" };
    }
    if (stage === "calendar" || e instanceof CalendarStillGone) {
      await mark({ last_error: "calendar_gone" });
      return { status: "calendar_gone" };
    }
    await mark({ last_error: "sync_failed" });
    return { status: "failed" };
  }
}

class CalendarStillGone extends Error {}

/**
 * Whether a Google account is also used by another stored connection. Google
 * ends an account's whole grant to the console when any of its tokens is
 * revoked, so a token is revoked only when nothing else uses that account.
 */
export async function googleAccountShared(email: string | null, except: { team?: boolean; profileId?: string }): Promise<boolean> {
  if (!email) return false;
  const service = createServiceSupabase();
  const want = email.trim().toLowerCase();
  const [{ data: team }, { data: people }] = await Promise.all([
    except.team ? Promise.resolve({ data: null }) : service.from("team_calendar").select("account_email").maybeSingle(),
    service.from("staff_connections").select("profile_id, account_email").eq("provider", "google"),
  ]);
  if (team?.account_email?.toLowerCase() === want) return true;
  return (people ?? []).some((p) => p.profile_id !== except.profileId && p.account_email?.toLowerCase() === want);
}

/**
 * Disconnects the team calendar: revokes the console's access (unless the same
 * Google account is also someone's Drive connection) and forgets the
 * calendar. The calendar and its events stay in Google; the owner can delete
 * them there. Our records go even if Google can't be reached.
 */
export async function disconnectTeamCalendar(): Promise<{ revoked: boolean; shared: boolean }> {
  const service = createServiceSupabase();
  const { data: conn } = await service.from("team_calendar").select("token_ciphertext, account_email").maybeSingle();
  let revoked = !conn;
  let shared = false;
  const s = googleSetup();
  if (conn) {
    shared = await googleAccountShared(conn.account_email, { team: true }).catch(() => false);
    if (shared) revoked = true;
    else if (s.ok) {
      try {
        await revokeToken(s.setup, decryptToken(conn.token_ciphertext, s.setup.key));
        revoked = true;
      } catch {
        revoked = false;
      }
    }
  }
  await service.from("team_calendar_events").delete().neq("source_key", "");
  await service.from("team_calendar").delete().eq("singleton", true);
  return { revoked, shared };
}

/**
 * Disconnects a person's Google Drive imports: revokes the console's access
 * (unless the same Google account holds the team calendar) and deletes our
 * record. Files already imported stay on their deals.
 */
export async function disconnectGoogleDrive(profileId: string): Promise<{ revoked: boolean; shared: boolean }> {
  const service = createServiceSupabase();
  const { data: conn } = await service.from("staff_connections").select("token_ciphertext, account_email").eq("profile_id", profileId).eq("provider", "google").maybeSingle();
  let revoked = !conn;
  let shared = false;
  const s = googleSetup();
  if (conn) {
    shared = await googleAccountShared(conn.account_email, { profileId }).catch(() => false);
    if (shared) revoked = true;
    else if (s.ok) {
      try {
        await revokeToken(s.setup, decryptToken(conn.token_ciphertext, s.setup.key));
        revoked = true;
      } catch {
        revoked = false;
      }
    }
  }
  await service.from("staff_connections").delete().eq("profile_id", profileId).eq("provider", "google");
  return { revoked, shared };
}
