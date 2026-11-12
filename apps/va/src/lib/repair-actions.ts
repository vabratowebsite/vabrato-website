"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pdfPageLimit, runAi } from "@vabrato/ai";
import { STAFF_ROLES, computeCoe, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { MAX_DOC_BYTES, countPdfPages, sniffType } from "@/lib/documents";
import { prepareNote } from "@/lib/drafts";
import { DECISIONS, MAX_ITEMS, SEVERITIES, TRADES, composeLetter, decisionProblems, type DecisionRow, type ItemsContent, type RepairItem, type ResponseContent } from "@/lib/repair-kinds";
import { INSPECTION_ITEMS, REPAIR_RESPONSE, cleanItemText, itemsInput, itemsProblems, responseInput, responseProblems, toItems } from "@/lib/repairs";
import { supabaseServer } from "@/lib/supabase-server";

// S6b PR 7b: repair items, the bid list and the response to the buyer's
// request. Every read and write runs as the signed-in person: the 0028
// policies let staff with access to the deal start and change their own
// drafts. The report is read from the deal's own documents, inline, for that
// request only (SPEC <ai_rules>); nothing from it is kept except the items
// the agent approves.

export type RepairResult = { ok: true; id: string; message: string } | { ok: false; error: string; problems?: string[] };
const fail = (error: string, problems?: string[]): RepairResult => ({ ok: false, error, ...(problems ? { problems } : {}) });
const NO_KEY = "The assistant isn't set up yet: it has no API key. Ask an admin.";
const INSPECTION_TYPES = ["home_inspection", "pest_inspection"];
const Id = z.string().uuid();

async function staffDeal(dealId: string) {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  if (!Id.safeParse(dealId).success) throw new Error("No such deal");
  const { data: deal } = await supabase.from("deals").select("id, address, ratification_date, days_to_close").eq("id", dealId).maybeSingle();
  if (!deal) throw new Error("No such deal");
  return { supabase, profile, deal };
}

const refresh = (dealId: string, id?: string) => {
  revalidatePath(`/deals/${dealId}/repairs`);
  if (id) revalidatePath(`/deals/${dealId}/repairs/${id}`);
  revalidatePath("/assistant");
};

// --- Repair items -------------------------------------------------------------------------------------

/**
 * Reads one of this deal's inspection reports into repair items. The
 * document must be a deal_documents row on this deal, typed as a home or
 * pest inspection (MUST 6). One open list per report: if there is one, it's
 * returned instead of reading the report again.
 */
export async function startRepairItemsAction(dealId: string, documentId: string): Promise<RepairResult> {
  const { supabase } = await staffDeal(dealId);
  if (!Id.safeParse(documentId).success) return fail("That document isn't on this transaction.");
  const { data: doc } = await supabase.from("deal_documents").select("id, deal_id, path, file_name, doc_types").eq("id", documentId).eq("deal_id", dealId).maybeSingle();
  if (!doc) return fail("That document isn't on this transaction.");
  if (!doc.doc_types.some((t: string) => INSPECTION_TYPES.includes(t))) return fail("Set this document's type to a home or pest inspection report first.");
  const { data: open } = await supabase.from("ai_drafts").select("id").eq("kind", "inspection_items").eq("deal_id", dealId).eq("status", "draft").eq("content->>document_id", documentId).maybeSingle();
  if (open) return { ok: true, id: open.id, message: "This report already has a list in progress." };
  try {
    if (!aiKeyConfigured()) return fail(NO_KEY);
    const { data: file, error } = await supabase.storage.from("deal-docs").download(doc.path);
    if (error || !file) return fail("Couldn't open the report. Try again.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = sniffType(bytes.subarray(0, 12));
    if (type !== "application/pdf" && type !== "image/jpeg" && type !== "image/png") return fail("The assistant reads PDF, JPG or PNG reports only.");
    if (bytes.length > MAX_DOC_BYTES) return fail("The report is too large for the assistant (20 MB at most).");
    const pages = type === "application/pdf" ? countPdfPages(bytes) : null;
    if (pages !== null && pages > pdfPageLimit()) return fail(`This report has ${pages} pages; the assistant reads up to ${pdfPageLimit()}. Split this file and read the parts.`);

    const result = await runAi(aiDeps(supabase), INSPECTION_ITEMS, { parts: itemsInput({ type, base64: bytes.toString("base64") }), dealId });
    if (!result.ok) return fail(result.message);
    if (!result.data) return fail("The assistant's answer wasn't usable. Please try again.");
    const { items, may_be_incomplete } = toItems(result.data, randomUUID);
    if (!items.length) return fail("The assistant didn't find repair items in this report.");
    const content: ItemsContent = { document_id: doc.id, document_name: doc.file_name, items, may_be_incomplete };
    const { data: saved, error: insErr } = await supabase
      .from("ai_drafts")
      .insert({ kind: "inspection_items", deal_id: dealId, subject: `Repair items: ${doc.file_name}`.slice(0, 200), body: `${items.length} repair items from ${doc.file_name}`.slice(0, 8000), content: content as never })
      .select("id")
      .single();
    if (insErr || !saved) {
      if (insErr?.code === "23505") return fail("Someone started a list for this report a moment ago. Reload the page.");
      return fail("Couldn't save the items. Please try again.");
    }
    refresh(dealId, saved.id);
    return { ok: true, id: saved.id, message: may_be_incomplete ? `Found ${items.length} items. The report may have more: check it.` : `Found ${items.length} items. Check each one, edit, then approve the list.` };
  } catch (e) {
    console.error("[repairItems]", e instanceof Error ? e.message : "failed");
    return fail("Something went wrong reading the report. Please try again.");
  }
}

const ItemInput = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(400),
  detail: z.string().max(1000),
  location: z.string().max(300),
  severity: z.enum(SEVERITIES),
  severity_label: z.string().max(200),
  trade: z.enum(TRADES.map((t) => t.key) as [string, ...string[]]),
  page: z.number().int().min(1).max(5000).nullable(),
  added: z.boolean().optional(),
});

