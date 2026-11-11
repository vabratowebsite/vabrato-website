import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel, Pill } from "@vabrato/ui/web";
import type { SellerWeeklyReportData } from "@vabrato/db";
import { finishedWeeks, renderNotification, weekLabel, weeklyReportMergeFields } from "@vabrato/lib";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { btnSecondary, inputCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { ptDay } from "@/lib/featured";
import { sendWeeklyReportAction } from "@/lib/report-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// One deal's weekly report: the exact email the sellers will get (static
// template, same merge fields the database sends), then Send.
export const dynamic = "force-dynamic";

export default async function ReportPreview({ params, searchParams }: { params: Promise<{ dealId: string }>; searchParams: Promise<{ week?: string; done?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { dealId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(dealId)) notFound();
  const sp = await searchParams;
  const weeks = finishedWeeks(ptDay(new Date().toISOString()), 8);
  const week = sp.week && weeks.includes(sp.week) ? sp.week : weeks[0]!;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("seller_weekly_report_data", { p_deal: dealId, p_week_start: week });
  if (error || !data) notFound();
  const r = data as unknown as SellerWeeklyReportData;
  const first = r.sellers[0]?.first_name ?? null;
  const email = renderNotification("seller_weekly_report", weeklyReportMergeFields(r, first), { siteUrl: process.env.PUBLIC_SITE_URL ?? "https://vabrato.com" });

  return (
    <ConsoleShell profile={profile} current="reports" eyebrow="Seller weekly report" title={r.address}>
      {sp.done === "sent" && r.sent && (
        <p role="status" className={okCls}>
          Sent to {r.sent.recipients} seller{r.sent.recipients === 1 ? "" : "s"}.
        </p>
      )}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="week" className={labelCls}>
            Week
          </label>
          <select id="week" name="week" defaultValue={week} className={`${inputCls} mt-1`}>
            {weeks.map((w) => {
              const end = new Date(Date.parse(`${w}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
              return (
                <option key={w} value={w}>
                  {weekLabel(w, end)}
                </option>
              );
            })}
          </select>
        </div>
        <button type="submit" className={btnSecondary}>
          Show week
        </button>
      </form>

      <Panel title="Email preview">
        {!r.linked ? (
          <p className="font-body text-body-sm text-ink">
            This deal isn&apos;t linked to its MLS listing.{" "}
            <Link href={`/deals/${r.deal_id}`} className="text-navy underline">
              Link it on the deal page
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            <p className="font-body text-body-sm text-ink">
              <span className="font-medium">To:</span> {r.sellers.length ? r.sellers.map((s) => s.first_name ?? "Seller").join(", ") : "nobody yet (no seller with portal access)"}
            </p>
            <p className="font-body text-body-sm text-ink">
              <span className="font-medium">Subject:</span> {email.subject}
            </p>
            <pre className="whitespace-pre-wrap break-words border border-line bg-white p-4 font-body text-body-sm text-ink">{email.body}</pre>
            {r.sellers.length > 1 && <p className={mutedCls}>Each seller gets their own copy with their first name.</p>}
          </div>
        )}
      </Panel>

      <Panel title="Send">
        {r.sent ? (
          <p className="flex flex-wrap items-center gap-2 font-body text-body-sm text-ink">
            <Pill tone="green">Sent</Pill> {fmtWhen(r.sent.sent_at)} to {r.sent.recipients} seller{r.sent.recipients === 1 ? "" : "s"}. Each week&apos;s report is sent once.
          </p>
        ) : r.linked && r.sellers.length ? (
          <ActionForm action={sendWeeklyReportAction.bind(null, r.deal_id, r.week_start)} submitLabel="Send to sellers" pendingLabel="Sending…" className="space-y-3">
            <p className={mutedCls}>The sellers get this email within a minute. It can&apos;t be unsent, and this week can&apos;t be sent again.</p>
          </ActionForm>
        ) : (
          <p className={mutedCls}>{r.linked ? "Invite a seller to the portal from the deal page first." : "Link the listing first."}</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
