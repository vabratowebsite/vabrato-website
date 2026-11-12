"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AiDraftKind } from "@vabrato/db";
import { runAi } from "@vabrato/ai";
import { STAFF_ROLES, computeCoe, getProfile } from "@vabrato/lib";
import { aiDeps, aiKeyConfigured } from "@/lib/ai";
import { MAX_PORTAL_MESSAGE, leadDraftKind } from "@/lib/draft-kinds";
import { DRAFT_FEATURES, approvalProblems, escrowParts, leadParts, prepareNote, tidyDraft, vendorParts } from "@/lib/drafts";
import { supabaseServer } from "@/lib/supabase-server";

// AI drafts (S6b PR 3). The model writes; a person edits, approves and sends
// it themselves. Every read and write runs as the signed-in staff member, so
// RLS decides what they can draft for (0028: leads they work, deals they
// have access to). Nothing here sends an email: "Open in email" is a link to
// the person's own mail app, and a portal message is sent only when they
// press the button, as themselves.

export interface DraftView {
  id: string;
  kind: AiDraftKind;
  subject: string;
  body: string;
  status: "draft" | "approved" | "discarded";
  sent_via: string | null;
  vendor_id: string | null;
}
export type DraftResult = { ok: true; draft: DraftView; message?: string } | { ok: false; error: string; draft?: DraftView };

const COLS = "id, kind, subject, body, status, sent_via, vendor_id";

