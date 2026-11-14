"use server";

import { revalidatePath } from "next/cache";
import { flagEnabled, listCities } from "@/lib/public/listings";
import { aiDeps, aiKeyConfigured } from "@/member/ai";
import { memberAiStatus, memberDataLevel } from "@/member/ai-status";
import { explainTerm, searchBySentence, summarizeDocument } from "@/member/assistant/ask";
import { loadMemberFile, parseDocRef } from "@/member/assistant/files";
import { SUMMARY_LIMITS, cleanLine } from "@/member/assistant/summary";
import { DRAFT_MESSAGES, resolveHome, writeDraft } from "@/member/assistant/drafts";
import { askAboutHome, compareHomes } from "@/member/assistant/listing-ask";
import { MAX_COMPARE, memberListingsForAi } from "@/member/assistant/listings";
import { LISTING_KEY } from "@/member/saved";
import { isRecipient, type AskCard } from "@/member/assistant/kinds";
import { buys } from "@/member/roles";
import { assignedAgent, requirePortalMember } from "@/member/session";
import { firstName } from "@vabrato/lib";

// Ask Vabrato (S5b PR 1). Each request is answered on its own and the answer
// goes back to the page only: nothing is stored (owner decision 2026-11-13).
// The pipeline checks the switches and the member's daily limits in the
// database (ai_begin) before anything is sent.

const NOT_SET_UP = "Ask Vabrato isn't set up yet.";

export async function askExplainAction(text: string): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const question = String(text ?? "").slice(0, 2000);
  if (!aiKeyConfigured()) return { kind: "error", feature: "explain", question, message: NOT_SET_UP };
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_explain")) return { kind: "error", feature: "explain", question, message: "Ask Vabrato can't explain terms right now." };
  return explainTerm(aiDeps(member.supabase), question);
}

export async function askSearchAction(text: string): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const question = String(text ?? "").slice(0, 2000);
  if (!aiKeyConfigured()) return { kind: "error", feature: "search", question, message: NOT_SET_UP };
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_search")) return { kind: "error", feature: "search", question, message: "Ask Vabrato can't search right now." };
  const [cities, vow] = await Promise.all([listCities(), flagEnabled("vow_enabled")]);
  const soldAllowed = buys(member.role) && memberDataLevel(member, vow) === "VOW";
  return searchBySentence(aiDeps(member.supabase), question, { cities: cities.map(({ slug, name }) => ({ slug, name })), soldAllowed });
}

export async function askSummarizeAction(ref: string): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const parsed = parseDocRef(ref);
  const question = "Summarize a document";
  if (!aiKeyConfigured()) return { kind: "error", feature: "summarize", question, message: NOT_SET_UP };
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_summarize")) return { kind: "error", feature: "summarize", question, message: "Ask Vabrato can't summarize documents right now." };
  if (!parsed) return { kind: "error", feature: "summarize", question, message: "Choose one of your documents." };
  // Read with the member's own client: someone else's file is simply not found.
  const loaded = await loadMemberFile(member.supabase, parsed);
  if (!loaded.ok) return { kind: "error", feature: "summarize", question, message: loaded.error };
  return summarizeDocument(aiDeps(member.supabase), loaded.file);
}

export type AddTodosResult = { ok: true; added: number } | { ok: false; error: string };

/**
 * Adds the to-dos the member ticked to "My to-dos". They wait for the
 * member's agent to approve them (0037); the agent gets one bell alert.
 */
export async function addTodosAction(sourceName: string, todos: { title: string; page: number | null }[]): Promise<AddTodosResult> {
  const member = await requirePortalMember("/my/assistant");
  const source = cleanLine(String(sourceName ?? ""), 160) || null;
  const rows = (Array.isArray(todos) ? todos : [])
    .slice(0, SUMMARY_LIMITS.todos)
    .map((t) => ({
      profile_id: member.profile.id,
      title: cleanLine(String(t?.title ?? ""), 200),
      source_name: source,
      page: Number.isInteger(t?.page) && (t.page as number) >= 1 && (t.page as number) <= 5000 ? (t.page as number) : null,
    }))
    .filter((t) => t.title);
  if (!rows.length) return { ok: false, error: "Tick at least one to-do to add." };
  const { error } = await member.supabase.from("member_todos").insert(rows);
  if (error) return { ok: false, error: /too_many/.test(error.message) ? "You have a lot of to-dos waiting for your agent. Try again once they've looked at them." : "We couldn't add those. Please try again." };
  revalidatePath("/my/todos");
  return { ok: true, added: rows.length };
}

