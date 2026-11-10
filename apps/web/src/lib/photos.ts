// Listing photo sources.
//
// Review item 8: MLS photos are served UNOPTIMIZED (no Vercel image
// optimization or caching) until MLSListings confirms we may copy photos.
// Only our own images and placeholders go through next/image optimization.
// Fixture photos on the mock host (*.invalid) never resolve, so they fall back
// to the grey "LISTING PHOTO (FROM MLS FEED)" placeholder, as in the mockups.

export interface ListingPhotoSource {
  src: string;
  /** Always true for MLS photos (see above). */
  unoptimized: true;
}

export function resolveListingPhoto(
  media: { url?: string | null; storage_path?: string | null } | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): ListingPhotoSource | null {
  if (!media) return null;
  if (media.storage_path && supabaseUrl) {
    const path = media.storage_path.split("/").map(encodeURIComponent).join("/");
    return { src: `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/mls-photos/${path}`, unoptimized: true };
  }
  if (!media.url) return null;
  let url: URL;
  try {
    url = new URL(media.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.endsWith(".invalid")) return null;
  return { src: url.toString(), unoptimized: true };
}
