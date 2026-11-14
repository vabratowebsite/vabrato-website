import { Panel, Pill } from "@vabrato/ui/web";
import { CALENDAR_SCOPE, DRIVE_SCOPE, googleSetup } from "@vabrato/lib/integrations";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, btnSecondary, errorCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { CALENDAR_FLAG } from "@/lib/calendar-sync";
import { CONNECT_MESSAGES } from "@/lib/google-oauth";
import { DRIVE_FLAG, DROPBOX_FLAG, importSwitches } from "@/lib/imports";
import { disconnectDropboxAction, disconnectGoogleAction, setIntegrationSwitchAction, setKeyDatesAction, syncNowAction } from "@/lib/integration-actions";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Settings → Connected accounts (Integrations PR 1 and 2): each staff
// member's own Google account (Calendar, Drive import) and Dropbox, and for
// admins the switches. The console only adds calendar events it made, opens
// only Drive files the person picks, and only reads Dropbox's Apps/Vabrato.
export async function ConnectedAccounts({ isAdmin, notice }: { isAdmin: boolean; notice?: string }) {
  const supabase = await supabaseServer();
  const [{ data: conns }, { data: flags }, { data: prefs }, { count }, imports] = await Promise.all([
    supabase.rpc("my_connections"),
    supabase.from("feature_flags").select("key, enabled").in("key", [CALENDAR_FLAG, DRIVE_FLAG, DROPBOX_FLAG]),
    supabase.from("staff_calendar_prefs").select("key_dates").maybeSingle(),
    supabase.from("calendar_events").select("id", { count: "exact", head: true }),
    importSwitches(),
  ]);
  const flag = (key: string) => Boolean((flags ?? []).find((f) => f.key === key)?.enabled);
  const setup = googleSetup();
  const calendarOn = flag(CALENDAR_FLAG) && setup.ok;
  const google = (conns ?? []).find((c) => c.provider === "google");
  const dropbox = (conns ?? []).find((c) => c.provider === "dropbox");
  const hasCalendar = Boolean(google?.scopes.includes(CALENDAR_SCOPE));
  const hasDrive = Boolean(google?.scopes.includes(DRIVE_SCOPE));
  const googleBroken = google?.last_error === "reconnect";
  const keyDates = prefs?.key_dates !== false;
  const message = notice ? CONNECT_MESSAGES[notice] : undefined;
  const status = (broken: boolean, email: string | null, extra = "") => (
    <p role="status" className="flex flex-wrap items-center gap-2 font-body text-body-sm text-ink">
      {broken ? <Pill tone="red">Needs reconnecting</Pill> : <Pill tone="green">Connected</Pill>}
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {email ?? "Account"}
        {extra}
      </span>
    </p>
  );
  const confirm = (text: string) => (
    <label className={`${labelCls} flex items-start gap-2`}>
      <input type="checkbox" name="confirm" value="yes" required className="mt-1 h-5 w-5" />
      <span>{text}</span>
    </label>
  );

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
        {!calendarOn && !hasCalendar && <p className="font-body text-body-sm text-ink">Not set up yet.{isAdmin ? " See the switches below." : " An admin turns it on once it's ready."}</p>}
        {calendarOn && !hasCalendar && (
          <a href="/integrations/google/start" className={`${btnPrimary} inline-flex items-center`}>
            Connect Google Calendar
          </a>
        )}
        {hasCalendar && google && (
          <div className="space-y-5">
            {status(googleBroken, google.account_email, `${google.last_synced_at ? ` · last synced ${fmtWhen(google.last_synced_at)}` : " · not synced yet"} · ${count ?? 0} event${count === 1 ? "" : "s"} added`)}
            {googleBroken && (
              <p className={errorCls}>
                Google stopped accepting the console&apos;s access (it was removed, or it expired).{" "}
                {calendarOn ? (
                  <a href="/integrations/google/start" className="underline">
                    Reconnect Google Calendar
                  </a>
                ) : (
                  "Reconnect once Google Calendar is turned back on."
                )}
              </p>
            )}
            {google.last_error === "sync_failed" && <p className={errorCls}>The last sync didn&apos;t finish. Try Sync now.</p>}
            {!calendarOn && <p className={mutedCls}>Google Calendar is switched off, so nothing syncs until it&apos;s back on.</p>}
            {calendarOn && (
              <>
                <ActionForm action={setKeyDatesAction} submitLabel={keyDates ? "Stop adding key dates" : "Add key dates for my deals"} secondary={keyDates}>
                  <p className="font-body text-body-sm text-ink">{keyDates ? "Key dates of your deals are added." : "Only your approved appointments are added."}</p>
                  <input type="hidden" name="key_dates" value={keyDates ? "false" : "true"} />
                </ActionForm>
                <ActionForm action={syncNowAction} submitLabel="Sync now" pendingLabel="Syncing…" secondary />
              </>
            )}
          </div>
        )}

        {(imports.drive || hasDrive) && (
          <>
            <h3 className="mt-8 font-body text-body-md font-medium text-ink">Google Drive import</h3>
            <p className={`${mutedCls} mt-1 mb-4`}>
              Import files into a deal&apos;s Documents or Receipts with Google&apos;s file picker. The console can open only the files you pick there; it never sees the rest of your Drive.
            </p>
            {hasDrive && google ? (
              <>
                {status(googleBroken, google.account_email, " · Drive imports allowed")}
                {googleBroken && imports.drive && (
                  <p className={`${errorCls} mt-2`}>
                    <a href="/integrations/google/start?for=drive" className="underline">
                      Reconnect Google Drive
                    </a>
                  </p>
                )}
              </>
            ) : (
              <a href="/integrations/google/start?for=drive" className={`${google ? btnSecondary : btnPrimary} inline-flex items-center`}>
                Allow Google Drive imports
              </a>
            )}
          </>
        )}

        {google && (
          <ActionForm action={disconnectGoogleAction} submitLabel="Disconnect Google account" pendingLabel="Disconnecting…" secondary className="mt-6 space-y-4">
            {confirm(`Remove the console's access to my Google account${hasCalendar ? " and the calendar events it added" : ""}.${hasDrive ? " Files already imported stay on their deals." : ""}`)}
          </ActionForm>
        )}

        {(imports.dropbox || dropbox) && (
          <>
            <h3 className="mt-8 font-body text-body-md font-medium text-ink">Dropbox import</h3>
            <p className={`${mutedCls} mt-1 mb-4`}>
              Put files in your Dropbox&apos;s Apps/Vabrato folder, then import them into a deal&apos;s Documents or Receipts. The console can only read that folder; it never changes or moves
              anything.
            </p>
            {dropbox ? (
              <div className="space-y-4">
                {status(dropbox.last_error === "reconnect", dropbox.account_email)}
                {dropbox.last_error === "reconnect" && imports.dropbox && (
                  <p className={errorCls}>
                    Dropbox stopped accepting the console&apos;s access.{" "}
                    <a href="/integrations/dropbox/start" className="underline">
                      Reconnect Dropbox
                    </a>
                  </p>
                )}
                <ActionForm action={disconnectDropboxAction} submitLabel="Disconnect Dropbox" pendingLabel="Disconnecting…" secondary>
                  {confirm("Remove the console's access to my Dropbox. Files already imported stay on their deals.")}
                </ActionForm>
              </div>
            ) : (
              <a href="/integrations/dropbox/start" className={`${btnPrimary} inline-flex items-center`}>
                Connect Dropbox
              </a>
            )}
          </>
        )}
      </Panel>

      {isAdmin && (
        <Panel title="Integration switches">
          {[
            { key: CALENDAR_FLAG, name: "Google Calendar", on: flag(CALENDAR_FLAG), missing: setup.ok ? [] : setup.missing },
            { key: DRIVE_FLAG, name: "Google Drive import", on: flag(DRIVE_FLAG), missing: imports.driveMissing },
            { key: DROPBOX_FLAG, name: "Dropbox import", on: flag(DROPBOX_FLAG), missing: imports.dropboxMissing },
          ].map((sw) => (
            <div key={sw.key} className="border-b border-line py-4 first:pt-0 last:border-b-0">
              <h3 className="font-body text-body-md font-medium text-ink">{sw.name}</h3>
              <p role="status" className="mt-1 mb-2 font-body text-body-sm text-ink">
                {sw.on ? "On." : "Off."}
              </p>
              {sw.missing.length > 0 && <p className={`${mutedCls} mb-3`}>Not set up: the console&apos;s environment needs {sw.missing.join(", ")}. See STATUS, &ldquo;Needs you&rdquo;.</p>}
              <ActionForm action={setIntegrationSwitchAction} submitLabel={sw.on ? `Turn ${sw.name} off` : `Turn ${sw.name} on`} secondary={sw.on}>
                <input type="hidden" name="key" value={sw.key} />
                <input type="hidden" name="on" value={sw.on ? "false" : "true"} />
              </ActionForm>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}
