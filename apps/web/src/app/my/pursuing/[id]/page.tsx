import { notFound, redirect } from "next/navigation";
import { Panel, Pill, StatusLadder } from "@vabrato/ui/web";
import { LADDER_LABEL, PROPERTY_STATUSES, STATUS_LABELS, isPropertyStatus } from "@vabrato/lib";
import { MlsAttribution } from "@/components/MlsAttribution";
import { formatPrice, listingPath } from "@/lib/format";
import { mlsLastUpdated } from "@/lib/public/listings";
import { MemberShell } from "@/member/components/MemberShell";
import { SubmitButton } from "@/member/components/controls";
import { cards } from "@/member/listings";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";
import { deleteTrackedAction, updateTrackedStatusAction } from "../actions";

// One home the buyer is pursuing: where they are (status ladder), the live
// listing when it's linked (IDX), and activity. Moved from apps/buyer.
type Props = { params: Promise<{ id: string }> };

export default async function PursuingPage({ params }: Props) {
  const { id } = await params;
  const member = await requirePortalMember(`/my/pursuing/${id}`);
  if (!buys(member.role)) redirect("/my/seller");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: home } = await member.supabase.from("tracked_properties").select("id, address, source, status, listing_key, created_at").eq("id", id).eq("buyer_id", member.profile.id).maybeSingle();
  if (!home) notFound();
  const [{ data: events }, linked, lastUpdated] = await Promise.all([
    member.supabase.from("property_events").select("id, kind, occurred_at").eq("tracked_property_id", id).order("occurred_at", { ascending: false }),
    home.listing_key ? cards(member.supabase, [home.listing_key]) : Promise.resolve([]),
    mlsLastUpdated(),
  ]);
  const card = linked[0];
  const status = isPropertyStatus(home.status) ? home.status : "watching";
  const ladder = LADDER_LABEL[status];

  return (
    <MemberShell member={member} role={member.role} current="buyer" eyebrow="Home I'm pursuing" title={home.address}>
      <Panel title="Where things stand">
        <div className="space-y-6">
          {ladder ? <StatusLadder current={ladder} label={`Progress for ${home.address}`} /> : <Pill tone="outline">{STATUS_LABELS[status]}</Pill>}
          {/* One form per status: the clicked button's own value isn't always sent with a server action. */}
          <div role="group" aria-label="Update status" className="flex flex-wrap gap-2">
            {PROPERTY_STATUSES.map((s) => (
              <form key={s} action={updateTrackedStatusAction}>
                <input type="hidden" name="id" value={home.id} />
                <input type="hidden" name="status" value={s} />
                <button
                  type="submit"
                  aria-pressed={s === status}
                  className="min-h-[44px] border border-navy px-4 font-body text-label uppercase tracking-label text-navy aria-[pressed=true]:bg-navy aria-[pressed=true]:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                >
                  {STATUS_LABELS[s]}
                </button>
              </form>
            ))}
          </div>
          {card && (
            <p className="font-body text-body-sm text-ink">
              On the market now at {formatPrice(card.list_price)} ·{" "}
              <a href={listingPath(card)} className="text-navy underline">
                View listing
              </a>
              {!card.is_own_listing && card.list_office_name ? ` · Listing courtesy of ${card.list_office_name}` : ""}
            </p>
          )}
          {home.listing_key && !card && <p className="font-body text-body-sm text-muted">This home is no longer on the market.</p>}
        </div>
      </Panel>
      <Panel title="Activity">
        {events && events.length > 0 ? (
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {events.map((e) => (
              <li key={e.id} className="py-3">
                {e.kind} · {fmtDay(e.occurred_at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body text-body text-ink">
            No activity yet. Price changes on homes you&apos;ve saved show up in{" "}
            <a href="/my/alerts" className="text-navy underline">
              What changed
            </a>
            .
          </p>
        )}
      </Panel>
      <form action={deleteTrackedAction}>
        <input type="hidden" name="id" value={home.id} />
        <SubmitButton variant="outline">Stop tracking this home</SubmitButton>
      </form>
      {card && <MlsAttribution lastUpdated={lastUpdated} />}
    </MemberShell>
  );
}
