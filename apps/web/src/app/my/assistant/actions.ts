"use server";

import { revalidatePath } from "next/cache";
import { flagEnabled, listCities } from "@/lib/public/listings";
import { aiDeps, aiKeyConfigured } from "@/member/ai";
import { memberAiStatus, memberDataLevel } from "@/member/ai-status";
import { explainTerm, searchBySentence, summarizeDocument } from "@/member/assistant/ask";
import { loadMemberFile, parseDocRef } from "@/member/assistant/files";
import { SUMMARY_LIMITS, cleanLine } from "@/member/assistant/summary";
import type { AskCard } from "@/member/assistant/kinds";
import { buys } from "@/member/roles";
import { requirePortalMember } from "@/member/session";

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