/** The agent's edits, tidied (lengths, one line each; new rows get a stable id). */
function cleanEdited(items: unknown): RepairItem[] | null {
  const parsed = z.array(ItemInput).max(MAX_ITEMS * 2).safeParse(items);
  if (!parsed.success) return null;
  return parsed.data.map((i) => ({
    id: /^[0-9a-f-]{36}$/.test(i.id) ? i.id : randomUUID(),
    title: i.title.replace(/\s+/g, " ").trim().slice(0, 120),
    detail: i.detail.replace(/\s+/g, " ").trim().slice(0, 300),
    location: i.location.replace(/\s+/g, " ").trim().slice(0, 80),
    severity: i.severity,
    severity_label: i.severity_label.replace(/\s+/g, " ").trim().slice(0, 40),
    trade: i.trade as RepairItem["trade"],
    page: i.page,
    ...(i.added ? { added: true } : {}),
  }));
}

async function loadItems(supabase: Awaited<ReturnType<typeof supabaseServer>>, dealId: string, id: string) {
  if (!Id.safeParse(id).success) return null;
  const { data } = await supabase.from("ai_drafts").select("id, status, owner_id, content, approved_at").eq("id", id).eq("kind", "inspection_items").eq("deal_id", dealId).maybeSingle();
  return data as { id: string; status: string; owner_id: string; content: ItemsContent; approved_at: string | null } | null;
}

/** Saves the edited list; with approve, checks it (MUST 13) and approves it, which freezes it. */
export async function saveItemsAction(dealId: string, id: string, items: unknown, approve: boolean): Promise<RepairResult> {
  const { supabase } = await staffDeal(dealId);
  const draft = await loadItems(supabase, dealId, id);
  if (!draft) return fail("That list isn't here any more.");
  if (draft.status !== "draft") return fail("This list is approved. Use Revise to change it.");
  const cleaned = cleanEdited(items);
  if (!cleaned) return fail("Something in the list isn't valid. Reload the page and try again.");
  const content: ItemsContent = { ...draft.content, items: cleaned };
  if (approve) {
    const problems = itemsProblems(cleaned);
    if (problems.length) return fail("Fix these before approving:", problems);
  }
  const { error } = await supabase
    .from("ai_drafts")
    .update({ content: content as never, body: `${cleaned.length} repair items from ${draft.content.document_name}`.slice(0, 8000), ...(approve ? { status: "approved" } : {}) })
    .eq("id", id);
  if (error) return fail("Couldn't save. Try again.");
  refresh(dealId, id);
  return { ok: true, id, message: approve ? "Approved. The bid list and the response can be made from it now." : "Saved." };
}

