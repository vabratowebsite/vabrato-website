import { cx } from "../cx";
import { HouseOutline } from "../icons";

const tints = {
  slate: "from-[#5B6079] to-[#9AA0BA]",
  steel: "from-[#4F5E66] to-[#8FA1A8]",
  mauve: "from-[#5E5866] to-[#A49BA8]",
} as const;

export type PlaceholderTint = keyof typeof tints;

/**
 * Grey stand-in for an MLS photo. The repo is public, so no real listing
 * photos are ever committed; the live site swaps in the feed image.
 */
export function ListingPhotoPlaceholder({
  tint = "slate",
  label = "Listing photo (from MLS feed)",
  className,
  compact,
  iconless,
}: {
  tint?: PlaceholderTint;
  label?: string;
  className?: string;
  compact?: boolean;
  /** Hide the house glyph and caption when another control (play button, slider handle) sits on top. */
  iconless?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cx(
        "flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b text-white/85",
        tints[tint],
        className,
      )}
    >
      {!iconless && (
        <>
          <HouseOutline size={compact ? 36 : 56} />
          <span
            aria-hidden="true"
            className="px-2 text-center font-body text-[10px] uppercase tracking-label"
          >
            {label}
          </span>
        </>
      )}
    </div>
  );
}

/** Photo if given, otherwise the placeholder. */
export function ListingPhoto({
  photo,
  tint,
  className,
  compact,
}: {
  photo?: { src: string; alt: string };
  tint?: PlaceholderTint;
  className?: string;
  compact?: boolean;
}) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo.src}
        alt={photo.alt}
        className={cx("h-full w-full object-cover", className)}
      />
    );
  }
  return <ListingPhotoPlaceholder tint={tint} className={className} compact={compact} />;
}
