import Link from "next/link";
import { Panel, Pill } from "@vabrato/ui/web";
import type { SellerWeeklyReportData } from "@vabrato/db";
import { weekLabel } from "@vabrato/lib";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { linkAction, mutedCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Seller weekly reports (S6 PR 5): last week's numbers for every active deal
// you can see that's linked to its MLS listing. Open one to review the email
// and send it to the sellers (once per deal per week).
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const { data: deals } = await supabase.from("deals").select("id, address, listing_key").eq("status", "active").order("created_at", { ascending: false }).limit(50);
  const linked = (deals ?? []).filter((d) => d.listing_key);
  const unlinked = (deals ?? []).filter((d) => !d.listing_key);
  const reports = await Promise.all(
    linked.map(async (d) => {
      const { data } = await supabase.rpc("seller_weekly_report_data", { p_deal: d.id });
      return data as unknown as SellerWeeklyReportData | null;
    }),
  );
  const rows = reports.filter((r): r is SellerWeeklyReportData => Boolean(r));
  const week = rows[0];

  return (
    <ConsoleShell profile={profile} current="reports" eyebrow="Reports" title="Seller weekly reports">
      <p className={mutedCls}>
        Each report shows the seller what their listing page did last week on our website: views, saves, tour requests and open-house sign-ins. You review it, then send it; each deal gets one report per week.
      </p>
      <Panel title={week ? `Week of ${weekLabel(week.week_start, week.week_end)}` : "Last week"}>
        {rows.length ? (
          <div className="overflow-x-auto" role="region" aria-label="Seller reports" tabIndex={0}>
            <table className="w-full min-w-[640px] font-body text-body-sm text-ink">
              <thead>
                <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Listing</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Views</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Saves</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Tours</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Sign-ins</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.deal_id} className="border-b border-line">
                    <th scope="row" className="py-2 pr-4 text-left font-medium">
                      <Link href={`/reports/${r.deal_id}`} className="text-navy underline">
                        {r.address}
                      </Link>
                      {r.sellers.length === 0 && <span className="block text-caption text-muted">No seller with portal access yet</span>}
                    </th>
                    <td className="py-2 pr-4 text-right">{r.week.views}</td>
                    <td className="py-2 pr-4 text-right">{r.week.saves}</td>
                    <td className="py-2 pr-4 text-right">{r.week.tour_requests}</td>
                    <td className="py-2 pr-4 text-right">{r.week.open_house_signins}</td>
                    <td className="py-2 pr-4">{r.sent ? <Pill tone="green">Sent {fmtWhen(r.sent.sent_at)}</Pill> : <Pill tone="gold">Not sent</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={mutedCls}>No active deal is linked to its MLS listing yet. Link one on its deal page to send weekly reports.</p>
        )}
      </Panel>
      {unlinked.length > 0 && (
        <Panel title="Not linked to a listing">
          <ul className="divide-y divide-line">
            {unlinked.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1 font-body text-body-sm text-ink">
                {d.address}
                <Link href={`/deals/${d.id}`} className={linkAction} aria-label={`Link ${d.address} to its listing`}>
                  Link listing
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </ConsoleShell>
  );
}
