"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { runAi } from "@vabrato/ai";
import type { SellerType } from "@vabrato/db";
import { STAFF_ROLES, checklistKeys, cleanDocTypes, getProfile, todayISO } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { DOCUMENT_CHECK, RECEIPT_READER, checkInput, receiptInput, toCheckResult, toReceiptProposal, type CheckResult, type ReceiptProposal } from "@/lib/document-check";
import { MAX_DOC_BYTES, checkDealFile, checkReceiptFile, freeName, isOwnReceiptUpload, parseDocPath, receiptFolder, sniffType, staffDocPath } from "@/lib/documents";
import { supabaseServer } from "@/lib/supabase-server";

// Deal documents and receipts (S6b PR 7a). Every read and write runs as the
// signed-in person, so RLS (0032) decides: staff with access to the deal.
// Files go straight from the browser to storage; these actions record them,
// move them between the staff folder and the seller's view, and run the two
// assistant features through packages/ai.

export type DocActionResult = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): DocActionResult => ({ ok: false, error });

async function staffDeal(dealId: string) {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  if (typeof dealId !== "string" || !/^[0-9a-f-]{36}$/.test(dealId)) throw new Error("No such deal");
  const { data: deal } = await supabase.from("deals").select("id, seller_type").eq("id", dealId).maybeSingle();
  if (!deal) throw new Error("No such deal");
  return { supabase, profile, deal: deal as { id: string; seller_type: SellerType } };
}

const refresh = (dealId: string) => {
  revalidatePath(`/deals/${dealId}/documents`);
  revalidatePath("/");
};

// --- Filing, types, sharing, deleting ---------------------------------------------------------------

/**
 * Records a file that is already in this deal's folder (just uploaded to
 * staff/, or left unfiled): checks its real type and size, then adds the row.
 */
