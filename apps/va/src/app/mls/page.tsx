import { KpiTile, Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { mutedCls } from "@/components/ui";
import { fmtDuration } from "@/lib/leads";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { feedRows, fmtWhen, type SyncHealth, type SyncRun } from "@/lib/today";

// MLS sync health (SPEC <mls_data>): last runs from the Render jobs, with
// counts and sanitized errors. While the feed is live, a failed or late sync
// alerts admins once per incident (0023). Runs start on Render; "run now"
// means triggering the job there.
export const dynamic = "force-dynamic";

const COUNT_KEYS = ["fetched", "upserted", "removed", "media", "openHouses", "members", "accessLocked"] as const;

export default async function MlsSyncPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const [health, runs, settings, incident] = await Promise.all([
    supabase.rpc("mls_sync_health"),
    supabase.from("mls_sync_runs").select("id, kind, status, started_at, finished_at, counts, error").order("started_at", { ascending: false }).limit(50),
    supabase.from("app_settings").select("mls_sync_live").maybeSingle(),
    supabase.from("sync_alert_state").select("incident_open, opened_at").maybeSingle(),
  ]);
  const h = (health.data?.[0] ?? null) as SyncHealth | null;
  const rows = feedRows(h, (runs.data ?? []) as SyncRun[]);
  const live = Boolean(settings.data?.mls_sync_live);
  const ok = runs.data?.filter((r) => r.status === "succeeded").length ?? 0;
  const failed = runs.data?.filter((r) => r.status === "failed").length ?? 0;

  return (
    <ConsoleShell profile={profile} current="mls" title="MLS sync" topRight={<Pill tone={live ? "green" : "outline"}>{live ? "Feed live" : "Feed not live yet"}</Pill>}>
      {!live && (
        <p role="note" className="border border-line bg-white px-4 py-3 font-body text-body-sm text-ink">
          The MLSListings feed isn&apos;t live yet (credentials pending), so sync alerts are off. An admin turns them on in Settings once the Render jobs run against the live feed.
        </p>
      )}
      {live && incident.data?.incident_open && (
        <p role="alert" className="border border-red/40 bg-red-50 px-4 py-3 font-body text-body-sm text-red">
          The sync has been failing or late since {fmtWhen(incident.data.opened_at)}. Admins were alerted. Check the latest error below and Render&apos;s logs.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile value={h?.last_success_at ? fmtWhen(h.last_success_at) : "Never"} label="Last success" />
        <KpiTile value={h?.stale === false ? "OK" : "Late"} label="Freshness (30 min target)" />
        <KpiTile value={String(ok)} label="Successful runs (last 50)" />
        <KpiTile value={String(failed)} label="Failed runs (last 50)" />
      </div>

      <Panel title="Health">
        <dl className="divide-y divide-line font-body text-body-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap justify-between gap-2 py-2">
              <dt className="text-ink">{r.label}</dt>
              <dd className={`font-medium ${r.tone === "red" ? "text-red" : r.tone === "green" ? "text-green" : "text-ink"}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Recent runs">
        {runs.data?.length ? (
          <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Recent sync runs table">
            <table className="w-full min-w-[720px] font-body text-body-sm text-ink">
              <thead>
                <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Started</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Kind</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Result</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Took</th>
                  <th scope="col" className="py-2 font-medium">Counts or error</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => {
                  const counts = (r.counts ?? {}) as Record<string, number>;
                  const summary = COUNT_KEYS.filter((k) => counts[k]).map((k) => `${k} ${counts[k]}`).join(" · ");
                  return (
                    <tr key={r.id} className="border-b border-line align-top last:border-b-0">
                      <td className="py-2 pr-4">{fmtWhen(r.started_at)}</td>
                      <td className="py-2 pr-4">{r.kind}</td>
                      <td className="py-2 pr-4">
                        <Pill tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "gold"}>{r.status}</Pill>
                      </td>
                      <td className="py-2 pr-4">{r.finished_at ? fmtDuration(Date.parse(r.finished_at) - Date.parse(r.started_at)) : "running"}</td>
                      <td className="max-w-md break-words py-2">{r.status === "failed" ? <span className="text-red">{r.error ?? "No error recorded"}</span> : summary || "No changes"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={mutedCls}>No runs recorded yet.</p>
        )}
      </Panel>

      <Panel title="Run a sync now">
        <p className={mutedCls}>Syncs run on Render (every 15 minutes, nightly reconcile). To run one now, open the job in Render and choose Trigger run, or run this from a Render shell:</p>
        <pre className="mt-3 whitespace-pre-wrap break-all border border-line bg-soft p-3 font-mono text-caption text-ink">pnpm --filter @vabrato/mls sync incremental</pre>
      </Panel>
    </ConsoleShell>
  );
}
