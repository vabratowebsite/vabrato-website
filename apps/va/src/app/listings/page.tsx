import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { MlsAttribution } from "@/components/mls-attribution";
import { mutedCls } from "@/components/ui";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtWhen } from "@/lib/today";

// Our listings: Vabrato's own listings (office filter from MLS_OFFICE_ID in
// the sync). IDX fields for every staff member. FULL fields (private remarks,
// showing instructions) only for agents verified at sign-in (ACC-1) and only
// while full_data_enabled is on: the database decides (has_full_mls_access).
// FULL data never leaves the console (MLS-7).
export const dynamic = "force-dynamic";

const SITE = (process.env.PUBLIC_SITE_URL ?? "https://vabrato.com").replace(/\/+$/, "");
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default async function OurListings() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const [{ data: listings }, { data: full }, { data: lastUpdated }] = await Promise.all([
    supabase
      .from("mls_listings")
      .select("listing_key, standard_status, list_price, city, bedrooms_total, bathrooms_total, living_area, modification_ts, address_display, data, mls_open_houses(start_time)")
      .eq("is_own_listing", true)
      .order("modification_ts", { ascending: false })
      .limit(100),
    supabase.rpc("has_full_mls_access"),
    supabase.rpc("mls_last_updated"),
  ]);
  const keys = (listings ?? []).map((l) => l.listing_key);
  const { data: fullRows } = full && keys.length ? await supabase.from("mls_listing_full").select("listing_key, data").in("listing_key", keys) : { data: [] };
  const fullBy = new Map((fullRows ?? []).map((r) => [r.listing_key, (r.data ?? {}) as Record<string, unknown>]));

  return (
    <ConsoleShell profile={profile} current="listings" title="Our listings" topRight={<Pill tone={full ? "green" : "outline"}>{full ? "FULL data: verified" : "IDX data"}</Pill>}>
      {!full && (
        <p className={mutedCls}>
          You&apos;re seeing public (IDX) fields. Private remarks and showing instructions appear here for agents verified as active MLSListings members of our office, once FULL access is turned on.
        </p>
      )}
      <Panel title={`${listings?.length ?? 0} listing${listings?.length === 1 ? "" : "s"}`}>
        {listings?.length ? (
          <ul className="divide-y divide-line">
            {listings.map((l) => {
              const d = (l.data ?? {}) as Record<string, unknown>;
              const address = typeof d.UnparsedAddress === "string" ? d.UnparsedAddress : (l.city ?? l.listing_key);
              const f = fullBy.get(l.listing_key);
              const next = (l.mls_open_houses as { start_time: string | null }[] | null)?.map((o) => o.start_time).filter((s): s is string => Boolean(s) && Date.parse(s!) > Date.now()).sort()[0];
              return (
                <li key={l.listing_key} className="py-4 font-body text-body-sm text-ink">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <a href={`${SITE}/listing/${l.listing_key}/x`} className="font-medium text-navy underline">
                      {address}
                    </a>
                    <span className="flex flex-wrap gap-2">
                      <Pill tone={l.standard_status === "Active" ? "green" : "neutral"}>{l.standard_status ?? "Unknown"}</Pill>
                      {!l.address_display && <Pill tone="outline">Address hidden publicly</Pill>}
                    </span>
                  </div>
                  <p className="mt-1 text-muted">
                    {l.listing_key} · {l.list_price != null ? usd.format(Number(l.list_price)) : "No price"} · {l.bedrooms_total ?? "?"} bd · {l.bathrooms_total ?? "?"} ba
                    {l.living_area ? ` · ${Number(l.living_area).toLocaleString("en-US")} sq ft` : ""} · updated {fmtWhen(l.modification_ts)}
                    {next ? ` · next open house ${fmtWhen(next)}` : ""}
                  </p>
                  {f && (
                    <dl className="mt-2 grid gap-2 border-l-2 border-navy pl-3 sm:grid-cols-2">
                      {typeof f.PrivateRemarks === "string" && (
                        <div>
                          <dt className="text-label uppercase tracking-label text-muted">Private remarks (FULL)</dt>
                          <dd className="whitespace-pre-wrap break-words">{f.PrivateRemarks}</dd>
                        </div>
                      )}
                      {typeof f.ShowingInstructions === "string" && (
                        <div>
                          <dt className="text-label uppercase tracking-label text-muted">Showing instructions (FULL)</dt>
                          <dd className="whitespace-pre-wrap break-words">{f.ShowingInstructions}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={mutedCls}>No listings of ours in the feed yet.</p>
        )}
      </Panel>
      <MlsAttribution lastUpdated={(lastUpdated as string | null) ?? null} />
    </ConsoleShell>
  );
}
