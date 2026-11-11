import { notFound } from "next/navigation";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { MlsAttribution } from "@/components/mls-attribution";
import { PrintButton } from "@/components/print-button";
import { mutedCls } from "@/components/ui";
import type { CmaSubject } from "@/lib/cma";
import { deleteCmaAction } from "@/lib/cma-actions";
import { requireSignIn } from "@/lib/staff";
import { cmaRange, fmtMoney, missingComps } from "@/lib/stats";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// A saved CMA, rebuilt from the feed by listing key (nothing from the MLS is
// stored with it). Printable. Comparables that left the feed are listed as
// missing. The range is a comparison of recent sales, not an appraisal.
export const dynamic = "force-dynamic";

// Print: just the CMA, no console frame.
const PRINT_CSS = `@media print {
  aside, a[href="#main"], [data-no-print], header [aria-haspopup], header button { display: none !important; }
  body, main { background: #fff !important; }
}`;

export default async function CmaPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: cma } = await supabase.from("cmas").select("id, title, subject, comp_keys, created_by, updated_at").eq("id", id).maybeSingle();
  if (!cma) notFound();
  const subject = cma.subject as unknown as CmaSubject;
  const [{ data: comps }, { data: city }, { data: lastUpdated }] = await Promise.all([
    cma.comp_keys.length ? supabase.rpc("cma_comps", { p_keys: cma.comp_keys }) : Promise.resolve({ data: [] as never[] }),
    supabase.from("cities").select("name").eq("slug", subject.city_slug).maybeSingle(),
    supabase.rpc("mls_last_updated"),
  ]);
  const found = comps ?? [];
  const missing = missingComps(cma.comp_keys, found);
  const range = cmaRange(found, subject.sqft ?? null);
  const describe = [
    city?.name,
    subject.sub_type,
    subject.beds != null ? `${subject.beds} bd` : null,
    subject.baths != null ? `${subject.baths} ba` : null,
    subject.sqft != null ? `${subject.sqft.toLocaleString("en-US")} sq ft` : null,
  ].filter(Boolean);

  return (
    <ConsoleShell profile={profile} current="cmas" eyebrow="Comparative market analysis" title={cma.title} topRight={<PrintButton />}>
      <style>{PRINT_CSS}</style>
      <p className="font-body text-body-sm text-ink">
        {describe.join(" · ") || "Subject details not given"}
        <span className="block text-caption text-muted">Prepared by Vabrato Real Estate Services · updated {fmtWhen(cma.updated_at)}</span>
      </p>

      <Panel title="Suggested price range">
        {range ? (
          <div className="space-y-2 font-body text-body text-ink">
            <p className="font-subhead text-subhead-lg">
              {fmtMoney(range.low)} – {fmtMoney(range.high)}
            </p>
            <p className="text-body-sm">
              Midpoint {fmtMoney(range.mid)}: the subject&apos;s size × the middle half of the comparables&apos; price per square foot (median {fmtMoney(range.medianPpsf)}/sq ft, from {range.comps} sales).
            </p>
          </div>
        ) : (
          <p className={mutedCls}>No range: it needs the subject&apos;s size and at least 3 comparables with a known size.</p>
        )}
        <p className="mt-4 border-l-4 border-gold bg-gold-50 p-3 font-body text-body-sm text-ink">
          This is a comparison of recent sales prepared by a real estate broker. It is not an appraisal and should not be relied on as one.
        </p>
      </Panel>

      <Panel title={`Comparable sales (${found.length})`}>
        {found.length ? (
          <div className="overflow-x-auto" role="region" aria-label="Comparable sales" tabIndex={0}>
            <table className="w-full min-w-[720px] font-body text-body-sm text-ink">
              <thead>
                <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Address</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Sold</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Bd / Ba</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Sq ft</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">$/sq ft</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Days</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Listing broker</th>
                </tr>
              </thead>
              <tbody>
                {found.map((c) => (
                  <tr key={c.listing_key} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {c.street ?? "Address withheld"}
                      <span className="block text-caption font-normal text-muted">{c.city}</span>
                    </th>
                    <td className="py-2 pr-3 text-right">{fmtMoney(c.close_price)}</td>
                    <td className="py-2 pr-3">{c.close_date}</td>
                    <td className="py-2 pr-3 text-right">
                      {c.bedrooms_total ?? "?"} / {c.bathrooms_total ?? "?"}
                    </td>
                    <td className="py-2 pr-3 text-right">{c.living_area ? Number(c.living_area).toLocaleString("en-US") : "—"}</td>
                    <td className="py-2 pr-3 text-right">{fmtMoney(c.price_per_sqft)}</td>
                    <td className="py-2 pr-3 text-right">{c.days_on_market ?? "—"}</td>
                    <td className="py-2 pr-3">{c.is_own_listing ? "Vabrato" : (c.list_office_name ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={mutedCls}>None of the chosen sales are in the feed now.</p>
        )}
        {missing.length > 0 && (
          <p className="mt-3 font-body text-body-sm text-ink">
            No longer available from the MLS feed ({missing.length}): {missing.join(", ")}. They&apos;re left out of the range.
          </p>
        )}
      </Panel>

      {subject.notes && (
        <Panel title="Notes">
          <p className="whitespace-pre-line font-body text-body-sm text-ink">{subject.notes}</p>
        </Panel>
      )}

      <MlsAttribution lastUpdated={(lastUpdated as string | null) ?? null} />

      {cma.created_by === profile.id && (
        <div data-no-print>
          <ActionForm action={deleteCmaAction.bind(null, cma.id)} submitLabel="Delete CMA" pendingLabel="Deleting…" secondary />
        </div>
      )}
    </ConsoleShell>
  );
}
