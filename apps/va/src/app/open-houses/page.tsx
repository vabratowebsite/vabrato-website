import { Panel } from "@vabrato/ui/web";
import { AccessDenied } from "@/components/access-denied";
import { ConsoleShell } from "@/components/console-shell";
import { btnPrimary, mutedCls } from "@/components/ui";
import { createSigninLinkAction } from "@/lib/listing-actions";
import { requireSignIn } from "@/lib/staff";
import { supabaseServer } from "@/lib/supabase-server";

// Open-house sign-in links (S5 PR 5): one link per open house on Vabrato's own
// listings. Open it on the tablet at the event; it accepts sign-ins only on
// the day. Sign-ins arrive as leads (kind open_house_signin).
export const dynamic = "force-dynamic";

const SITE = (process.env.PUBLIC_SITE_URL ?? "https://vabrato.com").replace(/\/+$/, "");
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Time not set";

export default async function OpenHouses() {
  const { profile, isStaff } = await requireSignIn();
  if (!isStaff) return <AccessDenied profile={profile} />;
  const supabase = await supabaseServer();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: events } = await supabase
    .from("mls_open_houses")
    .select("open_house_key, listing_key, start_time, end_time, mls_listings!inner(is_own_listing, city, data)")
    .eq("mls_listings.is_own_listing", true)
    .gte("start_time", since)
    .order("start_time")
    .limit(100);
  const keys = (events ?? []).map((e) => e.open_house_key);
  const { data: links } = keys.length ? await supabase.from("open_house_signin_links").select("open_house_key, token").in("open_house_key", keys) : { data: [] };
  const tokenFor = new Map((links ?? []).map((l) => [l.open_house_key, l.token]));

  return (
    <ConsoleShell profile={profile} current="open-houses" title="Open houses">
      <p className={mutedCls}>
        Upcoming open houses on our own listings. Create a sign-in link and open it on the tablet at the event. It only accepts sign-ins on the day; visitors appear as leads.
      </p>
      {!events?.length ? (
        <Panel title="No upcoming open houses">
          <p className={mutedCls}>Open houses for our listings appear here once they&apos;re in the MLS.</p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => {
            const listing = e.mls_listings as unknown as { city: string | null; data: { UnparsedAddress?: string } | null };
            const token = tokenFor.get(e.open_house_key);
            const url = token ? `${SITE}/open-house-sign-in/${token}` : null;
            return (
              <li key={e.open_house_key} className="border border-line bg-white p-5 font-body">
                <p className="text-body font-medium text-ink">{listing.data?.UnparsedAddress ?? listing.city ?? e.listing_key}</p>
                <p className="text-body-sm text-muted">
                  {when(e.start_time)} · {e.listing_key}
                </p>
                {url ? (
                  <p className="mt-2 break-all text-body-sm">
                    <a href={url} className="text-navy underline">
                      {url}
                    </a>
                  </p>
                ) : (
                  <form action={createSigninLinkAction.bind(null, e.open_house_key)} className="mt-3">
                    <button type="submit" className={btnPrimary}>
                      Create sign-in link
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ConsoleShell>
  );
}
