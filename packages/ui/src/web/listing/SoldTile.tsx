import { cx, focusDark } from "../cx";
import { ListingPhoto, type PlaceholderTint } from "./ListingPhotoPlaceholder";

export interface SoldTileProps {
  address: string;
  /** "Woodside, CA 94062 · Sold $6,250,000" */
  detail: string;
  href: string;
  photo?: { src: string; alt: string };
  tint?: PlaceholderTint;
  headingLevel?: "h3" | "h4";
}

/**
 * Large sold-property tile with VIEW DETAILS (mockup 01). Public display of
 * sold listings is gated by the `public_sold` flag (MLS-10); pages decide.
 */
export function SoldTile({
  address,
  detail,
  href,
  photo,
  tint,
  headingLevel: H = "h3",
}: SoldTileProps) {
  return (
    <article className="group relative aspect-[16/9] overflow-hidden bg-charcoal text-white">
      <ListingPhoto photo={photo} tint={tint} />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"
      />
      <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-end justify-between gap-3 p-5">
        <div>
          <H className="font-display text-display-sm uppercase">{address}</H>
          <p className="font-body text-caption uppercase tracking-label text-white/90">{detail}</p>
        </div>
        <a
          href={href}
          className={cx(
            "inline-flex min-h-[36px] items-center border border-white/80 px-4 font-body text-[11px] font-medium uppercase tracking-label hover:bg-white hover:text-navy",
            focusDark,
          )}
        >
          View details<span className="sr-only">: {address}</span>
        </a>
      </div>
    </article>
  );
}
