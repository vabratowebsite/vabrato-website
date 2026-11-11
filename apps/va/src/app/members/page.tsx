import Link from "next/link";
import { Panel, Pill, cx, focusLight } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { inputCls, labelCls, mutedCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Members (G5): clients with portal accounts. RLS (can_see_member): admins see
// everyone; an agent sees members assigned to them and clients on their deals.
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { buyer: "Buying", seller: "Selling", both: "Buying and selling" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 80);
  const supabase = await supabaseServer();

  let query = supabase.from("profiles").select("id, full_name, email, role, agent_id, created_at, onboarded_at, buyer_agreement_on_file_at").in("role", ["buyer", "seller", "both"]).order("created_at", { ascending: false }).limit(200);
  if (q) {
    const safe = q.replace(/[%_,()]/g, " ");
    query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  const [{ data: members }, { data: pending }] = await Promise.all([query, supabase.from("account_deletion_requests").select("id", { count: "exact" }).eq("status", "pending")]);
  const ids = (members ?? []).map((m) => m.id);
  const agentIds = [...new Set((members ?? []).map((m) => m.agent_id).filter((x): x is string => Boolean(x)))];
  const [saved, searches, tracked, agents] = ids.length
    ? await Promise.all([
        supabase.from("saved_homes").select("profile_id").in("profile_id", ids),
        supabase.from("saved_searches").select("profile_id").in("profile_id", ids),
        supabase.from("tracked_properties").select("buyer_id").in("buyer_id", ids),
        agentIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", agentIds) : Promise.resolve({ data: [] as { id: string; full_name: string; email: string }[] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const tally = (rows: { [k: string]: string }[] | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return m;
  };
  const savedN = tally(saved.data as { profile_id: string }[], "profile_id");
  const searchN = tally(searches.data as { profile_id: string }[], "profile_id");
  const trackedN = tally(tracked.data as { buyer_id: string }[], "buyer_id");
  const agentName = new Map((agents.data ?? []).map((a) => [a.id, a.full_name || a.email]));

  return (
    <ConsoleShell profile={profile} current="members" title="Members">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" action="/members" className="flex flex-wrap items-end gap-3">
          <label className={labelCls}>
            Find a member
            <input name="q" defaultValue={q} placeholder="Name or email" className={`${inputCls} mt-1 w-72 max-w-full`} />
          </label>
          <button type="submit" className={cx("min-h-[44px] border border-navy bg-white px-4 font-body text-body-sm text-navy", focusLight)}>
            Search
          </button>
        </form>
        {pending && pending.length > 0 && (
          <Link href="/members/deletions" className="font-body text-body-sm text-navy underline">
            {pending.length} account deletion request{pending.length === 1 ? "" : "s"} waiting
          </Link>
        )}
      </div>

      <Panel title={`${members?.length ?? 0} member${members?.length === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`}>
        {members?.length ? (
          <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Members table">
            <table className="w-full min-w-[720px] font-body text-body-sm text-ink">
              <thead>
                <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Member</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Portal</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Agent</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Saved</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Searches</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Pursuing</th>
                  <th scope="col" className="py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-4">
                      <Link href={`/members/${m.id}`} className={cx("font-medium text-navy underline", focusLight)}>
                        {m.full_name || m.email}
                      </Link>
                      <span className="block break-all text-caption text-muted">{m.email}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="flex flex-wrap gap-1">
                        <Pill tone="neutral">{ROLE_LABEL[m.role] ?? m.role}</Pill>
                        {!m.onboarded_at && <Pill tone="outline">Not set up</Pill>}
                        {m.buyer_agreement_on_file_at && <Pill tone="green">Agreement</Pill>}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{m.agent_id ? (m.agent_id === profile.id ? "You" : (agentName.get(m.agent_id) ?? "Staff")) : "None"}</td>
                    <td className="py-2 pr-4 text-right">{savedN.get(m.id) ?? 0}</td>
                    <td className="py-2 pr-4 text-right">{searchN.get(m.id) ?? 0}</td>
                    <td className="py-2 pr-4 text-right">{trackedN.get(m.id) ?? 0}</td>
                    <td className="py-2">{fmtWhen(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={mutedCls}>{q ? "No members match that search." : "No members you can see yet. Admins see everyone; agents see members assigned to them and clients on their deals."}</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
