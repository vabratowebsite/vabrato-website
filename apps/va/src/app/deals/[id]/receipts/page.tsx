import { notFound } from "next/navigation";
import { fmtShort } from "@vabrato/lib";
import { Panel, T } from "@vabrato/ui";
import { AccessDenied } from "@/components/access-denied";
import { DealShell } from "@/components/deal-shell";
import { deleteReceiptAction } from "@/lib/actions";
import { getDealWithProgress } from "@/lib/queries";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { ReceiptForm } from "./receipt-form";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Number(n).toLocaleString("en-US")}`;

export default async function DealReceiptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;

  const result = await getDealWithProgress(id);
  if (!result) notFound();
  const { deal, done, total } = result;

  const supabase = await supabaseServer();
  const { data: receipts } = await supabase
    .from("receipts")
    .select("*")
    .eq("deal_id", id)
    .order("receipt_date", { ascending: false });

  const all = receipts ?? [];
  const reimburse = all.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <DealShell profile={profile} deal={deal} done={done} total={total} active="receipts">
      <div className="grid gap-4 sm:grid-cols-3">
        <div
          className="flex flex-col justify-between rounded-2xl p-5"
          style={{ background: T.ink }}
        >
          <div className="text-xs" style={{ color: "#8f887b" }}>
            Total reimbursement demand
          </div>
          <div className="mt-2 font-serif text-3xl" style={{ color: T.gold }}>
            {money(reimburse)}
          </div>
          <div className="mt-1 text-xs" style={{ color: "#8f887b" }}>
            {all.length} receipt{all.length === 1 ? "" : "s"} logged
          </div>
        </div>
        <div className="sm:col-span-2">
          <Panel title="Add a receipt">
            <ReceiptForm dealId={deal.id} />
          </Panel>
        </div>
      </div>

      <Panel title="Logged receipts">
        {all.length === 0 ? (
          <p className="text-sm" style={{ color: T.muted }}>
            No receipts yet. Drive/Dropbox auto-import comes with the integrations phase — for
            now, log them manually above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: T.faint }}>
                  <th className="pb-2 font-medium">Vendor</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {all.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: T.lineSoft }}>
                    <td className="py-2.5">{r.vendor}</td>
                    <td className="py-2.5 text-xs" style={{ color: T.muted }}>
                      {fmtShort(r.receipt_date)}
                    </td>
                    <td className="py-2.5">{r.category}</td>
                    <td className="py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: T.lineSoft, color: T.muted }}
                      >
                        {r.source}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">{money(Number(r.amount))}</td>
                    <td className="py-2.5 text-right">
                      <form action={deleteReceiptAction.bind(null, r.id, deal.id)}>
                        <button className="text-xs" style={{ color: T.red }}>
                          Delete
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