export async function fileDealDocumentAction(dealId: string, path: string, docTypes: string[]): Promise<DocActionResult> {
  const { supabase, profile } = await staffDeal(dealId);
  const where = parseDocPath(path, dealId);
  if (!where) return fail("That file isn't in this deal's folder. Upload it again.");
  const { data: file, error } = await supabase.storage.from("deal-docs").download(path);
  if (error || !file) return fail("Couldn't open the uploaded file. Upload it again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkDealFile(bytes.length, bytes.subarray(0, 12));
  if ("error" in checked) return fail(checked.error);
  const { error: insErr } = await supabase.from("deal_documents").insert({
    deal_id: dealId,
    path,
    file_name: where.name.slice(0, 200),
    size_bytes: bytes.length,
    content_type: checked.type,
    doc_types: cleanDocTypes(docTypes ?? []),
    shared: where.shared,
    uploaded_by: profile.id,
  });
  if (insErr) return fail(insErr.code === "23505" ? "That file is already filed." : "Couldn't file the document. Try again.");
  refresh(dealId);
  return { ok: true, message: `Filed ${where.name}.` };
}

export async function setDocTypesAction(dealId: string, docId: string, docTypes: string[]): Promise<DocActionResult> {
  const { supabase } = await staffDeal(dealId);
  const { data, error } = await supabase.from("deal_documents").update({ doc_types: cleanDocTypes(docTypes ?? []) }).eq("id", docId).eq("deal_id", dealId).select("id");
  if (error || !data?.length) return fail("Couldn't save the types. Try again.");
  refresh(dealId);
  return { ok: true, message: "Types saved." };
}

/** Types for one of the seller's own uploads, for this deal. */
export async function setMemberDocTypesAction(dealId: string, memberDocId: string, docTypes: string[]): Promise<DocActionResult> {
  const { supabase, profile } = await staffDeal(dealId);
  const types = cleanDocTypes(docTypes ?? []);
  const { data: updated, error } = await supabase
    .from("deal_member_document_types")
    .update({ doc_types: types, updated_by: profile.id })
    .eq("deal_id", dealId)
    .eq("member_document_id", memberDocId)
    .select("deal_id");
  if (error) return fail("Couldn't save the types. Try again.");
  if (!updated?.length) {
    const { error: insErr } = await supabase.from("deal_member_document_types").insert({ deal_id: dealId, member_document_id: memberDocId, doc_types: types, updated_by: profile.id });
    if (insErr) return fail("Couldn't save the types. Try again.");
  }
  refresh(dealId);
  return { ok: true, message: "Types saved." };
}

/** Moves a document between the staff folder and the seller's view (copy, record, then remove the old copy). */
export async function setSharedAction(dealId: string, docId: string, share: boolean): Promise<DocActionResult> {
  const { supabase } = await staffDeal(dealId);
  const { data: doc } = await supabase.from("deal_documents").select("id, path, shared").eq("id", docId).eq("deal_id", dealId).maybeSingle();
  if (!doc) return fail("That document isn't here any more.");
  if (doc.shared === share) return { ok: true, message: share ? "Already shared with the seller." : "Already staff-only." };
  const where = parseDocPath(doc.path, dealId);
  if (!where) return fail("That document's file is in an unexpected place.");
  const bucket = supabase.storage.from("deal-docs");
  let dest: string;
  if (share) {
    const { data: top } = await bucket.list(`deal/${dealId}`, { limit: 1000 });
    dest = `deal/${dealId}/${freeName(where.name, (top ?? []).filter((f) => f.id).map((f) => f.name))}`;
  } else {
    dest = staffDocPath(dealId, randomUUID(), where.name);
  }
  const { error: copyErr } = await bucket.copy(doc.path, dest);
  if (copyErr) return fail("Couldn't move the file. Try again.");
  const { error: updErr } = await supabase.from("deal_documents").update({ path: dest, shared: share }).eq("id", docId);
  if (updErr) {
    await bucket.remove([dest]);
    return fail("Couldn't move the file. Try again.");
  }
  await bucket.remove([doc.path]);
  refresh(dealId);
  return { ok: true, message: share ? `Shared ${where.name} with the seller. It's in their Documents page now.` : `${where.name} is staff-only again; the seller no longer sees it.` };
}

export async function deleteDealDocumentAction(dealId: string, docId: string): Promise<DocActionResult> {
  const { supabase } = await staffDeal(dealId);
  const { data: doc } = await supabase.from("deal_documents").select("id, path").eq("id", docId).eq("deal_id", dealId).maybeSingle();
  if (!doc) return fail("That document isn't here any more.");
  const { error } = await supabase.storage.from("deal-docs").remove([doc.path]);
  if (error) return fail("Couldn't delete the file. Try again.");
  await supabase.from("deal_documents").delete().eq("id", docId);
  refresh(dealId);
  return { ok: true, message: "Deleted." };
}

/** Removes a file in the deal's folder that was never filed. */
export async function deleteUnfiledAction(dealId: string, path: string): Promise<DocActionResult> {
  const { supabase } = await staffDeal(dealId);
  if (!parseDocPath(path, dealId)) return fail("That file isn't in this deal's folder.");
  const { data: row } = await supabase.from("deal_documents").select("id").eq("path", path).maybeSingle();
  if (row) return fail("That file is filed; delete it from the list instead.");
  const { error } = await supabase.storage.from("deal-docs").remove([path]);
  if (error) return fail("Couldn't delete the file. Try again.");
  refresh(dealId);
  return { ok: true, message: "Deleted." };
}

// --- Checklist marks ----------------------------------------------------------------------------

export async function markNotNeededAction(dealId: string, itemKey: string, note: string): Promise<DocActionResult> {
  const { supabase, profile, deal } = await staffDeal(dealId);
  if (!checklistKeys(deal.seller_type).includes(itemKey)) return fail("That isn't on this deal's checklist.");
  const clean = String(note ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  const { error } = await supabase.from("deal_checklist_marks").insert({ deal_id: dealId, item_key: itemKey, note: clean, marked_by: profile.id });
  if (error && error.code !== "23505") return fail("Couldn't save. Try again.");
  refresh(dealId);
  return { ok: true, message: "Marked not needed." };
}

export async function clearMarkAction(dealId: string, itemKey: string): Promise<DocActionResult> {
  const { supabase } = await staffDeal(dealId);
  const { error } = await supabase.from("deal_checklist_marks").delete().eq("deal_id", dealId).eq("item_key", itemKey);
  if (error) return fail("Couldn't undo. Try again.");
  refresh(dealId);
  return { ok: true, message: "Back on the checklist." };
}

// --- Check this document (assistant) --------------------------------------------------------------

export type CheckDocResult = { ok: true; result: CheckResult } | { ok: false; error: string };

/** Sends one of this deal's files (or one of its seller's uploads) to the assistant. Nothing is stored. */
export async function checkDocumentAction(dealId: string, source: "deal" | "member", id: string): Promise<CheckDocResult> {
  const { supabase, deal } = await staffDeal(dealId);
  try {
    if (!aiKeyConfigured()) return { ok: false, error: "The assistant isn't set up yet: it has no API key. Ask an admin." };
    let bucket: "deal-docs" | "member-docs";
    let path: string;
    if (source === "deal") {
      const { data } = await supabase.from("deal_documents").select("path").eq("id", id).eq("deal_id", dealId).maybeSingle();
      if (!data) return { ok: false, error: "That document isn't here any more." };
      bucket = "deal-docs";
      path = data.path;
    } else {
      const { data } = await supabase.from("member_documents").select("storage_path, profile_id").eq("id", id).maybeSingle();
      const { data: seller } = data ? await supabase.from("deal_members").select("profile_id").eq("deal_id", dealId).eq("profile_id", data.profile_id).eq("member_role", "seller").maybeSingle() : { data: null };
      if (!data || !seller) return { ok: false, error: "That upload isn't one of this sale's seller's." };
      bucket = "member-docs";
      path = data.storage_path;
    }
    const { data: file, error } = await supabase.storage.from(bucket).download(path);
    if (error || !file) return { ok: false, error: "Couldn't open the file. Try again." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = sniffType(bytes.subarray(0, 12));
    if (!type) return { ok: false, error: "The assistant reads PDFs, JPGs, PNGs and WebP images only." };
    if (bytes.length > MAX_DOC_BYTES) return { ok: false, error: "The file is too large for the assistant (20 MB at most)." };

    const result = await runAi(aiDeps(supabase), DOCUMENT_CHECK, { parts: checkInput(deal.seller_type, { type, base64: bytes.toString("base64") }), dealId });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    return { ok: true, result: toCheckResult(result.data) };
  } catch (e) {
    console.error("[checkDocument]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong checking the document. Try again." };
  }
}

// --- Receipts -------------------------------------------------------------------------------------

/**
 * Removes the caller's receipt uploads on this deal that no receipt uses and
 * that are over an hour old (a form left without saving). Best effort.
 */
async function sweepReceiptUploads(supabase: Awaited<ReturnType<typeof supabaseServer>>, dealId: string, profileId: string) {
  try {
    const folder = receiptFolder(dealId, profileId);
    const bucket = supabase.storage.from("receipts");
    const { data: files } = await bucket.list(folder, { limit: 200 });
    if (!files?.length) return;
    const { data: used } = await supabase.from("receipts").select("storage_path").eq("deal_id", dealId).like("storage_path", `${folder}/%`);
    const keep = new Set((used ?? []).map((r) => r.storage_path));
    const hourAgo = Date.now() - 3_600_000;
    const stale = files.filter((f) => f.id && !keep.has(`${folder}/${f.name}`) && Date.parse(f.created_at ?? "") < hourAgo).map((f) => `${folder}/${f.name}`);
    if (stale.length) await bucket.remove(stale);
  } catch {
    // Tried again on the next upload.
  }
}

export type ReadReceiptResult = { ok: true; proposal: ReceiptProposal } | { ok: false; error: string };

/** Reads a receipt the caller just uploaded into their own folder on this deal. The file stays for the receipt. */
export async function readReceiptAction(dealId: string, path: string): Promise<ReadReceiptResult> {
  const { supabase, profile } = await staffDeal(dealId);
  if (!isOwnReceiptUpload(path, dealId, profile.id)) return { ok: false, error: "Upload the receipt again." };
  await sweepReceiptUploads(supabase, dealId, profile.id);
  try {
    if (!aiKeyConfigured()) return { ok: false, error: "The assistant isn't set up yet: it has no API key. Ask an admin." };
    const { data: file, error } = await supabase.storage.from("receipts").download(path);
    if (error || !file) return { ok: false, error: "Couldn't open the receipt. Upload it again." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const checked = checkReceiptFile(bytes.length, bytes.subarray(0, 12));
    if ("error" in checked) return { ok: false, error: checked.error };
    const result = await runAi(aiDeps(supabase), RECEIPT_READER, { parts: receiptInput({ type: checked.type, base64: bytes.toString("base64") }), dealId });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Fill in the form by hand." };
    return { ok: true, proposal: toReceiptProposal(result.data, todayISO()) };
  } catch (e) {
    console.error("[readReceipt]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong reading the receipt. Fill in the form by hand, or try again." };
  }
}

/** Tidies the caller's old unsaved uploads before a new one (called by the receipt form). */
export async function prepareReceiptUploadAction(dealId: string): Promise<{ folder: string }> {
  const { supabase, profile } = await staffDeal(dealId);
  await sweepReceiptUploads(supabase, dealId, profile.id);
  return { folder: receiptFolder(dealId, profile.id) };
}
