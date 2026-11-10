import { redirect } from "next/navigation";
import { Button, Panel, Pill } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { listingPath, listingTitle } from "@/lib/format";
import { mlsLastUpdated } from "@/lib/public/listings";
import { MemberShell } from "@/member/components/MemberShell";
import { cards } from "@/member/listings";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";
import { fmtDay } from "@/member/view";

// Tour requests made while signed in. Never auto-confirmed: an agent confirms
// each one (review item 16).
const STATUS: Record<string, { label: string; tone: "neutral" | "green" | "red" | "gold" | "navy" }> = {
  requested: { label: "Requested · waiting for your agent to confirm", tone: "gold" },
  confirmed: { label: "Confirmed", tone: "green" },
  declined: { label: "Not available", tone: "red" },
  completed: { label: "Toured", tone: "navy" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function ToursPage() {
  const member = await requirePortalMember("/my/tours");
  if (!buys(member.role)) redirect("/my/seller");
  const [{ data: tours }, lastUpdated] = await Promise.all([member.supabase.rpc("my_tour_requests"), mlsLastUpdated()]);
  const list = tours ?? [];
  const live = new Map((await cards(member.supabase, [...new Set(list.map((t) => t.listing_key).filter((k): k is string => Boolean(k)))])).map((c) => [c.listing_key, c]));

  return (
    <MemberShell member={member} role={member.role} current="tours" eyebrow="Buyer portal" title="Tours">
      {list.length === 0 ? (
        <Panel title="No tour requests yet">
          <div className="space-y-4 font-body text-body text-ink">
            <p>Request a tour from any listing page while you&apos;re signed in, and it shows up here. Your agent confirms every tour.</p>
            <Button href="/search" variant="navy" underline={false}>
              Search homes
            </Button>
          </div>
        </Panel>
      ) : (
        <Panel title="Your tour requests">
          <ul className="divide-y divide-line font-body text-body-sm text-ink">
            {list.map((t) => {
              const card = t.listing_key ? live.get(t.listing_key) : undefined;
              const s = STATUS[t.tour_status ?? "requested"] ?? STATUS.requested!;
              const payload = (t.payload ?? {}) as { tourDate?: string; tourMode?: string };
              return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="space-y-1">
                    <p className="text-body">
                      {card ? (
                        <a href={listingPath(card)} className="font-medium text-navy underline">
                          {listingTitle(card)}
                        </a>
                      ) : (
                        "A home that's no longer on the market"
                      )}
                    </p>
                    <p className="text-caption text-muted">
                      Requested {fmtDay(t.created_at)}
                      {payload.tourDate ? ` · preferred day ${payload.tourDate}` : ""}
                      {payload.tourMode === "video" ? " · video tour" : ""}
                      {t.tour_confirmed_at ? ` · confirmed ${fmtDay(t.tour_confirmed_at)}` : ""}
                      {card && !card.is_own_listing && card.list_office_name ? ` · Listing courtesy of ${card.list_office_name}` : ""}
                    </p>
                  </div>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {list.length > 0 && <MlsAttribution lastUpdated={lastUpdated} />}
    </MemberShell>
  );
}
