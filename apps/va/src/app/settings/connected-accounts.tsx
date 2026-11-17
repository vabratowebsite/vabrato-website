import { Panel, Pill } from "@vabrato/ui/web";
import { DRIVE_SCOPE, googleSetup } from "@vabrato/lib/integrations";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, btnSecondary, errorCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { CONNECT_MESSAGES } from "@/lib/google-oauth";
import { DRIVE_FLAG, DROPBOX_FLAG, importSwitches } from "@/lib/imports";
import { disconnectDropboxAction, disconnectGoogleAction, disconnectTeamCalendarAction, setIntegrationSwitchAction, syncNowAction } from "@/lib/integration-actions";
import { supabaseServer } from "@/lib/supabase-server";
import { CALENDAR_FLAG, TEAM_CALENDAR_NAME } from "@/lib/team-calendar";
import { fmtWhen } from "@/lib/today";

// Settings → Connected accounts (Integrations PR 1 and 2; the team calendar
// since 0045): the team Google Calendar (everyone sees its state; an admin
// connects, syncs and disconnects it), each staff member's own Drive import
// and Dropbox, and for admins the switches. The console only touches the
// calendar it made, opens only Drive files the person picks, and only reads
// Dropbox's Apps/Vabrato.
export async function ConnectedAccounts({ isAdmin, notice }: { isAdmin: boolean; notice?: string }) {
  const supabase = await supabaseServer();
  const [{ data: conns }, { data: flags }, { data: teamRows }, imports] = await Promise.all([
    supabase.rpc("my_connections"),
    supabase.from("feature_flags").select("key, enabled").in("key", [CALENDAR_FLAG, DRIVE_FLAG, DROPBOX_FLAG]),
    supabase.rpc("team_calendar_status"),
    importSwitches(),
  ]);
  const flag = (key: string) => Boolean((flags ?? []).find((f) => f.key === key)?.enabled);
  const setup = googleSetup();
  const calendarOn = flag(CALENDAR_FLAG) && setup.ok;
  const google = (conns ?? []).find((c) => c.provider === "google");
  const dropbox = (conns ?? []).find((c) => c.provider === "dropbox");
  const hasDrive = Boolean(google?.scopes.includes(DRIVE_SCOPE));
  const googleBroken = google?.last_error === "reconnect";
  const team = teamRows?.[0];
  const teamConnected = Boolean(team?.connected);
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
      <input type="checkbox" name="confirm" value="yes" required className="mt-1 h-5 w-5 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
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

        <h3 className="font-body text-body-md font-medium text-ink">Team calendar</h3>
        <p className={`${mutedCls} mt-1 mb-4`}>
          One Google Calendar for the whole team, called &ldquo;{TEAM_CALENDAR_NAME}&rdquo;: every approved appointment and every deal&apos;s key dates (contingency removals, close of
          escrow, rent-back end), each with who it&apos;s for. An admin connects it once and shares it with the team in Google Calendar. The console only changes that calendar; it never
          reads anyone&apos;s other calendars and never invites anyone.
        </p>
        {!teamConnected && !calendarOn && <p className="font-body text-body-sm text-ink">Not set up yet.{isAdmin ? " See the switches below." : " An admin turns it on once it's ready."}</p>}
        {!teamConnected && calendarOn && !isAdmin && <p className="font-body text-body-sm text-ink">Not connected yet. An admin connects it here.</p>}
        {!teamConnected && calendarOn && isAdmin && (
          <div className="space-y-3">
            <p className={mutedCls}>
              Sign in with the Google account that should own the calendar. Until Google reviews the console, it shows a warning that the app isn&apos;t verified: choose Advanced, then
              continue.
            </p>
            <a href="/integrations/google/start?for=team" className={`${btnPrimary} inline-flex items-center`}>
              Connect the team calendar
            </a>
          </div>
        )}
        {teamConnected && team && (
          <div className="space-y-5">
            <p role="status" className="flex flex-wrap items-center gap-2 font-body text-body-sm text-ink">
              {team.last_error === "reconnect" ? <Pill tone="red">Needs reconnecting</Pill> : team.last_error === "calendar_gone" ? <Pill tone="red">Calendar missing</Pill> : <Pill tone="green">Connected</Pill>}
              <span className="min-w-0 [overflow-wrap:anywhere]">
                &ldquo;{team.calendar_name ?? TEAM_CALENDAR_NAME}&rdquo; in {team.account_email ?? "a Google account"}
                {team.connected_by_name ? `, connected by ${team.connected_by_name}` : ""} · {team.last_synced_at ? `last synced ${fmtWhen(team.last_synced_at)}` : "not synced yet"} ·{" "}
                {team.events} event{team.events === 1 ? "" : "s"}
              </span>
            </p>
            {team.last_error === "reconnect" && (
              <p className={errorCls}>
                Google stopped accepting the console&apos;s access (it was removed, or it expired).{" "}
                {isAdmin && calendarOn ? (
                  <a href="/integrations/google/start?for=team" className="underline">
                    Reconnect the team calendar
                  </a>
                ) : isAdmin ? (
                  "Reconnect once the team calendar is turned back on."
                ) : (
                  "An admin needs to reconnect it."
                )}
              </p>
            )}
            {team.last_error === "calendar_gone" && <p className={errorCls}>The calendar was deleted in Google and couldn&apos;t be made again. {isAdmin ? "Try Sync now, or reconnect." : "An admin can fix this."}</p>}
            {team.last_error === "sync_failed" && <p className={errorCls}>The last sync didn&apos;t finish. {isAdmin ? "Try Sync now." : "It tries again with the next change."}</p>}
            {!calendarOn && <p className={mutedCls}>The team calendar is switched off, so nothing syncs until it&apos;s back on.</p>}
            <details className="font-body text-body-sm text-ink">
              <summary className="min-h-[44px] cursor-pointer py-2 font-medium text-navy underline">How to share it with the team</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 [overflow-wrap:anywhere]">
                <li>On a computer, open Google Calendar signed in as {team.account_email ?? "the account that connected it"}.</li>
                <li>Open Settings, then choose &ldquo;{team.calendar_name ?? TEAM_CALENDAR_NAME}&rdquo; under &ldquo;Settings for my calendars&rdquo;.</li>
                <li>Under &ldquo;Share with specific people or groups&rdquo;, choose Add people and enter each team member&apos;s Google account email.</li>
                <li>Pick &ldquo;See all event details&rdquo;. Edits made in Google are replaced at the next sync, so change things in the console instead.</li>
              </ol>
              <p className={`${mutedCls} mt-2`}>Each person then finds it under &ldquo;Other calendars&rdquo; in their own Google Calendar.</p>
            </details>
            {isAdmin && calendarOn && <ActionForm action={syncNowAction} submitLabel="Sync now" pendingLabel="Syncing…" secondary />}
            {isAdmin && (
              <ActionForm action={disconnectTeamCalendarAction} submitLabel="Disconnect the team calendar" pendingLabel="Disconnecting…" secondary className="space-y-4">
                {confirm(`Stop updating the team calendar and remove the console's access to ${team.account_email ?? "that Google account"}. The “${team.calendar_name ?? TEAM_CALENDAR_NAME}” calendar and its events stay in Google Calendar.`)}
              </ActionForm>
            )}
          </div>
        )}

        {(imports.drive || google) && (
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
          <ActionForm action={disconnectGoogleAction} submitLabel="Disconnect Google Drive" pendingLabel="Disconnecting…" secondary className="mt-6 space-y-4">
            {confirm("Remove the console's access to my Google Drive. Files already imported stay on their deals.")}
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
            { key: CALENDAR_FLAG, name: "Team Google Calendar", on: flag(CALENDAR_FLAG), missing: setup.ok ? [] : setup.missing },
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
