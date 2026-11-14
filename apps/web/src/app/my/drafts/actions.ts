"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanLine, draftSaveProblems } from "@/member/assistant/drafts";
import {
  DRAFT_LIMITS,
  isRecipient,
  sendToAgentHref,
  type DraftKind,
} from "@/member/assistant/kinds";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

// "My drafts" (S5b PR 3, 0038). Drafts the member chose to save from Ask
// Vabrato. Private to the member (RLS: their own rows only; their agent
// doesn't see them), deleted 30 days after the last edit. Wiring details are
// never stored, and cover letters stay terms-only (draftSaveProblems).

export type DraftActionResult =
  { ok: true; id?: string; message?: string } | { ok: false; error: string };

const Id = z.string().uuid();
const NOT_FOUND = "That draft wasn't found. It may have been deleted.";

const text = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, max + 1);

export interface SaveDraftInput {
  draftKind: DraftKind;
  recipient: string;
  about: string | null;
  subject: string;
  body: string;
}

export async function saveDraftAction(input: SaveDraftInput): Promise<DraftActionResult> {
  const member = await requirePortalMember("/my/assistant");
  const kind: DraftKind = input?.draftKind === "cover_letter" ? "cover_letter" : "message";
  const recipient = kind === "cover_letter" ? "agent" : input?.recipient;
  if (!isRecipient(recipient)) return { ok: false, error: "Choose who the message is for." };
  if (kind === "cover_letter" && !buys(member.role))
    return { ok: false, error: "Offer cover letters are for buyers." };
  const subject = cleanLine(input?.subject, DRAFT_LIMITS.subject + 1);
  const body = text(input?.body, DRAFT_LIMITS.body);
  const problem = draftSaveProblems(kind, subject, body);
  if (problem) return { ok: false, error: problem };
  const about = cleanLine(input?.about, DRAFT_LIMITS.about) || null;
  const { data, error } = await member.supabase
    .from("member_drafts")
    .insert({ kind, recipient, about, subject, body })
    .select("id")
    .single();
  if (error || !data)
    return {
      ok: false,
      error: /too_many_drafts/.test(error?.message ?? "")
        ? "You have 50 saved drafts. Delete some in My drafts first."
        : "We couldn't save that draft. Please try again.",
    };
  revalidatePath("/my/drafts");
  return { ok: true, id: data.id, message: "Saved to My drafts." };
}

export async function updateDraftAction(
  id: string,
  subjectIn: string,
  bodyIn: string,
): Promise<DraftActionResult> {
  const member = await requirePortalMember("/my/drafts");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  const { data: row } = await member.supabase
    .from("member_drafts")
    .select("kind")
    .eq("id", parsed.data)
    .maybeSingle();
  if (!row) return { ok: false, error: NOT_FOUND };
  const subject = cleanLine(subjectIn, DRAFT_LIMITS.subject + 1);
  const body = text(bodyIn, DRAFT_LIMITS.body);
  const problem = draftSaveProblems(row.kind as DraftKind, subject, body);
  if (problem) return { ok: false, error: problem };
  const { data, error } = await member.supabase
    .from("member_drafts")
    .update({ subject, body })
    .eq("id", parsed.data)
    .select("id");
  if (error || !data?.length) return { ok: false, error: NOT_FOUND };
  revalidatePath("/my/drafts");
  return { ok: true, message: "Saved." };
}

/** Records how the member used a saved draft (their own email, a copy, or a message to their agent). */
export async function markDraftUsedAction(
  id: string,
  via: "email" | "copy" | "agent",
): Promise<DraftActionResult> {
  const member = await requirePortalMember("/my/drafts");
  const parsed = Id.safeParse(id);
  if (!parsed.success || !["email", "copy", "agent"].includes(via))
    return { ok: false, error: NOT_FOUND };
  const { data, error } = await member.supabase
    .from("member_drafts")
    .update({ sent_via: via })
    .eq("id", parsed.data)
    .select("id");
  if (error || !data?.length) return { ok: false, error: NOT_FOUND };
  revalidatePath("/my/drafts");
  return { ok: true };
}

export async function deleteDraftAction(id: string): Promise<DraftActionResult> {
  const member = await requirePortalMember("/my/drafts");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  const { data, error } = await member.supabase
    .from("member_drafts")
    .delete()
    .eq("id", parsed.data)
    .select("id");
  if (error || !data?.length) return { ok: false, error: NOT_FOUND };
  revalidatePath("/my/drafts");
  return { ok: true, message: "Deleted." };
}

export type AgentMessageResult = { ok: true; href: string } | { ok: false; error: string };

/**
 * "Send to my agent": checks the draft (cover letters stay terms-only), records
 * it on a saved draft, and returns the Messages link with the text filled in.
 * The member still presses Send there.
 */
export async function prepareAgentMessageAction(
  input: SaveDraftInput & { id?: string | null },
): Promise<AgentMessageResult> {
  const member = await requirePortalMember("/my/assistant");
  const kind: DraftKind = input?.draftKind === "cover_letter" ? "cover_letter" : "message";
  if (kind === "cover_letter" && !buys(member.role))
    return { ok: false, error: "Offer cover letters are for buyers." };
  const subject = cleanLine(input?.subject, DRAFT_LIMITS.subject + 1);
  const body = text(input?.body, DRAFT_LIMITS.body);
  const problem = draftSaveProblems(kind, subject, body);
  if (problem) return { ok: false, error: problem };
  const href = sendToAgentHref(
    kind,
    cleanLine(input?.about, DRAFT_LIMITS.about) || null,
    subject,
    body,
  );
  if (!href)
    return {
      ok: false,
      error: "This is too long for one message to your agent. Shorten it first.",
    };
  const id = Id.safeParse(input?.id);
  if (id.success) {
    await member.supabase.from("member_drafts").update({ sent_via: "agent" }).eq("id", id.data);
    revalidatePath("/my/drafts");
  }
  return { ok: true, href };
}
