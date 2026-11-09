/**
 * Generic IDX mark for other brokers' listings (MLS-2). Replace with the
 * official MLSListings IDX icon via ListingCard's `idxIcon` prop when the
 * artwork is supplied in S3/S4.
 */
export function IdxIcon({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="IDX listing"
      className={`inline-flex h-5 items-center rounded-sm border border-current px-1 font-body text-[9px] font-bold tracking-[0.08em] ${className ?? ""}`}
    >
      IDX
    </span>
  );
}