// --- Drafts (S5b PR 3) -------------------------------------------------------------------------
// The draft comes back to the page; it's stored only if the member saves it
// (app/my/drafts/actions.ts). The member edits and sends it; AI never sends.

export interface DraftAsk {
  recipient?: string;
  /** "deal:<id>", "tracked:<id>", "typed" (cover letters) or "" for none. */
  home?: string;
  typedAddress?: string;
  notes?: string;
}

async function draftNames(member: Awaited<ReturnType<typeof requirePortalMember>>) {
  const agent = await assignedAgent(member.supabase, member.profile.agent_id);
  return { member: member.profile.full_name, agent: firstName(agent?.display_name) };
}

export async function askDraftAction(ask: DraftAsk): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const question = "Draft an email or message";
  const fail = (message: string): AskCard => ({
    kind: "error",
    feature: "message",
    question,
    message,
  });
  if (!aiKeyConfigured()) return fail(NOT_SET_UP);
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_draft"))
    return fail("Ask Vabrato can't write drafts right now.");
  if (!isRecipient(ask?.recipient)) return fail("Choose who the message is for.");
  const home = await resolveHome(member.supabase, member.profile.id, ask.home, null, "message");
  if (home === null) return fail(DRAFT_MESSAGES.home);
  return writeDraft(
    aiDeps(member.supabase),
    {
      kind: "message",
      recipient: ask.recipient,
      notes: ask.notes,
      home: home === "none" ? null : home,
    },
    await draftNames(member),
  );
}

export async function askCoverLetterAction(ask: DraftAsk): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const question = "Offer cover letter";
  const fail = (message: string): AskCard => ({
    kind: "error",
    feature: "cover_letter",
    question,
    message,
  });
  if (!aiKeyConfigured()) return fail(NOT_SET_UP);
  if (!buys(member.role)) return fail(DRAFT_MESSAGES.coverOnly);
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_cover_letter"))
    return fail("Ask Vabrato can't write cover letters right now.");
  const home = await resolveHome(
    member.supabase,
    member.profile.id,
    ask?.home,
    ask?.typedAddress,
    "cover_letter",
  );
  if (home === null)
    return fail(ask?.home === "typed" ? "Type the home's address." : DRAFT_MESSAGES.home);
  return writeDraft(
    aiDeps(member.supabase),
    {
      kind: "cover_letter",
      recipient: "agent",
      notes: ask?.notes,
      home: home === "none" ? null : home,
    },
    await draftNames(member),
  );
}

// --- Listings (S5b PR 4) -----------------------------------------------------------------------
// Compare homes and ask about a home, from the listing fields the member may
// see. Records are read with the member's own client; the MLSListings
// approval switch and each feature's switch are checked (and the database
// refuses those switches without approval, 0039). Nothing is stored.

async function listingLevel(member: Awaited<ReturnType<typeof requirePortalMember>>) {
  return memberDataLevel(member, await flagEnabled("vow_enabled"));
}

export async function askCompareAction(keys: string[]): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const question = "Compare homes";
  const fail = (message: string): AskCard => ({ kind: "error", feature: "compare", question, message });
  if (!aiKeyConfigured()) return fail(NOT_SET_UP);
  if (!buys(member.role)) return fail("Comparing homes is for buyers.");
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_compare")) return fail("Ask Vabrato can't compare homes right now.");
  const list = (Array.isArray(keys) ? keys : []).filter((k): k is string => typeof k === "string" && LISTING_KEY.test(k)).slice(0, MAX_COMPARE);
  const loaded = await memberListingsForAi(member.supabase, list, await listingLevel(member));
  return compareHomes(aiDeps(member.supabase), loaded);
}

export async function askListingAction(key: string, text: string): Promise<AskCard> {
  const member = await requirePortalMember("/my/assistant");
  const question = String(text ?? "").slice(0, 400) || "Ask about a home";
  const fail = (message: string): AskCard => ({ kind: "error", feature: "listing", question, message });
  if (!aiKeyConfigured()) return fail(NOT_SET_UP);
  if (!buys(member.role)) return fail("Asking about homes is for buyers.");
  if (!(await memberAiStatus(member.supabase)).on.includes("ai_member_listing")) return fail("Ask Vabrato can't answer questions about homes right now.");
  if (typeof key !== "string" || !LISTING_KEY.test(key)) return fail("Choose a home first.");
  const loaded = await memberListingsForAi(member.supabase, [key], await listingLevel(member));
  return askAboutHome(aiDeps(member.supabase), loaded, text);
}
