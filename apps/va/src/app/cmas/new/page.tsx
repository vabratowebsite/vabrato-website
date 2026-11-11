import Link from "next/link";
import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { MlsAttribution } from "@/components/mls-attribution";
import { btnSecondary, inputCls, labelCls, mutedCls } from "@/components/ui";
import { SUB_TYPES, compSearchArgs, parseCmaSubject, type CmaSubject } from "@/lib/cma";
import { createCmaAction } from "@/lib/cma-actions";
import { requireSignIn } from "@/lib/staff";
import { fmtMoney } from "@/lib/stats";
import { supabaseServer } from "@/lib/supabase-server";

// New CMA: describe the subject and search recent sales (GET), then choose up
// to 12 comparables and save (keys only).
export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function NewCma({ searchParams }: { searchParams: Promise<SP> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: flag }, { data: verified }, { data: cities }, { data: lastUpdated }] = await Promise.all([
    supabase.from("feature_flags").select("enabled").eq("key", "cma_enabled").maybeSingle(),
    supabase.rpc("has_verified_mls_access"),
    supabase.from("cities").select("slug, name").order("name"),
    supabase.rpc("mls_last_updated"),
  ]);
  if (!flag?.enabled || !verified) {
    return (
      <ConsoleShell profile={profile} current="cmas" eyebrow="CMAs" title="New CMA">
        <p className="font-body text-body-sm text-ink">
          CMAs aren&apos;t available to you right now.{" "}
          <Link href="/cmas" className="text-navy underline">
            See why
          </Link>
          .
        </p>
      </ConsoleShell>
    );
  }

  const searched = Boolean(sp.city);
  const parsed = searched ? parseCmaSubject({ get: (k: string) => sp[k] ?? null }) : null;
  const subject: CmaSubject | null = parsed?.ok ? parsed.subject : null;
  const { data: comps } = subject ? await supabase.rpc("cma_comps", compSearchArgs(subject)) : { data: null };
  const num = (name: string, label: string, hint?: string) => (
    <div>
      <label htmlFor={name} className={labelCls}>
        {label}
      </label>
      <input id={name} name={name} inputMode="numeric" defaultValue={sp[name] ?? ""} maxLength={5} aria-describedby={hint ? `${name}-hint` : undefined} className={`${inputCls} mt-1`} />
      {hint && (
        <p id={`${name}-hint`} className={`${mutedCls} mt-1`}>
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <ConsoleShell profile={profile} current="cmas" eyebrow="CMAs" title="New CMA">
      <Panel title="1. Subject and search">
        <form method="get" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="city" className={labelCls}>
                City <span className="text-muted">(required)</span>
              </label>
              <select id="city" name="city" required defaultValue={sp.city ?? ""} className={`${inputCls} mt-1`}>
                <option value="">Choose a city</option>
                {(cities ?? []).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sub_type" className={labelCls}>
                Property type
              </label>
              <select id="sub_type" name="sub_type" defaultValue={sp.sub_type ?? ""} className={`${inputCls} mt-1`}>
                <option value="">Any</option>
                {SUB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {num("beds", "Subject beds")}
            {num("baths", "Subject baths")}
            {num("sqft", "Subject size (sq ft)", "Used for the price range")}
            {num("min_sqft", "Comps from (sq ft)")}
            {num("max_sqft", "Comps to (sq ft)")}
            {num("min_beds", "Comps beds from")}
            {num("max_beds", "Comps beds to")}
            {num("min_baths", "Comps baths from")}
            {num("months", "Sold in the last (months)", "1 to 24; 6 if blank")}
          </div>
          <button type="submit" className={btnSecondary}>
            Find sales
          </button>
          {parsed && !parsed.ok && (
            <p role="alert" className="font-body text-body-sm font-medium text-red">
              {parsed.error}
            </p>
          )}
        </form>
      </Panel>

      {subject && (
        <Panel title={`2. Choose comparables (${comps?.length ?? 0} found)`}>
          {comps?.length ? (
            <ActionForm action={createCmaAction} submitLabel="Save CMA" pendingLabel="Saving…" className="space-y-4">
              {Object.entries({ city: subject.city_slug, sub_type: subject.sub_type, beds: subject.beds, baths: subject.baths, sqft: subject.sqft, min_beds: subject.min_beds, max_beds: subject.max_beds, min_baths: subject.min_baths, min_sqft: subject.min_sqft, max_sqft: subject.max_sqft, months: subject.months })
                .filter(([, v]) => v != null)
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={String(v)} />
                ))}
              <fieldset>
                <legend className={labelCls}>Recent sales (choose up to 12)</legend>
                <ul className="mt-2 divide-y divide-line">
                  {comps.map((c) => (
                    <li key={c.listing_key} className="flex items-start gap-3 py-2">
                      <input id={`comp-${c.listing_key}`} type="checkbox" name="comp" value={c.listing_key} className="mt-1 h-5 w-5 accent-navy" />
                      <label htmlFor={`comp-${c.listing_key}`} className="font-body text-body-sm text-ink">
                        <span className="font-medium">{c.street ?? "Address withheld"}</span>, {c.city} · sold {fmtMoney(c.close_price)} on {c.close_date}
                        <span className="block text-caption text-muted">
                          {c.bedrooms_total ?? "?"} bd · {c.bathrooms_total ?? "?"} ba · {c.living_area ? `${Number(c.living_area).toLocaleString("en-US")} sq ft` : "size n/a"}
                          {c.price_per_sqft ? ` · ${fmtMoney(c.price_per_sqft)}/sq ft` : ""} · {c.days_on_market ?? "?"} days on market · {c.is_own_listing ? "Vabrato" : c.list_office_name}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <div>
                <label htmlFor="title" className={labelCls}>
                  Title <span className="text-muted">(required)</span>
                </label>
                <input id="title" name="title" required maxLength={160} placeholder="e.g. 88 Example Way, San Carlos" className={`${inputCls} mt-1`} />
              </div>
              <div>
                <label htmlFor="notes" className={labelCls}>
                  Notes (optional)
                </label>
                <textarea id="notes" name="notes" rows={3} maxLength={2000} className={`${inputCls} mt-1`} />
              </div>
              <p className={mutedCls}>Only the subject details and the chosen listing keys are saved. Sale details are read from the feed whenever the CMA is opened.</p>
            </ActionForm>
          ) : (
            <p className={mutedCls}>No sales match. Widen the size or bed range, or look further back.</p>
          )}
        </Panel>
      )}
      <MlsAttribution lastUpdated={(lastUpdated as string | null) ?? null} />
    </ConsoleShell>
  );
}