/** A new draft copied from an approved list (the approved one stays as it was). */
export async function reviseItemsAction(dealId: string, id: string): Promise<RepairResult> {
  const { supabase } = await staffDeal(dealId);
  const draft = await loadItems(supabase, dealId, id);
  if (!draft || draft.status !== "approved") return fail("Only an approved list can be revised.");
  const { data: open } = await supabase.from("ai_drafts").select("id").eq("kind", "inspection_items").eq("deal_id", dealId).eq("status", "draft").eq("content->>document_id", draft.content.document_id).maybeSingle();
  if (open) return { ok: true, id: open.id, message: "This report already has a list in progress." };
  const content: ItemsContent = { ...draft.content, revised_from: draft.id };
  const { data: saved, error } = await supabase
    .from("ai_drafts")
    .insert({ kind: "inspection_items", deal_id: dealId, subject: `Repair items: ${draft.content.document_name}`.slice(0, 200), body: `${content.items.length} repair items`, content: content as never })
    .select("id")
    .single();
  if (error || !saved) return fail("Couldn't start a revision. Try again.");
  refresh(dealId, saved.id);
  return { ok: true, id: saved.id, message: "A copy to revise. The approved list stays as it was." };
}

export async function discardDraftAction(dealId: string, id: string): Promise<RepairResult> {
  const { supabase } = await staffDeal(dealId);
  if (!Id.safeParse(id).success) return fail("That draft isn't here any more.");
  const { data, error } = await supabase.from("ai_drafts").update({ status: "discarded" }).eq("id", id).eq("deal_id", dealId).eq("status", "draft").select("id");
  if (error || !data?.length) return fail("Couldn't discard it.");
  refresh(dealId, id);
  return { ok: true, id, message: "Discarded." };
}

// --- The response to the buyer's request --------------------------------------------------------------

const Row = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200),
  decision: z.enum(DECISIONS),
  amount: z.number().nullable(),
  added: z.boolean().optional(),
});

/** Decisions for an approved list: items from that list (titles from it), plus items the agent added. */
function cleanDecisions(rows: unknown, items: RepairItem[]): DecisionRow[] | null {
  const parsed = z.array(Row).max(MAX_ITEMS * 3).safeParse(rows);
  if (!parsed.success) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: DecisionRow[] = [];
  for (const r of parsed.data) {
    const item = byId.get(r.id);
    if (!item && !r.added) return null;
    const title = item ? item.title : cleanItemText(r.title, 120);
    const amount = r.decision === "credit" && r.amount !== null && Number.isFinite(r.amount) ? Math.round(r.amount * 100) / 100 : null;
    out.push({ id: item ? item.id : randomUUID(), title, decision: r.decision, amount, ...(item ? {} : { added: true }) });
  }
  return out;
}

const closeOf = (d: { ratification_date: string; days_to_close: number }) => computeCoe(d.ratification_date, d.days_to_close);

/**
 * Writes the response: the agent's decisions (the seller has approved them),
 * our list, and the assistant's opening and closing. Never the report.
 */
