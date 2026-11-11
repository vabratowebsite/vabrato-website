import Link from "next/link";
import { Panel, Pill, cx, focusLight } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { mutedCls } from "@/components/ui";
import { LEAD_KINDS, STATUS_LABEL, filterHref, parseLeadFilters, type LeadFilters } from "@/lib/leads";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen, leadKindLabel, shortName } from "@/lib/today";

// Leads inbox (SPEC <lead_routing>). RLS decides the rows: the acting lead
// admin (Mark, or Viv while Mark is away) sees every lead; everyone else
// sees leads assigned to them. Contact details only on the lead page.
export const dynamic = "force-dynamic";

const VIEW_LABEL: Record<LeadFilters["view"], string> = { new: "New", mine: "Assigned to me", all: "All open", closed: "Closed" };

export default async function LeadsInbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const f = parseLeadFilters(await searchParams);
  const supabase = await supabaseServer();

  let q = supabase.from("leads").select("id, kind, name, email, site, status, created_at, assigned_to, first_reply_at, escalated_at").order("created_at", { ascending: false }).limit(100);
  if (f.view === "new") q = q.eq("status", "new");
  if (f.view === "mine") q = q.eq("assigned_to", profile.id).neq("status", "closed");
  if (f.view === "all") q = q.neq("status", "closed");
  if (f.view === "closed") q = q.eq("status", "closed");
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.site) q = q.eq("site", f.site);
  const [{ data: leads }, { data: acting }] = await Promise.all([q, supabase.rpc("is_acting_lead_admin")]);
  const ownerIds = [...new Set((leads ?? []).map((l) => l.assigned_to).filter((x): x is string => Boolean(x)))];
  const { data: owners } = ownerIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ownerIds) : { data: [] };
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.full_name || o.email]));

  const chip = (active: boolean) => cx("inline-flex min-h-[44px] items-center border px-4 font-body text-body-sm", active ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy", focusLight);

  return (
    <ConsoleShell profile={profile} current="leads" title="Leads">
      <p className={mutedCls}>
        {acting ? "You see every lead (lead admin)." : "You see leads assigned to you. Mark, or Viv while he's away, sees and routes all leads."}
      </p>

      <nav aria-label="Lead views" className="flex flex-wrap gap-2">
        {(Object.keys(VIEW_LABEL) as LeadFilters["view"][]).map((v) => (
          <Link key={v} href={filterHref(f, { view: v })} aria-current={f.view === v ? "page" : undefined} className={chip(f.view === v)}>
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </nav>

      <form method="get" action="/leads" className="flex flex-wrap items-end gap-3 font-body text-body-sm">
        {f.view !== "new" && <input type="hidden" name="view" value={f.view} />}
        <label className="block font-medium text-ink">
          Kind
          <select name="kind" defaultValue={f.kind ?? ""} className="mt-1 block min-h-[44px] border border-muted bg-white px-3">
            <option value="">All kinds</option>
            {LEAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {leadKindLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="block font-medium text-ink">
          Site
          <select name="site" defaultValue={f.site ?? ""} className="mt-1 block min-h-[44px] border border-muted bg-white px-3">
            <option value="">Both sites</option>
            <option value="vabrato">vabrato.com</option>
            <option value="sancarloslife">homes.sancarloslife.com</option>
          </select>
        </label>
        <button type="submit" className={cx("min-h-[44px] border border-navy bg-white px-4 text-navy", focusLight)}>
          Filter
        </button>
      </form>

      <Panel title={`${VIEW_LABEL[f.view]} (${leads?.length ?? 0}${leads?.length === 100 ? "+" : ""})`}>
        {leads?.length ? (
          <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Leads table">
            <table className="w-full min-w-[640px] font-body text-body-sm text-ink">
              <thead>
                <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Lead</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Site</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Owner</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Received</th>
                  <th scope="col" className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-4">
                      <Link href={`/leads/${l.id}`} className={cx("font-medium text-navy underline", focusLight)}>
                        {shortName(l.name, l.email)}
                      </Link>
                      <span className="block text-caption text-muted">{leadKindLabel(l.kind)}</span>
                    </td>
                    <td className="py-2 pr-4">{l.site === "sancarloslife" ? "homes.sancarloslife.com" : "vabrato.com"}</td>
                    <td className="py-2 pr-4">{l.assigned_to ? (l.assigned_to === profile.id ? "You" : (ownerName.get(l.assigned_to) ?? "Staff")) : "Unassigned"}</td>
                    <td className="py-2 pr-4">{fmtWhen(l.created_at)}</td>
                    <td className="py-2">
                      <span className="flex flex-wrap gap-1">
                        <Pill tone={l.status === "new" ? "red" : l.status === "assigned" ? "gold" : "outline"}>{STATUS_LABEL[l.status] ?? l.status}</Pill>
                        {l.escalated_at && !l.first_reply_at && <Pill tone="outline">Escalated</Pill>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={mutedCls}>No leads here.</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
