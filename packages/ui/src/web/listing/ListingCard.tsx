"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx, focusDark } from "../cx";
import { HeartIcon } from "../icons";
import { IdxIcon } from "./IdxIcon";
import { ListingPhoto, type PlaceholderTint } from "./ListingPhotoPlaceholder";

export type ListingBadge = "ours" | "new" | "contingent" | "sold" | "list-sold" | "price-drop" | "open";

export const BADGE_LABELS: Record<ListingBadge, string> = {
  ours: "Vabrato",
  new: "New",
  contingent: "Contingent",
  sold: "Sold",
  "list-sold": "List: Sold",
  "price-drop": "Price ↓",
  open: "Open",
};

const BADGE_STYLES: Record<ListingBadge, string> = {
  ours: "bg-gold text-ink",
  new: "bg-gold text-ink",
  contingent: "bg-white text-ink",
  sold: "bg-red text-white",
  "list-sold": "bg-red text-white",
  "price-drop": "bg-red-50 text-red",
  open: "bg-gold text-ink",
};

export interface ListingAttribution {
  /** True for other brokers' listings: shows the IDX icon and listing broker (MLS-2). */
  idx: boolean;
  listingBroker?: string;
}

export interface ListingCardProps {
  address: string;
  /** "Palo Alto, CA 94301" */
  cityLine: string;
  /** Preformatted, e.g. "$3,850,000". */
  price: string;
  /** "Condo · 3 bd · 3 ba" */
  typeLine: string;
  listingNo: string;
  href: string;
  photo?: { src: string; alt: string };
  tint?: PlaceholderTint;
  badges?: ListingBadge[];
  /** Badge text override, e.g. "Open Sat" for an open house. */
  badgeText?: Partial<Record<ListingBadge, string>>;
  /** Omit to hide the save heart (e.g. signed-out contexts that link to Join). */
  saved?: boolean;
  onToggleSave?: (saved: boolean) => void;
  attribution?: ListingAttribution;
  /** Official IDX artwork; defaults to the generic IdxIcon. */
  idxIcon?: ReactNode;
  headingLevel?: "h2" | "h3" | "h4";
}

/** Dark listing card (SPEC <brand>, mockups 01/09). */
export function ListingCard({
  address,
  cityLine,
  price,
  typeLine,
  listingNo,
  href,
  photo,
  tint,
  badges = [],
  badgeText,
  saved,
  onToggleSave,
  attribution,
  idxIcon,
  headingLevel: H = "h3",
}: ListingCardProps) {
  const [isSaved, setSaved] = useState(Boolean(saved));
  // Follow the parent's saved state (e.g. once the member's saves load) without remounting.
  useEffect(() => setSaved(Boolean(saved)), [saved]);
  const showHeart = saved !== undefined || onToggleSave !== undefined;
  const showIdx = attribution?.idx === true;

  return (
    <article className="group relative flex flex-col bg-charcoal text-white shadow-card">
      <div className="relative aspect-[4/3] overflow-hidden">
        <ListingPhoto
          photo={photo}
          tint={tint}
          className="transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {/* Readability gradient behind the address and price */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70"
        />
        <div className="absolute left-3 right-14 top-3">
          <H className="font-body text-body-sm font-medium uppercase leading-tight">
            {/* Overlay link: the whole card is clickable, heart stays separately focusable. */}
            <a
              href={href}
              className={cx("after:absolute after:inset-0 after:content-['']", focusDark)}
            >
              {address}
            </a>
          </H>
          <p className="font-body text-[11px] uppercase text-white/90">{cityLine}</p>
        </div>
        {badges.length > 0 && (
          <ul aria-label="Status" className="absolute right-3 top-3 flex flex-col items-end gap-1">
            {badges.map((b) => (
              <li
                key={b}
                data-badge={b}
                className={cx(
                  "px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-label",
                  BADGE_STYLES[b],
                )}
              >
                {badgeText?.[b] ?? BADGE_LABELS[b]}
              </li>
            ))}
          </ul>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="font-subhead text-subhead-md">{price}</p>
          <p className="font-body text-[11px] uppercase tracking-[0.06em] text-white/90">
            {typeLine}
          </p>
        </div>
        {showHeart && (
          <button
            type="button"
            aria-pressed={isSaved}
            aria-label={`Save ${address}`}
            onClick={() => {
              const next = !isSaved;
              setSaved(next);
              onToggleSave?.(next);
            }}
            className={cx(
              "absolute bottom-2 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 hover:bg-black/55",
              isSaved ? "text-gold" : "text-white",
              focusDark,
            )}
          >
            <HeartIcon size={20} filled={isSaved} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 bg-charcoal px-3 py-2 font-body text-[11px] font-bold uppercase tracking-[0.06em]">
        <span>
          Listing No. <span className="font-normal">{listingNo}</span>
        </span>
        <span aria-hidden="true" className="text-gold">
          View ›
        </span>
      </div>
      {showIdx && (
        <div
          data-slot="idx-attribution"
          className="flex items-center gap-2 border-t border-white/15 px-3 py-1.5 font-body text-[11px] text-white/90"
        >
          {idxIcon ?? <IdxIcon />}
          <span>Listing courtesy of {attribution?.listingBroker ?? "listing broker"}</span>
        </div>
      )}
    </article>
  );
}
