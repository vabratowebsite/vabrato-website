import type { ResoClient } from "../client/client";
import { isPublicPhoto } from "../eligibility";
import type { Media } from "../resources";
import { mediaRow, type MediaRow } from "./rows";

// Listing photos, two paths behind MLS_PHOTO_MODE (SPEC open question: may
// photos be copied to our storage?):
//   hotlink  store the feed's MediaURL; pages load photos from the MLS CDN.
//   copy     download each photo into the `mls-photos` bucket; re-download
//            only when the Media record's ModificationTimestamp changes.
// Either way, removed listings lose their photos at the next sync (MLS-5).

export const PHOTO_BUCKET = "mls-photos";

export interface PhotoBucket {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /** Deletes every object under `listing/` (MLS-9 purge). */
  removeAll(): Promise<number>;
}

export class MemoryBucket implements PhotoBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async put(path: string, bytes: Uint8Array, contentType: string) {
    this.objects.set(path, { bytes, contentType });
  }
  async remove(paths: string[]) {
    for (const p of paths) this.objects.delete(p);
  }
  async removeAll() {
    const n = this.objects.size;
    this.objects.clear();
    return n;
  }
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export function photoPath(listingKey: string, mediaKey: string, contentType: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
  return `listing/${safe(listingKey)}/${safe(mediaKey)}.${EXT[contentType.split(";")[0]!.trim()] ?? "bin"}`;
}

export interface PhotoPlan {
  rows: MediaRow[];
  /** Objects no longer referenced (deleted after the DB is updated). */
  stale: string[];
  copied: number;
}

/**
 * Turns feed Media for some listings into rows, copying photos when asked.
 * `existing` is what the store has now for the same listings.
 */
export async function planPhotos(opts: {
  mode: "hotlink" | "copy";
  feed: Media[];
  existing: MediaRow[];
  client: ResoClient;
  bucket: PhotoBucket | null;
}): Promise<PhotoPlan> {
  const { mode, existing, client, bucket } = opts;
  const before = new Map(existing.map((m) => [m.media_key, m]));
  const rows: MediaRow[] = [];
  let copied = 0;
  for (const m of opts.feed.filter(isPublicPhoto)) {
    if (mode === "hotlink") {
      rows.push(mediaRow(m, null));
      continue;
    }
    if (!bucket) throw new Error("MLS_PHOTO_MODE=copy needs a photo bucket (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
    const prev = before.get(m.MediaKey);
    const ts = m.ModificationTimestamp ? new Date(m.ModificationTimestamp).toISOString() : null;
    if (prev?.storage_path && prev.modification_ts === ts && ts !== null) {
      rows.push(mediaRow(m, prev.storage_path));
      continue;
    }
    const file = await client.fetchBinary(m.MediaURL!);
    const path = photoPath(m.ResourceRecordKey, m.MediaKey, file.contentType);
    await bucket.put(path, file.bytes, file.contentType);
    copied++;
    rows.push(mediaRow(m, path));
  }
  const kept = new Set(rows.map((r) => r.storage_path).filter(Boolean));
  const stale = existing.map((m) => m.storage_path).filter((p): p is string => Boolean(p) && !kept.has(p));
  return { rows, stale, copied };
}
