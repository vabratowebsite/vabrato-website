// Member documents (review item 8). The file type comes from the file's own
// bytes, never from its name or the browser's claim; SVG and anything else
// that could carry script is refused. Pure, unit-tested.

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/png,image/jpeg,image/webp,image/heic";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** The document type from its first bytes, or null if it isn't one we accept. */
export function sniffDocumentType(bytes: Uint8Array): DocumentType | null {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 8) === "ftyp" && ["heic", "heix", "heim", "heis", "mif1", "msf1"].includes(ascii(bytes, 8, 12))) return "image/heic";
  return null;
}

/** Display name: keep the member's name readable, drop control characters and paths. */
export function displayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "Document").slice(0, 160);
}

const EXT: Record<DocumentType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Storage path: member/{profile}/{random}-{slug}.{ext}. The extension follows the sniffed type. */
export function storagePath(profileId: string, name: string, type: DocumentType, random: string): string {
  const stem =
    displayName(name)
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "document";
  return `member/${profileId}/${random}-${stem}.${EXT[type]}`;
}

export const MEMBER_PATH = /^member\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/;
export const DEAL_DOC_PATH = /^deal\/[0-9a-f-]{36}\/[^/\u0000-\u001f]{1,200}$/;

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
