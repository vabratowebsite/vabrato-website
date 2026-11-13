import Link from "next/link";
import { KpiTile, Panel, PanelAction, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { BriefingPanel } from "@/components/summary-panels";
import { mutedCls } from "@/components/ui";
import { aiFeaturesOn } from "@/lib/ai-flags";
import { loadMissing } from "@/lib/documents";
import { fmtDuration, medianDuration } from "@/lib/leads";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { feedRows, fmtWhen, leadKindLabel, shortName, type SyncHealth, type SyncRun } from "@/lib/today";

// Today (mockup 07): the console's home. KPIs, the newest leads, the MLS feed
// and what runs automatically. Leads and replies are what this person can
// see (RLS: all for the acting lead admin). With the assistant's daily
// briefing switched on, a briefing written on request from the same records.
export const dynamic = "force-dynamic";

const TONE = { green: "text-green", red: "text-red", ink: "text-ink" } as const;
// Label/value rows (MLS feed, Automations): label above value on phones,
// side by side from sm up, as before.
const rowCls = "flex flex-col gap-0.5 py-2 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-2";

export default async function Today() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const ai = await aiFeaturesOn(supabase, ["ai_staff_daily_briefing"]);
  const [newLeads, members, tours, replies, recent, health, runs, routing, away, mails] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", ["buyer", "seller", "both"]),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("kind", "tour").gte("created_at", since30),
    supabase.from("leads").select("created_at, first_reply_at").gte("created_at", since30).not("first_reply_at", "is", null).limit(500),
    supabase.from("leads").select("id, kind, name, email, site, status, created_at, assigned_to").order("created_at", { ascending: false }).limit(6),
    supabase.rpc("mls_sync_health"),
    supabase.from("mls_sync_runs").select("kind, status, finished_at, counts").order("started_at", { ascending: false }).limit(20),
    supabase.from("app_settings").select("lead_admin_id, backup_admin_id").maybeSingle(),
    supabase.rpc("lead_admin_away_now"),
    supabase.from("notifications").select("created_at, sent_at").eq("template_key", "staff_new_lead").gte("created_at", since30).limit(500),
  ]);
  const { data: activeDeals } = await supabase.from("deals").select("id, address, seller_type").eq("status", "active").order("ratification_date").limit(100);
  const missingDocs = await loadMissing(supabase, activeDeals ?? []);
  const medianReply = medianDuration((replies.data ?? []).map((r) => ({ start: r.created_at, end: r.first_reply_at })));
  const medianMail = medianDuration((mails.data ?? []).map((m) => ({ start: m.created_at, end: m.sent_at })));
  const routedTo = routing.data ? (away.data ? (routing.data.backup_admin_id ?? routing.data.lead_admin_id) : (routing.data.lead_admin_id ?? routing.data.backup_admin_id)) : null;
  const { data: routedPerson } = routedTo ? await supabase.from("profiles").select("full_name, email").eq("id", routedTo).maybeSingle() : { data: null };
  const feed = feedRows((health.data?.[0] ?? null) as SyncHealth | null, (runs.data ?? []) as SyncRun[]);
  const emailOn = Boolean(process.env.RESEND_API_KEY);

  return (
    <ConsoleShell profile={profile} current="today" title="Today">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile value={String(newLeads.count ?? 0)} label="New leads" />
        <KpiTile value={String(members.count ?? 0)} label="Members" />
        <KpiTile value={String(tours.count ?? 0)} label="Tour requests (30 days)" />
        <KpiTile value={medianReply === null ? "—" : fmtDuration(medianReply)} label="Median first reply (30 days)" />
      </div>

      {ai.ai_staff_daily_briefing && (
        <Panel title="Your briefing">
          <BriefingPanel />
        </Panel>
      )}

      {missingDocs.length > 0 && (
        <Panel title={`Missing documents (${missingDocs.length} ${missingDocs.length === 1 ? "sale" : "sales"})`}>
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {missingDocs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/deals/${d.id}/documents`} className="font-medium text-navy underline">
                  {d.address}
                </Link>
                <span className="text-muted">
                  {d.missing.length} of {d.total} missing: {d.missing.slice(0, 3).join(", ")}
                  {d.missing.length > 3 ? ", …" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* minmax(0, …) tracks: without them the leads table's min width (it
          scrolls inside its own region) widened the whole column, and the
          page scrolled sideways at phone width (WCAG 1.4.10 Reflow). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Newest leads">
          {recent.data?.length ? (
            <div className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Newest leads table">
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
                        <Link href={`/leads/${l.id}`} className="block font-medium text-navy underline">
                          {shortName(l.name, l.email)}
                        </Link>
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
          <p className={`${mutedCls} mt-4`}>
            {routedPerson ? (
              <>
                New leads go to <strong className="text-ink">{routedPerson.full_name || routedPerson.email}</strong>
                {away.data ? " (lead admin away)" : ""}.{" "}
              </>
            ) : (
              <>
                <strong className="text-red">Lead routing isn&apos;t set up.</strong> New leads stay unassigned until it is.{" "}
              </>
            )}
            <Link href="/leads" className="text-navy underline">
              All leads
            </Link>{" "}
            ·{" "}
            <Link href="/settings" className="text-navy underline">
              Routing settings
            </Link>
          </p>
        </Panel>

        <div className="space-y-6">
          <Panel title="MLS feed">
            <dl className="divide-y divide-line font-body text-body-sm">
              {feed.map((r) => (
                <div key={r.label} className={rowCls}>
                  <dt className="text-ink">{r.label}</dt>
                  <dd className={`font-medium ${TONE[r.tone]}`}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Automations" action={<PanelAction href="/open-houses">Open houses</PanelAction>}>
            <dl className="divide-y divide-line font-body text-body-sm">
              <Row label="Email sending" value={emailOn ? "On" : "Off: RESEND_API_KEY not set"} ok={emailOn} />
              <Row label="Your lead alert emails" value={medianMail === null ? "None sent yet" : `Median ${fmtDuration(medianMail)} to send`} />
              <Row label="Unanswered leads" value="Escalated to the backup after the set time" />
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
    <div className={rowCls}>
      <dt className="text-ink">{label}</dt>
      <dd className={ok === undefined ? "text-ink" : ok ? "font-medium text-green" : "font-medium text-red"}>{value}</dd>
    </div>
  );
}
