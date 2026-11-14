"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { DOC_TYPE_KEYS, STAFF_ROLES, getProfile } from "@vabrato/lib";
import { DRIVE_ID, DROPBOX_ID, dropboxListFolder, DropboxReconnectError } from "@vabrato/lib/integrations";
import { fileDealDocumentAction, prepareReceiptUploadAction } from "@/lib/document-actions";
import { EXT, MAX_DOC_BYTES, MAX_RECEIPT_BYTES, checkDealFile, checkReceiptFile, safeFileName, staffDocPath } from "@/lib/documents";
import { driveToken, dropboxToken, fetchFile, ImportNotReady, NOT_READY_TEXT, pickerSettings, refFor, type ImportSource } from "@/lib/imports";
import { supabaseServer } from "@/lib/supabase-server";

// Import from Google Drive or Dropbox into a deal (Integrations PR 2). Staff
// who work the deal only (RLS on the deal, the rows and storage). Each file
// is fetched on the server and goes through the same checks as an upload;
// documents are filed staff-only, a receipt fills the receipt form.

const MAX_IMPORT = 10;
type Fail = { ok: false; error: string };

async function staffDeal(dealId: string) {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  if (typeof dealId !== "string" || !/^[0-9a-f-]{36}$/.test(dealId)) throw new Error("No such deal");
  const { data: deal } = await supabase.from("deals").select("id").eq("id", dealId).maybeSingle();
  if (!deal) throw new Error("No such deal");
  return { supabase, profile };
}

const notReady = (e: unknown, where: string): Fail => {
  if (e instanceof ImportNotReady) return { ok: false, error: `${where}: ${NOT_READY_TEXT[e.reason]}` };
  return { ok: false, error: `${where} couldn't be reached. Try again in a few minutes.` };
};
const validId = (source: ImportSource, id: unknown): id is string => typeof id === "string" && (source === "drive" ? DRIVE_ID : DROPBOX_ID).test(id);
const WHERE: Record<ImportSource, string> = { drive: "Google Drive", dropbox: "Dropbox" };

/** For Google's picker: a 1-hour token limited to drive.file, the browser key and the app id. */
export async function drivePickerTokenAction(dealId: string): Promise<{ ok: true; token: string; apiKey: string; appId: string; scriptUrl: string } | Fail> {
  const { profile } = await staffDeal(dealId);
  const picker = pickerSettings();
  if (!picker) return { ok: false, error: `Google Drive: ${NOT_READY_TEXT.off}` };
  try {
    const { token } = await driveToken(profile.id, true);
    return { ok: true, token, ...picker };
  } catch (e) {
    return notReady(e, "Google Drive");
  }
}

/** Refs already imported to this deal, as documents or as receipts. */
async function importedRefs(supabase: Awaited<ReturnType<typeof supabaseServer>>, dealId: string, target: "documents" | "receipt"): Promise<Set<string>> {
  const { data } =
    target === "documents"
      ? await supabase.from("deal_documents").select("external_ref").eq("deal_id", dealId).not("external_ref", "is", null)
      : await supabase.from("receipts").select("external_ref").eq("deal_id", dealId).not("external_ref", "is", null);
  return new Set((data ?? []).map((r) => r.external_ref as string));
}

export interface DropboxEntry {
  id: string;
  name: string;
  size: number;
  modified: string;
  imported: boolean;
}

/** The files in Apps/Vabrato, newest first, with those already imported to this deal marked. */
export async function listDropboxAction(dealId: string, target: "documents" | "receipt"): Promise<{ ok: true; files: DropboxEntry[]; more: boolean } | Fail> {
  const { supabase, profile } = await staffDeal(dealId);
  try {
    const auth = await dropboxToken(profile.id);
    const [{ files, more }, done] = await Promise.all([dropboxListFolder(auth.setup, auth.token), importedRefs(supabase, dealId, target === "receipt" ? "receipt" : "documents")]);
    return { ok: true, more, files: files.map((f) => ({ ...f, imported: done.has(refFor("dropbox", f.id)) })) };
  } catch (e) {
    if (e instanceof DropboxReconnectError) return notReady(new ImportNotReady("reconnect"), "Dropbox");
    return notReady(e, "Dropbox");
  }
}

