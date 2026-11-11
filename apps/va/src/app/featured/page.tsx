import { Panel, Pill } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ActionForm } from "@/components/action-form";
import { ConsoleShell } from "@/components/console-shell";
import { inputCls, labelCls, mutedCls, okCls } from "@/components/ui";
import { PIN_LABEL, pinState, ptDay } from "@/lib/featured";
import { addFeaturedAction, removeFeaturedAction } from "@/lib/featured-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Featured listings on the website's home page. Pinned listings show first
// (in order), then our own listings, then the newest others (three in all).
export const dynamic = "force-dynamic";

const fmtPrice = (n: number | null) => (n == null ? "" : `$${Math.round(n).toLocaleString("en-US")}`);
const TONE = { live: "green", scheduled: "neutral", ended: "outline", not_for_sale: "red" } as const;

export default async function FeaturedPage({ searchParams }: { searchParams: Promise<{ done?: string; site?: string }> }) {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const { done, site } = await searchParams;
  const supabase = await supabaseServer();
  const { data: pins } = await supabase.from("featured_listings").select("listing_key, sort, starts_at, ends_at, created_at").order("sort").order("created_at");
  const keys = (pins ?? []).map((p) => p.listing_key);
  const { data: cards } = keys.length ? await supabase.rpc("listing_cards", { p_keys: keys }) : { data: [] };
  const card = new Map((cards ?? []).map((c) => [c.listing_key, c]));
  const { data: own } = await supabase.from("mls_listings").select("listing_key, list_price, city").eq("is_own_listing", true).in("standard_status", ["Active", "ActiveUnderContract", "Pending"]).order("modification_ts", { ascending: false }).limit(20);

  return (
    <ConsoleShell profile={profile} current="featured" eyebrow="Website" title="Featured listings">
      {done === "removed" && (
        <p role="status" className={okCls}>
          Removed. {site === "now" ? "The website is updated." : "The website will show it within 15 minutes."}
        </p>
      )}
      <p className={mutedCls}>The home page shows three listings: pinned ones first (lowest order first), then our own listings, then the newest others. A pin shows only while the listing is for sale.</p>

      <Panel title="Pin a listing">
        <ActionForm action={addFeaturedAction} submitLabel="Pin listing" pendingLabel="Saving…" resetOnOk className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="listing_key" className={labelCls}>
                MLS listing key <span className="text-muted">(required)</span>
              </label>
              <input id="listing_key" name="listing_key" required maxLength={64} list="own-listings" className={`${inputCls} mt-1`} />
              <datalist id="own-listings">
                {(own ?? []).map((o) => (
                  <option key={o.listing_key} value={o.listing_key}>
                    {`${o.city ?? ""} ${fmtPrice(o.list_price)}`}
                  </option>
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="sort" className={labelCls}>
                Order
              </label>
              <input id="sort" name="sort" inputMode="numeric" defaultValue="0" maxLength={4} className={`${inputCls} mt-1`} />
            </div>
            <div>
              <label htmlFor="starts" className={labelCls}>
                First day (optional)
              </label>
              <input id="starts" name="starts" type="date" className={`${inputCls} mt-1`} />
            </div>
            <div>
              <label htmlFor="ends" className={labelCls}>
                Last day (optional)
              </label>
              <input id="ends" name="ends" type="date" className={`${inputCls} mt-1`} />
            </div>
          </div>
          <p className={mutedCls}>Pinning a listing that&apos;s already pinned changes its order and dates.</p>
        </ActionForm>
      </Panel>

      <Panel title={`Pinned (${pins?.length ?? 0})`}>
        {pins?.length ? (
          <ul className="divide-y divide-line">
            {pins.map((p) => {
              const c = card.get(p.listing_key);
              const state = pinState(p, Boolean(c));
              return (
                <li key={p.listing_key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="font-body text-body-sm text-ink">
                    <p className="font-medium">
                      {c ? `${c.street ?? "Address withheld"}, ${c.city ?? ""}` : p.listing_key} {c && <span className="text-muted">· {fmtPrice(c.list_price)}</span>}
                    </p>
                    <p className="text-caption text-muted">
                      {p.listing_key} · order {p.sort}
                      {p.starts_at && ` · from ${ptDay(p.starts_at)}`}
                      {p.ends_at && ` · until the end of ${ptDay(new Date(Date.parse(p.ends_at) - 1).toISOString())}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Pill tone={TONE[state]}>{PIN_LABEL[state]}</Pill>
                    <ActionForm action={removeFeaturedAction.bind(null, p.listing_key)} submitLabel="Unpin" submitAriaLabel={`Unpin ${c?.street ?? p.listing_key}`} pendingLabel="Removing…" secondary className="flex items-center gap-3" />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={mutedCls}>Nothing pinned: the home page shows our own listings, then the newest others.</p>
        )}
      </Panel>
    </ConsoleShell>
  );
}
