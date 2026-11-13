"use server";

import { flagEnabled, listCities } from "@/lib/public/listings";
import { aiDeps, aiKeyConfigured } from "@/member/ai";
import { memberAiStatus, memberDataLevel } from "@/member/ai-status";
import { explainTerm, searchBySentence } from "@/member/assistant/ask";
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