export interface ImportLine {
  name: string;
  ok: boolean;
  text: string;
}

async function authFor(source: ImportSource, profileId: string) {
  return source === "drive" ? driveToken(profileId, false) : dropboxToken(profileId);
}

/** Imports up to MAX_IMPORT files as staff-only documents, each with the chosen type (optional). */
export async function importDocumentsAction(dealId: string, source: ImportSource, ids: string[], docType: string): Promise<{ ok: true; lines: ImportLine[] } | Fail> {
  const { supabase, profile } = await staffDeal(dealId);
  if (source !== "drive" && source !== "dropbox") return { ok: false, error: "Pick where to import from." };
  const picked = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => validId(source, id));
  if (!picked.length) return { ok: false, error: "Pick at least one file." };
  if (picked.length > MAX_IMPORT) return { ok: false, error: `Import up to ${MAX_IMPORT} files at a time.` };
  const types = (DOC_TYPE_KEYS as readonly string[]).includes(docType) ? [docType] : [];
  let auth;
  try {
    auth = await authFor(source, profile.id);
  } catch (e) {
    return notReady(e, WHERE[source]);
  }
  const done = await importedRefs(supabase, dealId, "documents");
  const lines: ImportLine[] = [];
  for (const id of picked) {
    const ref = refFor(source, id);
    if (done.has(ref)) {
      lines.push({ name: "That file", ok: false, text: "Already imported to this deal." });
      continue;
    }
    let got;
    try {
      got = await fetchFile(source, auth, id, MAX_DOC_BYTES);
    } catch (e) {
      return notReady(e, WHERE[source]);
    }
    if (!got.ok) {
      lines.push({ name: got.name, ok: false, text: got.error });
      continue;
    }
    const checked = checkDealFile(got.bytes.length, got.bytes.subarray(0, 12));
    if ("error" in checked) {
      lines.push({ name: got.name, ok: false, text: checked.error });
      continue;
    }
    const path = staffDocPath(dealId, randomUUID(), safeFileName(got.name, checked.type));
    const { error: upErr } = await supabase.storage.from("deal-docs").upload(path, got.bytes, { contentType: checked.type, upsert: false });
    if (upErr) {
      lines.push({ name: got.name, ok: false, text: "Couldn't save the file. Try again." });
      continue;
    }
    const filed = await fileDealDocumentAction(dealId, path, types, got.name, ref);
    if (!filed.ok) await supabase.storage.from("deal-docs").remove([path]).catch(() => undefined);
    lines.push({ name: got.name, ok: filed.ok, text: filed.ok ? "Imported, staff-only until you share it." : filed.error });
    if (filed.ok) done.add(ref);
  }
  revalidatePath(`/deals/${dealId}/documents`);
  return { ok: true, lines };
}

/** Imports one file for the receipt form: stored in the person's own receipt folder for this deal. */
export async function importReceiptFileAction(dealId: string, source: ImportSource, id: string): Promise<{ ok: true; path: string; ref: string; name: string } | Fail> {
  const { supabase, profile } = await staffDeal(dealId);
  if ((source !== "drive" && source !== "dropbox") || !validId(source, id)) return { ok: false, error: "Pick a file." };
  const ref = refFor(source, id);
  if ((await importedRefs(supabase, dealId, "receipt")).has(ref)) return { ok: false, error: "That file is already a receipt on this deal." };
  let got;
  try {
    got = await fetchFile(source, await authFor(source, profile.id), id, MAX_RECEIPT_BYTES);
  } catch (e) {
    return notReady(e, WHERE[source]);
  }
  if (!got.ok) return { ok: false, error: got.error };
  const checked = checkReceiptFile(got.bytes.length, got.bytes.subarray(0, 12));
  if ("error" in checked) return { ok: false, error: checked.error };
  const { folder } = await prepareReceiptUploadAction(dealId);
  const path = `${folder}/${randomUUID()}.${EXT[checked.type]}`;
  const { error } = await supabase.storage.from("receipts").upload(path, got.bytes, { contentType: checked.type, upsert: false });
  if (error) return { ok: false, error: "Couldn't save the receipt file. Try again." };
  return { ok: true, path, ref, name: got.name };
}
