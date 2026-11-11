import Link from "next/link";
import { KpiTile, Panel, PanelAction, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { mutedCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { feedRows, fmtWhen, leadKindLabel, shortName, type SyncHealth, type SyncRun } from "@/lib/today";

// Today (mockup 07): the console's home. KPIs, the newest leads, the MLS feed
// and what runs automatically. Lead routing, first-reply times and the full
// inbox arrive with S6 PR 2; until then leads are unassigned. No AI rows.
export const dynamic = "force-dynamic";

const TONE = { green: "text-green", red: "text-red", ink: "text-ink" } as const;

export default async function Today() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [newLeads, members, tours, openDeals, recent, health, runs] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["buyer", "seller", "both"]),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("kind", "tour").gte("created_at", since30),
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("leads").select("id, kind, name, email, site, status, created_at, assigned_to").order("created_at", { ascending: false }).limit(6),
    supabase.rpc("mls_sync_health"),
    supabase.from("mls_sync_runs").select("kind, status, finished_at, counts").order("started_at", { ascending: false }).limit(20),
  ]);
  const feed = feedRows((health.data?.[0] ?? null) as SyncHealth | null, (runs.data ?? []) as SyncRun[]);
  const emailOn = Boolean(process.env.RESEND_API_KEY);

  return (
    <ConsoleShell profile={profile} current="today" title="Today">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile value={String(newLeads.count ?? 0)} label="New leads" />
        <KpiTile value={String(members.count ?? 0)} label="Members" />
        <KpiTile value={String(tours.count ?? 0)} label="Tour requests (30 days)" />
        <KpiTile value={String(openDeals.count ?? 0)} label="Open deals" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Newest leads">
          {recent.data?.length ? (
            <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Newest leads table">
              <table className="w-full min-w-[480px] font-body text-body-sm text-ink">
                <thead>
                  <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Lead</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Source</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Received</th>
                    <th scope="col" className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-b-0">
                      <td className="py-2 pr-4">
                        <span className="block font-medium">{shortName(l.name, l.email)}</span>
                        <span className="text-caption text-muted">{leadKindLabel(l.kind)}</span>
                      </td>
                      <td className="py-2 pr-4">{l.site === "sancarloslife" ? "homes.sancarloslife.com" : "vabrato.com"}</td>
                      <td className="py-2 pr-4">{fmtWhen(l.created_at)}</td>
                      <td className="py-2">
                        <Pill tone={l.status === "new" ? "red" : l.status === "assigned" ? "gold" : "outline"}>{l.status === "new" ? "New" : l.status === "assigned" ? "Assigned" : "Closed"}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={mutedCls}>No leads yet. Requests from vabrato.com forms appear here.</p>
          )}
          <p className={`${mutedCls} mt-4`}>Routing to Mark (or Viv when he&apos;s away) and new-lead alerts arrive in the next console update.</p>
        </Panel>

        <div className="space-y-6">
          <Panel title="MLS feed">
            <dl className="divide-y divide-line font-body text-body-sm">
              {feed.map((r) => (
                <div key={r.label} className="flex flex-wrap justify-between gap-2 py-2">
                  <dt className="text-ink">{r.label}</dt>
                  <dd className={`font-medium ${TONE[r.tone]}`}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Automations" action={<PanelAction href="/open-houses">Open houses</PanelAction>}>
            <dl className="divide-y divide-line font-body text-body-sm">
              <Row label="Email sending" value={emailOn ? "On" : "Off: RESEND_API_KEY not set"} ok={emailOn} />
              <Row label="Seller timeline emails" value="Queued when a seller gets access" />
              <Row label="New-listing and price alerts" value="After each MLS sync" />
              <Row label="Open-house sign-in" value="Links per event" />
            </dl>
            <p className={`${mutedCls} mt-4`}>
              Clients message you from their portal; see <Link href="/messages" className="text-navy underline">Messages</Link>.
            </p>
          </Panel>
        </div>
      </div>
    </ConsoleShell>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 py-2">
      <dt className="text-ink">{label}</dt>
      <dd className={ok === undefined ? "text-ink" : ok ? "font-medium text-green" : "font-medium text-red"}>{value}</dd>
    </div>
  );
}
