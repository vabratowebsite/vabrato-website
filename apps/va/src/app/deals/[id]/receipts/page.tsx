import { notFound } from "next/navigation";
import { fmtShort } from "@vabrato/lib";
import { KpiTile, Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { linkDanger, mutedCls } from "@/components/ui";
import { deleteReceiptAction } from "@/lib/actions";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { ReceiptForm } from "./receipt-form";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

export default async function DealReceiptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;

  const supabase = await supabaseServer();
  const { data: receipts } = await supabase.from("receipts").select("*").eq("deal_id", id).order("receipt_date", { ascending: false });
  const all = receipts ?? [];
  const reimburse = all.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="receipts">
      <div className="grid gap-6 lg:grid-cols-3">
        <KpiTile value={money(reimburse)} label={`Reimbursement total · ${all.length} receipt${all.length === 1 ? "" : "s"}`} />
        <div className="lg:col-span-2">
          <Panel title="Add a receipt">
            <ReceiptForm dealId={deal.id} />
          </Panel>
        </div>
      </div>

      <Panel title="Logged receipts">
        {all.length === 0 ? (
          <p className={mutedCls}>No receipts yet. Drive and Dropbox import come with the integrations work; log them here for now.</p>
        ) : (
          <div className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy" tabIndex={0} role="region" aria-label="Logged receipts table">
            <table className="w-full min-w-[560px] font-body text-body-sm text-ink">
              <thead>
                <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Vendor</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Category</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Source</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-4">{r.vendor}</td>
                    <td className="py-2 pr-4 text-muted">{fmtShort(r.receipt_date)}</td>
                    <td className="py-2 pr-4">{r.category}</td>
                    <td className="py-2 pr-4"><Pill tone="neutral">{r.source}</Pill></td>
                    <td className="py-2 pr-4 text-right">{money(Number(r.amount))}</td>
                    <td className="py-2 text-right">
                      <form action={deleteReceiptAction.bind(null, r.id, deal.id)}>
                        <button type="submit" className={linkDanger}>
                          Delete<span className="sr-only"> receipt from {r.vendor}</span>
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </DealShell>
  );
}
