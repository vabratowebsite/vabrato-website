import type { InputPart } from "@vabrato/ai";
import { countPdfPages, type SupabaseDb } from "@vabrato/lib";
import { DEAL_DOC_PATH, MAX_DOCUMENT_BYTES, sniffDocumentType } from "../documents";

// Ask Vabrato's file loading (S5b PR 2). A member's document is read with the
// member's own client, so RLS and the storage policies decide: another
// member's id or path simply isn't found. Every check runs before the
// pipeline's ai_begin, so a refused file doesn't use up a request.

/** Owner decision 2026-11-13: 50 pages at most per document. */
export const MEMBER_PAGE_LIMIT = 50;
/** A PDF whose pages can't be counted (compressed object streams) is read only up to this size. */
export const UNCOUNTED_PDF_MAX_BYTES = 6 * 1024 * 1024;

export type DocRef = { kind: "upload"; id: string } | { kind: "deal"; path: string; dealId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "upload:<id>" or "deal:<path>" (from a link or the page's list); null if it isn't one. */
export function parseDocRef(value: unknown): DocRef | null {
  const s = String(value ?? "");
  if (s.startsWith("upload:")) {
    const id = s.slice(7);
    return UUID.test(id) ? { kind: "upload", id } : null;
  }
  if (s.startsWith("deal:")) {
    const path = s.slice(5);
    return DEAL_DOC_PATH.test(path) && !path.includes("..") ? { kind: "deal", path, dealId: path.split("/")[1]! } : null;
  }
  return null;
}

export const FILE_MESSAGES = {
  notFound: "We couldn't find that document. It may have been removed.",
  heic: "Ask Vabrato can't read iPhone photos (HEIC). Upload it as a PDF or JPG, or ask your agent.",
  unreadable: "Ask Vabrato reads PDFs, JPGs, PNGs and WebP images only.",
  tooBig: "This file is larger than 20 MB, so Ask Vabrato can't read it. Your agent can help with it.",
  tooLong: (pages: number) => `This document has ${pages} pages. Ask Vabrato reads up to ${MEMBER_PAGE_LIMIT}; your agent can help with longer ones.`,
  uncounted: `We couldn't check how long this PDF is, and it's large. Ask Vabrato reads up to ${MEMBER_PAGE_LIMIT} pages; your agent can help with it.`,
} as const;

export interface MemberFile {
  name: string;
  /** Pages, when known (1 for an image). */
  pages: number | null;
  part: InputPart;
  dealId: string | null;
}

export type LoadResult = { ok: true; file: MemberFile } | { ok: false; error: string };

/** Checks one file's bytes: type, size, length. Pure; the loader and tests use it. */
export function checkFileBytes(bytes: Uint8Array, name: string, dealId: string | null): LoadResult {
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, error: FILE_MESSAGES.tooBig };
  const type = sniffDocumentType(bytes.subarray(0, 16));
  if (type === "image/heic") return { ok: false, error: FILE_MESSAGES.heic };
  if (!type) return { ok: false, error: FILE_MESSAGES.unreadable };
  const data = Buffer.from(bytes).toString("base64");
  if (type !== "application/pdf") return { ok: true, file: { name, pages: 1, dealId, part: { type: "image", mediaType: type, data } } };
  const pages = countPdfPages(bytes);
  if (pages !== null && pages > MEMBER_PAGE_LIMIT) return { ok: false, error: FILE_MESSAGES.tooLong(pages) };
  if (pages === null && bytes.length > UNCOUNTED_PDF_MAX_BYTES) return { ok: false, error: FILE_MESSAGES.uncounted };
  return { ok: true, file: { name, pages, dealId, part: { type: "pdf", data, title: name.slice(0, 120) } } };
}

export async function loadMemberFile(supabase: SupabaseDb, ref: DocRef): Promise<LoadResult> {
  if (ref.kind === "upload") {
    const { data: row } = await supabase.from("member_documents").select("name, storage_path, content_type, size_bytes").eq("id", ref.id).maybeSingle();
    if (!row) return { ok: false, error: FILE_MESSAGES.notFound };
    // Known from the row: refuse before downloading anything.
    if (row.content_type === "image/heic") return { ok: false, error: FILE_MESSAGES.heic };
    if (row.size_bytes > MAX_DOCUMENT_BYTES) return { ok: false, error: FILE_MESSAGES.tooBig };
    const { data: blob } = await supabase.storage.from("member-docs").download(row.storage_path);
    if (!blob) return { ok: false, error: FILE_MESSAGES.notFound };
    return checkFileBytes(new Uint8Array(await blob.arrayBuffer()), row.name, null);
  }
  // A deal file the transaction desk shared: the storage policy lets a member
  // read top-level files of a deal they're on, and nothing else.
  const { data: blob } = await supabase.storage.from("deal-docs").download(ref.path);
  if (!blob) return { ok: false, error: FILE_MESSAGES.notFound };
  return checkFileBytes(new Uint8Array(await blob.arrayBuffer()), ref.path.split("/").pop()!, ref.dealId);
}
