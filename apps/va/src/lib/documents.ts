import type { SellerType } from "@vabrato/db";
import { checklistFor, type ChecklistMark, type SupabaseDb } from "@vabrato/lib";

// Deal documents (S6b PR 7a): file checks, storage paths and the missing
// count, shared by pages, client components, actions and tests. No model code.
//
// deal-docs paths (0009 / 0032):
//   deal/{deal}/staff/{uuid}-{name}   staff with deal access only (the default)
//   deal/{deal}/{name}                shared: the seller sees it in /my/documents
// receipts paths: deal/{deal}/uploads/{profile}/{uuid}.{ext} (staff only)

export const MAX_DOC_BYTES = 20 * 1024 * 1024;
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export type DocContentType = "application/pdf" | "image/jpeg" | "image/png";
export type ReceiptContentType = DocContentType | "image/webp";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The file's real type from its first bytes (never its name). */
export function sniffType(head: Uint8Array): ReceiptContentType | null {
  const starts = (bytes: number[], at = 0) => head.length >= at + bytes.length && bytes.every((b, i) => head[at + i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  return null;
}

/** A deal document: a PDF, JPG or PNG up to 20 MB. */
export function checkDealFile(size: number, head: Uint8Array): { type: DocContentType } | { error: string } {
  if (size === 0) return { error: "Choose a file first." };
  if (size > MAX_DOC_BYTES) return { error: "Files must be 20 MB or smaller. Export it again at a lower scan quality, or split it." };
  const type = sniffType(head);
  if (type === "application/pdf" || type === "image/jpeg" || type === "image/png") return { type };
  return { error: "Upload a PDF, JPG or PNG." };
}

/** A receipt: a PDF, JPG, PNG or WebP up to 10 MB. */
export function checkReceiptFile(size: number, head: Uint8Array): { type: ReceiptContentType } | { error: string } {
  if (size === 0) return { error: "Choose the receipt first." };
  if (size > MAX_RECEIPT_BYTES) return { error: "Receipts must be 10 MB or smaller." };
  const type = sniffType(head);
  return type ? { type } : { error: "Upload the receipt as a PDF, JPG, PNG or WebP." };
}

export const EXT: Record<ReceiptContentType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A file name that is safe as a storage key and readable for the seller, keeping its extension. */
export function safeFileName(name: string, type: ReceiptContentType): string {
  const ext = EXT[type];
  const base = name
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._() -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .slice(0, 100)
    .trim();
  return `${base || "document"}.${ext}`;
}

export const STILL_SHARED = "Couldn't stop sharing: the seller can still see this file. Try again.";

export const staffDocPath = (dealId: string, id: string, name: string) => `deal/${dealId}/staff/${id}-${name}`;

/** The name as the person uploaded it, for display (the storage key uses safeFileName): no control characters or slashes, at most 200 characters. */
export function originalName(name: unknown, fallback: string): string {
  const clean = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
    .trim();
  return clean || fallback;
}

/**
 * A PDF's page count from its page tree without a PDF library: the largest
 * /Count in a /Pages node, else the number of /Type /Page objects. Null when
 * neither can be read (compressed object streams); the file is then sent and
 * an API "too large" error says to split it.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  let count = 0;
  for (const m of text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)) count = Math.max(count, Number(m[1] ?? m[2]));
  if (count > 0) return count;
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  return pages > 0 ? pages : null;
}

export interface DocPath {
  shared: boolean;
  /** The file's name as people see it (without the staff folder's id prefix). */
  name: string;
}

/** A deal-docs path inside this deal's folder, and whether it's in the shared view. */
export function parseDocPath(path: string, dealId: string): DocPath | null {
  if (typeof path !== "string" || path.length > 400) return null;
  const prefix = `deal/${dealId}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  const staff = new RegExp(`^staff/(?:${UUID}-)?([^/]{1,240})$`).exec(rest);
  if (staff) return { shared: false, name: staff[1]! };
  if (/^[^/]{1,240}$/.test(rest) && !rest.startsWith(".")) return { shared: true, name: rest };
  return null;
}

/** "Report.pdf", or "Report (2).pdf" if that's taken. */
export function freeName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  const m = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(name)!;
  for (let i = 2; i < 1000; i++) {
    const next = `${m[1]} (${i})${m[2] ?? ""}`;
    if (!used.has(next)) return next;
  }
  return `${m[1]} (${Date.now()})${m[2] ?? ""}`;
}

export const receiptFolder = (dealId: string, profileId: string) => `deal/${dealId}/uploads/${profileId}`;

/** A receipt upload in the caller's own folder on this deal. */
export function isOwnReceiptUpload(path: string, dealId: string, profileId: string): boolean {
  return typeof path === "string" && new RegExp(`^deal/${dealId}/uploads/${profileId}/${UUID}\\.(pdf|jpg|png|webp)$`).test(path);
}

// --- Missing documents across deals (Today, the briefing) ------------------------------------------

export interface DealDocsRows {
  deals: { id: string; address: string; seller_type: SellerType }[];
  docs: { deal_id: string; doc_types: string[] }[];
  memberDocs: { deal_id: string; doc_types: string[] }[];
  marks: { deal_id: string; item_key: string }[];
}

export interface DealMissing {
  id: string;
  address: string;
  missing: string[];
  total: number;
}

/** Each deal's missing checklist items (labels), in checklist order. Deals with none are left out. */
export function missingByDeal(rows: DealDocsRows): DealMissing[] {
  return rows.deals
    .map((d) => {
      const files = [...rows.docs, ...rows.memberDocs].filter((f) => f.deal_id === d.id).map((f, i) => ({ id: String(i), name: "", doc_types: f.doc_types }));
      const marks: ChecklistMark[] = rows.marks.filter((m) => m.deal_id === d.id).map((m) => ({ item_key: m.item_key, note: null }));
      const c = checklistFor(d.seller_type, files, marks);
      return { id: d.id, address: d.address, missing: c.rows.filter((r) => r.status === "missing").map((r) => r.label), total: c.total };
    })
    .filter((d) => d.missing.length > 0);
}

/**
 * Reads what missingByDeal needs for these deals, as the signed-in person
 * (RLS decides). Empty when the documents tables aren't there yet (the console
 * can deploy before migration 0032 is applied).
 */
export async function loadMissing(supabase: SupabaseDb, deals: DealDocsRows["deals"]): Promise<DealMissing[]> {
  if (!deals.length) return [];
  const ids = deals.map((d) => d.id);
  const [{ data: docs, error }, { data: memberDocs }, { data: marks }] = await Promise.all([
    supabase.from("deal_documents").select("deal_id, doc_types").in("deal_id", ids),
    supabase.from("deal_member_document_types").select("deal_id, doc_types").in("deal_id", ids),
    supabase.from("deal_checklist_marks").select("deal_id, item_key").in("deal_id", ids),
  ]);
  if (error) return [];
  return missingByDeal({ deals, docs: docs ?? [], memberDocs: memberDocs ?? [], marks: marks ?? [] });
}

// --- Check unchecked documents (S6b PR 7c) ---------------------------------------------------------

export interface UncheckedFile {
  source: "deal" | "member";
  id: string;
  name: string;
}

/** Most files a "Check unchecked documents" click sends: one assistant request each. */
export const CHECK_BATCH = 10;

/**
 * Files never checked (0034's checked_at is null), the deal's own and the
 * seller's uploads together, oldest first. `total` is how many are unchecked;
 * `next` is the batch the next click checks.
 */
export function uncheckedList(
  docs: { id: string; file_name: string; created_at: string; checked_at: string | null }[],
  memberDocs: { id: string; name: string; created_at: string; checked_at: string | null }[],
  max = CHECK_BATCH,
): { total: number; next: UncheckedFile[] } {
  const all = [
    ...docs.filter((d) => !d.checked_at).map((d) => ({ source: "deal" as const, id: d.id, name: d.file_name, at: d.created_at })),
    ...memberDocs.filter((d) => !d.checked_at).map((d) => ({ source: "member" as const, id: d.id, name: d.name, at: d.created_at })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  return { total: all.length, next: all.slice(0, max).map(({ source, id, name }) => ({ source, id, name })) };
}

export type CheckSigned = "yes" | "no" | "unclear" | "not_applicable";

export const SIGNED_LABEL: Record<CheckSigned, string> = {
  yes: "Signed where it should be",
  no: "Not signed where it should be",
  unclear: "Signatures unclear",
  not_applicable: "No signatures expected",
};

/** "Checked Wed, Nov 12 by Avery Example: signatures unclear, 2 things to look at", or "Not checked yet". */
export function checkedLine(c: { checked_at: string | null; check_signed: string | null; check_issue_count: number | null }, by: string, fmt: (iso: string) => string): string {
  if (!c.checked_at) return "Not checked yet";
  const signed = SIGNED_LABEL[c.check_signed as CheckSigned] ?? "Signatures unclear";
  const n = c.check_issue_count ?? 0;
  return `Checked ${fmt(c.checked_at.slice(0, 10))} by ${by}: ${signed.toLowerCase()}, ${n ? `${n} ${n === 1 ? "thing" : "things"} to look at` : "nothing to look at"}`;
}