export async function writeResponseAction(dealId: string, itemsId: string, rows: unknown, sellerApproved: boolean, note: string): Promise<RepairResult> {
  const { supabase, profile, deal } = await staffDeal(dealId);
  const list = await loadItems(supabase, dealId, itemsId);
  if (!list || list.status !== "approved") return fail("Approve the repair items first.");
  const decisions = cleanDecisions(rows, list.content.items);
  if (!decisions) return fail("Something in the decisions isn't valid. Reload the page and try again.");
  const problems = decisionProblems(decisions);
  if (problems.length) return fail("Check the decisions:", problems);
  if (sellerApproved !== true) return fail('Tick "The seller has approved these decisions" first.');
  const prepared = prepareNote(note);
  if (prepared.error) return fail(prepared.error);
  try {
    if (!aiKeyConfigured()) return fail(NO_KEY);
    const result = await runAi(aiDeps(supabase), REPAIR_RESPONSE, { instruction: prepared.note, parts: responseInput({ address: deal.address, closeDate: closeOf(deal), rows: decisions }), dealId });
    if (!result.ok) return fail(result.message);
    if (!result.data) return fail("The assistant's answer wasn't usable. Please try again.");
    const content: ResponseContent = { items_id: list.id, decisions, seller_approved: true, opening: result.data.opening.trim().slice(0, 1500), closing: result.data.closing.trim().slice(0, 1000) };
    const body = composeLetter({ opening: content.opening, closing: content.closing, rows: decisions, agentName: profile.full_name ?? "" });
    const { data: saved, error } = await supabase
      .from("ai_drafts")
      .insert({ kind: "repair_response", deal_id: dealId, subject: `Response to the request for repairs: ${deal.address}`.slice(0, 200), body: body.slice(0, 8000), content: content as never })
      .select("id")
      .single();
    if (error || !saved) return fail("Couldn't save the response. Please try again.");
    refresh(dealId, list.id);
    return { ok: true, id: saved.id, message: "Response ready. Check the opening and closing, then approve it." };
  } catch (e) {
    console.error("[repairResponse]", e instanceof Error ? e.message : "failed");
    return fail("Something went wrong writing the response. Please try again.");
  }
}

async function loadResponse(supabase: Awaited<ReturnType<typeof supabaseServer>>, dealId: string, id: string) {
  if (!Id.safeParse(id).success) return null;
  const { data } = await supabase.from("ai_drafts").select("id, status, body, content").eq("id", id).eq("kind", "repair_response").eq("deal_id", dealId).maybeSingle();
  return data as { id: string; status: string; body: string; content: ResponseContent } | null;
}

/** Saves the opening and closing (our code rebuilds the letter); with approve, runs every check first. */
export async function saveResponseAction(dealId: string, id: string, opening: string, closing: string, approve: boolean): Promise<RepairResult> {
  const { supabase, profile, deal } = await staffDeal(dealId);
  const draft = await loadResponse(supabase, dealId, id);
  if (!draft) return fail("That response isn't here any more.");
  if (draft.status !== "draft") return fail("This response is approved. Write a new one to change it.");
  const content: ResponseContent = { ...draft.content, opening: String(opening ?? "").trim().slice(0, 1500), closing: String(closing ?? "").trim().slice(0, 1000) };
  const body = composeLetter({ opening: content.opening, closing: content.closing, rows: content.decisions, agentName: profile.full_name ?? "" });
  if (approve) {
    const problems = responseProblems(body, content, profile.full_name ?? "", closeOf(deal));
    if (problems.length) return fail("Fix these before approving:", problems);
  }
  const { error } = await supabase.from("ai_drafts").update({ content: content as never, body: body.slice(0, 8000), ...(approve ? { status: "approved" } : {}) }).eq("id", id);
  if (error) return fail("Couldn't save. Try again.");
  refresh(dealId, content.items_id);
  return { ok: true, id, message: approve ? "Approved. Copy it, open it in your email, or print it." : "Saved." };
}

/**
 * Approves exactly the stored letter (for a body edited outside the form, the
 * checks catch any change to our list, totals or fixed lines).
 */
export async function approveStoredResponseAction(dealId: string, id: string): Promise<RepairResult> {
  const { supabase, profile, deal } = await staffDeal(dealId);
  const draft = await loadResponse(supabase, dealId, id);
  if (!draft || draft.status !== "draft") return fail("That response can't be approved.");
  const problems = responseProblems(draft.body, draft.content, profile.full_name ?? "", closeOf(deal));
  if (problems.length) return fail("Fix these before approving:", problems);
  const { error } = await supabase.from("ai_drafts").update({ status: "approved" }).eq("id", id);
  if (error) return fail("Couldn't approve it. Try again.");
  refresh(dealId, draft.content.items_id);
  return { ok: true, id, message: "Approved." };
}

export async function markResponseUsedAction(dealId: string, id: string, via: "email" | "copy" | "print"): Promise<void> {
  const { supabase } = await staffDeal(dealId);
  if (!Id.safeParse(id).success || !["email", "copy", "print"].includes(via)) return;
  await supabase.from("ai_drafts").update({ sent_via: via }).eq("id", id).eq("deal_id", dealId).eq("status", "approved");
  revalidatePath(`/deals/${dealId}/repairs`);
}