async function staffClient() {
  const supabase = await supabaseServer();
  const profile = await getProfile(supabase);
  if (!profile || !STAFF_ROLES.includes(profile.role)) throw new Error("Staff only");
  return { supabase, profile };
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

const WriteInput = z.discriminatedUnion("target", [
  z.object({ target: z.literal("lead"), leadId: z.string().uuid(), note: z.string().max(1000).optional() }),
  z.object({ target: z.literal("escrow"), dealId: z.string().uuid(), note: z.string().max(1000).optional() }),
  z.object({ target: z.literal("vendor"), dealId: z.string().uuid(), vendorId: z.string().uuid(), note: z.string().max(1000).optional() }),
]);
export type WriteDraftInput = z.input<typeof WriteInput>;

/** Asks the assistant for a draft and saves it as the caller's own draft. */
export async function writeDraftAction(raw: WriteDraftInput): Promise<DraftResult> {
  const parsed = WriteInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const input = parsed.data;
  const prepared = prepareNote(input.note);
  if (prepared.error) return { ok: false, error: prepared.error };
  const note = prepared.note;
  if (input.target === "vendor" && !note) return { ok: false, error: "Say what you need from the vendor." };
  try {
    const { supabase, profile } = await staffClient();
    if (!aiKeyConfigured()) return { ok: false, error: "The assistant isn't set up yet: it has no API key. Ask an admin." };
    const sender = profile.full_name || null;

    let kind: AiDraftKind;
    let row: { lead_id?: string; deal_id?: string; vendor_id?: string };
    let parts;
    let dealId: string | null = null;

    if (input.target === "lead") {
      const { data: lead } = await supabase.from("leads").select("id, kind, name, message, payload, listing_key").eq("id", input.leadId).maybeSingle();
      if (!lead) return { ok: false, error: "That lead isn't yours to answer." };
      kind = leadDraftKind(lead.kind);
      const openHouseKey = typeof (lead.payload as Record<string, unknown> | null)?.open_house_key === "string" ? String((lead.payload as Record<string, unknown>).open_house_key) : null;
      const [{ data: listing }, { data: openHouse }] = await Promise.all([
        lead.listing_key ? supabase.from("mls_listings").select("data").eq("listing_key", lead.listing_key).maybeSingle() : Promise.resolve({ data: null }),
        openHouseKey ? supabase.from("mls_open_houses").select("start_time, end_time").eq("open_house_key", openHouseKey).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      parts = leadParts({
        kind: lead.kind,
        name: lead.name,
        message: lead.message,
        payload: lead.payload,
        listing: (listing?.data as Record<string, unknown> | undefined) ?? null,
        openHouse: openHouse?.start_time ? { start: openHouse.start_time, end: openHouse.end_time } : null,
        senderName: sender,
      });
      row = { lead_id: lead.id };
    } else {
      const { data: deal } = await supabase.from("deals").select("id, address, ratification_date, days_to_close, rent_back_days, seller_name").eq("id", input.dealId).maybeSingle();
      if (!deal) return { ok: false, error: "That transaction isn't one you can work on." };
      dealId = deal.id;
      const coeDate = computeCoe(deal.ratification_date, deal.days_to_close);
      if (input.target === "escrow") {
        kind = "escrow_update";
        const [{ data: tasks }, { data: conts }, { data: members }] = await Promise.all([
          supabase.from("tasks").select("title, owner, due_date, done").eq("deal_id", deal.id),
          supabase.from("deal_contingencies").select("kind, due_date, removed_at").eq("deal_id", deal.id),
          supabase.from("deal_members").select("member_role, profiles(full_name)").eq("deal_id", deal.id).eq("member_role", "seller"),
        ]);
        const memberNames = (members ?? []).map((m) => (m.profiles as { full_name: string | null } | null)?.full_name ?? null);
        parts = escrowParts({
          address: deal.address,
          ratificationDate: deal.ratification_date,
          coeDate,
          rentBackDays: deal.rent_back_days,
          sellerNames: memberNames.some(Boolean) ? memberNames : [deal.seller_name],
          tasks: tasks ?? [],
          contingencies: conts ?? [],
          senderName: sender,
          today: today(),
        });
        row = { deal_id: deal.id };
      } else {
        kind = "vendor_request";
        const { data: vendor } = await supabase.from("vendors").select("id, name, role").eq("id", input.vendorId).maybeSingle();
        if (!vendor) return { ok: false, error: "Choose a vendor from the list." };
        parts = vendorParts({ vendorName: vendor.name, vendorRole: vendor.role, address: deal.address, coeDate, senderName: sender });
        row = { deal_id: deal.id, vendor_id: vendor.id };
      }
    }

    const result = await runAi(aiDeps(supabase), DRAFT_FEATURES[kind], { instruction: note, parts, dealId });
    if (!result.ok) return { ok: false, error: result.message };
    if (!result.data) return { ok: false, error: "The assistant's answer wasn't usable. Please try again." };
    const text = tidyDraft(result.data);
    const { data: saved, error } = await supabase.from("ai_drafts").insert({ kind, ...row, subject: text.subject, body: text.body }).select(COLS).single();
    if (error || !saved) return { ok: false, error: "Couldn't save the draft. Please try again." };
    revalidatePath("/assistant");
    return { ok: true, draft: saved as DraftView };
  } catch (e) {
    console.error("[writeDraft]", e instanceof Error ? e.message : "failed");
    return { ok: false, error: "Something went wrong writing the draft. Please try again." };
  }
}

const Id = z.string().uuid();
const Text = z.object({ subject: z.string().max(1000), body: z.string().max(20000) });

async function load(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  const { data } = await supabase.from("ai_drafts").select(COLS).eq("id", id).maybeSingle();
  return (data as DraftView | null) ?? null;
}

const closedError = (d: DraftView) => (d.status === "approved" ? "This draft is already approved and can't be changed. Write a new one." : "This draft was discarded.");

/** Saves the person's edits to their own draft. */
export async function saveDraftAction(id: string, text: { subject: string; body: string }): Promise<DraftResult> {
  const t = Text.safeParse(text);
  if (!Id.safeParse(id).success || !t.success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const current = await load(supabase, id);
  if (!current) return { ok: false, error: "That draft isn't yours." };
  if (current.status !== "draft") return { ok: false, error: closedError(current), draft: current };
  if (!t.data.body.trim()) return { ok: false, error: "The email is empty.", draft: current };
  const { data, error } = await supabase.from("ai_drafts").update({ subject: t.data.subject.slice(0, 200), body: t.data.body.slice(0, 8000) }).eq("id", id).select(COLS).maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save your changes. Please try again.", draft: current };
  return { ok: true, draft: data as DraftView, message: "Saved." };
}

/**
 * Approves the draft as it now reads. The text the person approves goes
 * through the same checks as the model's answer, since they may have
 * edited it; their edits are saved either way.
 */
export async function approveDraftAction(id: string, text: { subject: string; body: string }): Promise<DraftResult> {
  const saved = await saveDraftAction(id, text);
  if (!saved.ok) return saved;
  const problems = approvalProblems(saved.draft.subject, saved.draft.body);
  if (problems.length) return { ok: false, error: `Not approved yet. ${problems.join(" ")}`, draft: saved.draft };
  const { supabase } = await staffClient();
  const { data, error } = await supabase.from("ai_drafts").update({ status: "approved" }).eq("id", id).eq("status", "draft").select(COLS).maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't approve the draft. Please try again.", draft: saved.draft };
  revalidatePath("/assistant");
  return { ok: true, draft: data as DraftView, message: "Approved. Send it from your own email, or copy it." };
}

export async function discardDraftAction(id: string): Promise<DraftResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase } = await staffClient();
  const current = await load(supabase, id);
  if (!current) return { ok: false, error: "That draft isn't yours." };
  if (current.status !== "draft") return { ok: false, error: closedError(current), draft: current };
  const { data, error } = await supabase.from("ai_drafts").update({ status: "discarded" }).eq("id", id).select(COLS).maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't discard the draft. Please try again.", draft: current };
  revalidatePath("/assistant");
  return { ok: true, draft: data as DraftView, message: "Discarded. It's deleted after 30 days." };
}

/** Records that the person opened the approved draft in their email or copied it. */
export async function markDraftUsedAction(id: string, via: "email" | "copy"): Promise<void> {
  if (!Id.safeParse(id).success || (via !== "email" && via !== "copy")) return;
  const { supabase } = await staffClient();
  await supabase.from("ai_drafts").update({ sent_via: via }).eq("id", id).eq("status", "approved");
}

/**
 * Sends an approved draft as a portal message, as the signed-in staff member
 * (the existing messages policy decides whether they may write to that
 * member). Lead drafts go to the lead's member account; escrow updates to
 * the deal's seller accounts. Vendor requests have no portal.
 */
export async function sendDraftAsMessageAction(id: string): Promise<DraftResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: "Something's missing. Reload the page and try again." };
  const { supabase, profile } = await staffClient();
  const { data: d } = await supabase.from("ai_drafts").select(`${COLS}, lead_id, deal_id`).eq("id", id).maybeSingle();
  if (!d) return { ok: false, error: "That draft isn't yours." };
  const draft = d as DraftView & { lead_id: string | null; deal_id: string | null };
  if (draft.status !== "approved") return { ok: false, error: "Approve the draft first.", draft };
  if (draft.sent_via === "portal") return { ok: false, error: "This draft was already sent as a portal message.", draft };
  const message = draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body;
  if (message.length > MAX_PORTAL_MESSAGE) return { ok: false, error: `A portal message holds up to ${MAX_PORTAL_MESSAGE.toLocaleString("en-US")} characters. Send this one from your email instead.`, draft };

  let members: string[] = [];
  if (draft.kind === "lead_reply" || draft.kind === "open_house_followup") {
    const { data: lead } = await supabase.from("leads").select("profile_id").eq("id", draft.lead_id ?? "").maybeSingle();
    if (lead?.profile_id) members = [lead.profile_id];
  } else if (draft.kind === "escrow_update") {
    const { data: rows } = await supabase.from("deal_members").select("profile_id").eq("deal_id", draft.deal_id ?? "").eq("member_role", "seller");
    members = (rows ?? []).map((r) => r.profile_id);
  }
  if (!members.length) return { ok: false, error: "They don't have a member account. Send it from your email instead.", draft };

  const { error } = await supabase.from("messages").insert(members.map((member_id) => ({ member_id, sender_id: profile.id, body: message })));
  if (error) return { ok: false, error: "Couldn't send the portal message. Send it from your email instead.", draft };
  const { data: used } = await supabase.from("ai_drafts").update({ sent_via: "portal" }).eq("id", id).select(COLS).maybeSingle();
  if (draft.lead_id) await supabase.rpc("mark_lead_replied", { p_lead: draft.lead_id });
  for (const m of members) revalidatePath(`/messages/${m}`);
  return { ok: true, draft: (used as DraftView | null) ?? draft, message: members.length > 1 ? `Sent to ${members.length} sellers in the portal.` : "Sent as a portal message." };
}
