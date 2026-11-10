import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ListingPhotoPlaceholder, Panel, Pill } from "@vabrato/ui/web";
import { MlsAttribution } from "@/components/MlsAttribution";
import { cityLine, formatPrice, listingTitle, propertyTypeLabel } from "@/lib/format";
import { resolveListingPhoto } from "@/lib/photos";
import { flagEnabled, mlsLastUpdated } from "@/lib/public/listings";
import { MemberShell } from "@/member/components/MemberShell";
import { memberListing } from "@/member/listings";
import { buys } from "@/member/roles";
import { LISTING_KEY } from "@/member/saved";
import { requirePortalMember } from "@/member/session";
import { fmtDay, historyRows, memberListingParts } from "@/member/view";

// Member view of a sold (or any visible) listing: IDX facts plus the VOW
// sold price, original price, days on market and price history (MLS-6).
// 404 while vow_enabled is off (review item 1).
type Props = { params: Promise<{ key: string }> };

export default async function MemberListingPage({ params }: Props) {
  if (!(await flagEnabled("vow_enabled"))) notFound();
  const { key } = await params;
  const member = await requirePortalMember(`/my/listing/${encodeURIComponent(key)}`);
  if (!buys(member.role)) redirect("/my/seller");
  if (!member.profile.vow_accepted_at) redirect("/my/sold");
  if (!LISTING_KEY.test(key)) notFound();

  const [found, lastUpdated] = await Promise.all([memberListing(member.supabase, key), mlsLastUpdated()]);
  if (!found) notFound();
  const { listing, sold, history } = found;
  const parts = memberListingParts(listing);
  const title = listingTitle(parts);
  const media = [...listing.mls_media].sort((a, b) => a.sort_order - b.sort_order)[0];
  const photo = media ? resolveListingPhoto(media) : null;
  const rows = historyRows(history, sold);

  return (
    <MemberShell member={member} role={member.role} current="sold" eyebrow={sold ? "Sold home" : "Listing"} title={title}>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="relative aspect-[4/3] overflow-hidden bg-soft">
          {photo ? <Image src={photo.src} alt={`Photo of ${title}`} fill unoptimized className="object-cover" sizes="(min-width: 1024px) 60vw, 100vw" /> : <ListingPhotoPlaceholder label="Listing photo (from MLS feed)" />}
        </div>
        <Panel title={sold ? `Sold ${formatPrice(sold.price)}` : formatPrice(listing.list_price)}>
          <dl className="grid grid-cols-2 gap-4 font-body text-body-sm text-ink">
            <div>
              <dt className="text-muted">Location</dt>
              <dd>{cityLine(parts)}</dd>
            </div>
            <div>
              <dt className="text-muted">Home type</dt>
              <dd>{propertyTypeLabel(listing.property_sub_type)}</dd>
            </div>
            <div>
              <dt className="text-muted">Beds / baths</dt>
              <dd>
                {listing.bedrooms_total ?? "—"} bd · {listing.bathrooms_total ?? "—"} ba
              </dd>
            </div>
            <div>
              <dt className="text-muted">Living area</dt>
              <dd>{listing.living_area ? `${listing.living_area.toLocaleString("en-US")} sq ft` : "—"}</dd>
            </div>
            {sold && (
              <>
                <div>
                  <dt className="text-muted">Sold on</dt>
                  <dd>{fmtDay(sold.date)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Original list price</dt>
                  <dd>{formatPrice(sold.originalPrice)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Days on market</dt>
                  <dd>{sold.daysOnMarket ?? "—"}</dd>
                </div>
              </>
            )}
            <div className="col-span-2">
              <dt className="text-muted">Listing broker</dt>
              <dd>
                {listing.is_own_listing ? (
                  "Vabrato Real Estate Services"
                ) : (
                  <>
                    <Pill tone="outline">IDX</Pill> Listing courtesy of {listing.list_office_name ?? "another broker"}
                  </>
                )}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
      <Panel title="Price & sale history">
        {rows.length === 0 ? (
          <p className="font-body text-body-sm text-muted">No price changes recorded.</p>
        ) : (
          <table className="w-full font-body text-body-sm text-ink">
            <caption className="sr-only">Price and sale history for {title}</caption>
            <thead>
              <tr className="border-b border-line text-left text-label uppercase tracking-label text-muted">
                <th scope="col" className="py-2 font-medium">
                  Date
                </th>
                <th scope="col" className="py-2 font-medium">
                  Event
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-3">{r.date}</td>
                  <td className="py-3">{r.event}</td>
                  <td className="py-3 text-right">{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="font-body text-caption text-muted">Sold prices and history are for your personal, non-commercial use under the Terms of Use.</p>
      <MlsAttribution lastUpdated={lastUpdated} />
    </MemberShell>
  );
}
