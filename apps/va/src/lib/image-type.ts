// Agent photo uploads: the file's first bytes decide what it is, not its name
// or the browser's content type. JPEG, PNG and WebP only (no SVG: it can
// carry script). 4 MB at most: the photo travels through a server action, and
// Vercel refuses request bodies over 4.5 MB (the bucket itself allows 5 MB, 0024).

export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export type PhotoType = { ext: "jpg" | "png" | "webp"; mime: "image/jpeg" | "image/png" | "image/webp" };

export function sniffImage(bytes: Uint8Array): PhotoType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return { ext: "png", mime: "image/png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export type PhotoCheck = { ok: true; type: PhotoType } | { ok: false; error: string };

export function checkPhoto(size: number, head: Uint8Array): PhotoCheck {
  if (size === 0) return { ok: false, error: "Choose a photo to upload." };
  if (size > MAX_PHOTO_BYTES) return { ok: false, error: "The photo must be 4 MB or smaller." };
  const type = sniffImage(head);
  if (!type) return { ok: false, error: "Upload a JPEG, PNG or WebP photo." };
  return { ok: true, type };
}
