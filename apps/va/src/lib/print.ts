// Print views (CMA, flyer, presentations): just the page, no console frame.
export const PRINT_CSS = `@media print {
  aside, a[href="#main"], [data-no-print], header, nav { display: none !important; }
  body, main { background: #fff !important; }
  .print-page { break-after: page; }
}`;

/** A listing photo we may show: our copy in storage, or the feed's https URL (never the mock host). */
export function listingPhotoUrl(media: { url: string | null; storage_path: string | null } | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (media?.storage_path && base) return `${base.replace(/\/+$/, "")}/storage/v1/object/public/mls-photos/${media.storage_path.split("/").map(encodeURIComponent).join("/")}`;
  if (!media?.url) return null;
  try {
    const u = new URL(media.url);
    return u.protocol === "https:" && !u.hostname.endsWith(".invalid") ? u.toString() : null;
  } catch {
    return null;
  }
}
