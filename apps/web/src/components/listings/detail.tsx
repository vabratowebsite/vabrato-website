import { IdxIcon, ListingPhoto, Pill } from "@vabrato/ui/web";
import type { QaItem } from "@/lib/listing-qa";
import { resolveListingPhoto } from "@/lib/photos";
import type { Listing } from "@/lib/public/listings";

// Server-rendered sections of the listing page (mockup 03). Fields come only
// from the IDX field set; hidden addresses are already removed upstream.

const tints = ["slate", "steel", "mauve"] as const;

export function ListingGallery({ listing, title }: { listing: Listing; title: string }) {
  const media = listing.mls_media;
  const photos = media.map((m, i) => ({ key: m.media_key, photo: resolveListingPhoto(m), alt: m.short_description || `${title}, photo ${i + 1}` }));
  const main = photos[0];
  const side = photos.slice(1, 5);
  return (
    <section aria-label="Photos" className="grid gap-1 bg-white md:grid-cols-[2fr_1fr_1fr] md:grid-rows-2">
      <div className="relative aspect-[4/3] md:row-span-2 md:aspect-auto md:min-h-[480px]">
        <ListingPhoto photo={main?.photo ? { src: main.photo.src, alt: main.alt } : undefined} tint="slate" />
      </div>
      {side.map((p, i) => (
        <div key={p.key} className="relative hidden aspect-[4/3] md:block md:aspect-auto">
          <ListingPhoto photo={p.photo ? { src: p.photo.src, alt: p.alt } : undefined} tint={tints[(i + 1) % 3]} compact />
        </div>
      ))}
      {media.length > 1 && (
        <p className="sr-only">
          {media.length} photos. {media.length > 5 ? "Some photos are shown in the gallery below." : ""}
        </p>
      )}
    </section>
  );
}

export function StatusPills({ listing }: { listing: Listing }) {
  const status =
    listing.standard_status === "Active" ? { label: "Active", tone: "green" as const } : { label: listing.standard_status === "Pending" ? "Pending" : "Contingent", tone: "gold" as const };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={status.tone} dot>
        {status.label}
      </Pill>
      {listing.is_own_listing ? (
        <Pill tone="gold">Listed by Vabrato</Pill>
      ) : (
        <span className="inline-flex items-center gap-2 font-body text-caption text-ink">
          <IdxIcon />
          Listing courtesy of {listing.list_office_name ?? "the listing broker"}
        </span>
      )}
    </div>
  );
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function FactsRow({ listing }: { listing: Listing }) {
  const d = listing.data;
  const facts = [
    { label: "Beds", value: listing.bedrooms_total },
    { label: "Baths", value: listing.bathrooms_total },
    { label: "Sq ft", value: num(listing.living_area) },
    { label: "Lot sq ft", value: num(d.LotSizeSquareFeet) },
    { label: "Built", value: num(d.YearBuilt), raw: true },
    { label: "Days on market", value: num(d.DaysOnMarket) },
  ].filter((f) => f.value !== null && f.value !== undefined);
  return (
    <dl className="grid grid-cols-3 gap-6 border-y border-line py-6 md:grid-cols-6">
      {facts.map((f) => (
        <div key={f.label} className="flex flex-col-reverse">
          <dt className="font-body text-[11px] uppercase tracking-label text-muted">{f.label}</dt>
          <dd className="font-display text-[32px] leading-tight text-navy">{f.raw ? String(f.value) : Number(f.value).toLocaleString("en-US")}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PropertyDetails({ listing, typeLabel }: { listing: Listing; typeLabel: string }) {
  const d = listing.data;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : str(v));
  const garage = num(d.GarageSpaces);
  const rows: [string, string | null][] = [
    ["Property type", typeLabel],
    ["MLS #", listing.listing_id],
    ["HOA", num(d.AssociationFee) ? `$${Number(d.AssociationFee).toLocaleString("en-US")} ${str(d.AssociationFeeFrequency)?.toLowerCase() ?? "monthly"}` : "None listed"],
    ["Parking", garage ? `${garage}-car garage` : str(d.ParkingTotal)],
    ["Heating", list(d.Heating)],
    ["Cooling", list(d.Cooling)],
    ["View", list(d.View)],
    ["County", listing.county],
  ];
  return (
    <dl className="grid gap-x-10 md:grid-cols-2">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line py-3 font-body text-body-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right text-ink">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

/** MLS-6: sold and price history are for signed-in members only; nothing is fetched here. */
export function LockedHistory({ joinHref = "/join" }: { joinHref?: string }) {
  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="flex items-center gap-3 font-subhead text-subhead-lg text-ink">
        Price &amp; sale history <Pill tone="neutral">Members</Pill>
      </h2>
      <div className="mt-4 border border-line p-6 text-center">
        <p className="font-body text-body text-ink">Price changes and past sales are shown to members who accept the VOW Terms of Use.</p>
        <a href={joinHref} className="mt-3 inline-block font-body text-body-sm font-medium text-navy underline">
          Create a free account to see full history
        </a>
      </div>
    </section>
  );
}

export function ListingQa({ items }: { items: QaItem[] }) {
  return (
    <section aria-labelledby="qa-heading">
      <h2 id="qa-heading" className="font-subhead text-subhead-lg text-ink">
        Questions buyers ask about this home
      </h2>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {items.map((it) => (
          <div key={it.q} className="py-4">
            <dt className="font-subhead text-subhead-md text-ink">{it.q}</dt>
            <dd className="mt-2 font-body text-body-sm text-ink">{it.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
