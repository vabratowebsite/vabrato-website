import { Panel, Pill } from "@vabrato/ui/web";
import { googleSetup } from "@vabrato/lib/integrations";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, errorCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { CALENDAR_FLAG } from "@/lib/calendar-sync";
import { CONNECT_MESSAGES } from "@/lib/google-oauth";
import { disconnectGoogleAction, setCalendarSwitchAction, setKeyDatesAction, syncNowAction } from "@/lib/integration-actions";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Settings → Connected accounts (Integrations PR 1): each staff member's own
// Google Calendar connection, and for admins the switch. The console only
// adds events it made (approved appointments, deals' key dates); it never
// reads the calendar or invites anyone.
export async function ConnectedAccounts({ isAdmin, notice }: { isAdmin: boolean; notice?: string }) {
  const supabase = await supabaseServer();
  const [{ data: conns }, { data: flag }, { data: prefs }, { count }] = await Promise.all([
    supabase.rpc("my_connections"),
    supabase.from("feature_flags").select("enabled").eq("key", CALENDAR_FLAG).maybeSingle(),
    supabase.from("staff_calendar_prefs").select("key_dates").maybeSingle(),
    supabase.from("calendar_events").select("id", { count: "exact", head: true }),
  ]);
  const setup = googleSetup();
  const on = Boolean(flag?.enabled);
  const ready = on && setup.ok;
  const google = (conns ?? []).find((c) => c.provider === "google");
  const keyDates = prefs?.key_dates !== false;
  const message = notice ? CONNECT_MESSAGES[notice] : undefined;

  return (
    <>
      <Panel title="Connected accounts">
        {message && (
          <p role={message.ok ? "status" : "alert"} className={`${message.ok ? okCls : errorCls} mb-4`}>
            {message.text}
          </p>
        )}
        <h3 className="font-body text-body-md font-medium text-ink">Google Calendar</h3>
        <p className={`${mutedCls} mt-1 mb-4`}>
          Adds your approved appointments and, if you like, the key dates of your deals (contingency removals, close of escrow, rent-back end) to your own Google Calendar, as private events. The
          console never reads your calendar and never invites anyone.
        </p>

        {!ready && !google && <p className="font-body text-body-sm text-ink">Not set up yet.{isAdmin ? " See the switch below." : " An admin turns it on once it's ready."}</p>}

        {ready && !google && (
          <a href="/integrations/google/start" className={`${btnPrimary} inline-flex items-center`}>
            Connect Google Calendar
          </a>
        )}

        {google && (
          <div className="space-y-5">
            <p role="status" className="flex flex-wrap items-center gap-2 font-body text-body-sm text-ink">
              {google.last_error === "reconnect" ? <Pill tone="red">Needs reconnecting</Pill> : <Pill tone="green">Connected</Pill>}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {google.account_email ?? "Google account"}
                {google.last_synced_at ? ` · last synced ${fmtWhen(google.last_synced_at)}` : " · not synced yet"}
                {` · ${count ?? 0} event${count === 1 ? "" : "s"} added`}
              </span>
            </p>
            {google.last_error === "reconnect" && (
              <p className={errorCls}>
                Google stopped accepting the console&apos;s access (it was removed, or it expired).{" "}
                {ready ? (
                  <a href="/integrations/google/start" className="underline">
                    Reconnect Google Calendar
                  </a>
                ) : (
                  "Reconnect once Google Calendar is turned back on."
                )}
              </p>
            )}
            {google.last_error === "sync_failed" && <p className={errorCls}>The last sync didn&apos;t finish. Try Sync now.</p>}
            {!ready && <p className={mutedCls}>Google Calendar is switched off, so nothing syncs until it&apos;s back on.</p>}

            {ready && (
              <>
                <ActionForm action={setKeyDatesAction} submitLabel={keyDates ? "Stop adding key dates" : "Add key dates for my deals"} secondary={keyDates}>
                  <p className="font-body text-body-sm text-ink">{keyDates ? "Key dates of your deals are added." : "Only your approved appointments are added."}</p>
                  <input type="hidden" name="key_dates" value={keyDates ? "false" : "true"} />
                </ActionForm>
                <ActionForm action={syncNowAction} submitLabel="Sync now" pendingLabel="Syncing…" secondary />
              </>
            )}

            <ActionForm action={disconnectGoogleAction} submitLabel="Disconnect Google Calendar" pendingLabel="Disconnecting…" secondary>
              <label className={`${labelCls} flex items-start gap-2`}>
                <input type="checkbox" name="confirm" value="yes" required className="mt-1 h-5 w-5" />
                <span>Remove the events the console added and the console&apos;s access to my Google account.</span>
              </label>
            </ActionForm>
          </div>
        )}
      </Panel>

      {isAdmin && (
        <Panel title="Google Calendar switch">
          <p role="status" className="mb-2 font-body text-body-sm font-medium text-ink">
            {on ? "On: staff can connect their own Google Calendar." : "Off: nobody can connect, and nothing syncs."}
          </p>
          {!setup.ok && <p className={`${mutedCls} mb-4`}>Not set up: the console&apos;s environment needs {setup.missing.join(", ")}. See STATUS, &ldquo;Needs you&rdquo;.</p>}
          <ActionForm action={setCalendarSwitchAction} submitLabel={on ? "Turn Google Calendar off" : "Turn Google Calendar on"} secondary={on}>
            <input type="hidden" name="on" value={on ? "false" : "true"} />
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
