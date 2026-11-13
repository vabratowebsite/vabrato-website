import { runAi, type AiDeps, type AiFailure } from "@vabrato/ai";
import { HOME_TYPES, parseSearchParams, toQueryString, type HomeType, type SearchFilters } from "@/lib/search-params";
import { EXPLAIN_TERM, SEARCH_BY_SENTENCE, SUMMARIZE_DOCUMENT, searchParts, type SearchAnswer } from "./features";
import type { MemberFile } from "./files";
import { ASK_LIMITS, type AskCard, type AskKind, type TextKind } from "./kinds";
import { summaryView } from "./summary";

// Ask Vabrato's two first features end to end, given the pipeline's deps
// (the actions pass the member's own; tests pass a fake model and store).
// Server-side only. Nothing here is stored: the answer goes back to the page.

/** What a member reads when a request doesn't go through (packages/ai's own messages are worded for staff). */
export const MEMBER_MESSAGES: Record<AiFailure, string> = {
  off: "Ask Vabrato isn't switched on right now.",
  daily_requests: "You've reached today's limit for Ask Vabrato. It resets at midnight Pacific time.",
  daily_tokens: "You've reached today's limit for Ask Vabrato. It resets at midnight Pacific time.",
  monthly_budget: "Ask Vabrato isn't available for the rest of this month. Your agent is happy to help: send them a message.",
  fair_housing_input:
    "We can't search for, describe or rate homes or areas by who lives there, or rate areas as safe or good (Fair Housing). Ask about the home itself, distances, transit or parks. For schools, see the school district's own website or the California Department of Education; for fair housing, see hud.gov.",
  fair_housing_output: "The answer used wording we can't use under Fair Housing rules, so it isn't shown. Try asking another way.",
  payment_instructions: "The answer isn't shown because it mentioned payment or wiring details. Ask Vabrato never gives those. Always call your escrow officer to verify wiring instructions.",
  refused: "Ask Vabrato couldn't help with that. Try asking another way, or ask your agent.",
  invalid_output: "The answer didn't come through properly. Please try again.",
  busy: "Ask Vabrato is busy right now. Please try again in a minute.",
  too_large: "That's too long for Ask Vabrato. Try a shorter question.",
  error: "Something went wrong. Please try again.",
};

/** The member's words, tidied: one line, within the limit. Null when empty. */
export function cleanQuestion(text: unknown, kind: TextKind): string | null {
  const s = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, ASK_LIMITS[kind]) : null;
}

const error = (feature: AskKind, question: string, message: string): AskCard => ({ kind: "error", feature, question, message });

export async function explainTerm(deps: AiDeps, text: unknown): Promise<AskCard> {
  const question = cleanQuestion(text, "explain");
  if (!question) return error("explain", "", "Type the term you'd like explained.");
  const r = await runAi(deps, EXPLAIN_TERM, { instruction: question });
  if (!r.ok) return error("explain", question, MEMBER_MESSAGES[r.reason]);
  const answer = (r.data ?? r.text).trim();
  if (!answer) return error("explain", question, MEMBER_MESSAGES.invalid_output);
  return { kind: "explain", question, text: answer };
}

export interface SearchContext {
  cities: { slug: string; name: string }[];
  /** Sold homes are searchable only for a buyer with VOW access (vow_enabled and the terms accepted). */
  soldAllowed: boolean;
}

export async function searchBySentence(deps: AiDeps, text: unknown, ctx: SearchContext): Promise<AskCard> {
  const question = cleanQuestion(text, "search");
  if (!question) return error("search", "", "Describe the homes you're looking for.");
  const r = await runAi(deps, SEARCH_BY_SENTENCE, { instruction: question, parts: searchParts(ctx.cities) });
  if (!r.ok) return error("search", question, MEMBER_MESSAGES[r.reason]);
  if (!r.data) return error("search", question, MEMBER_MESSAGES.invalid_output);
  const { filters, sold, notes } = filtersFromAnswer(r.data, ctx);
  const q = toQueryString(filters);
  const href = sold ? (q ? `/my/sold?${q}` : "/my/sold") : q ? `/search?${q}` : "/search";
  return { kind: "search", question, chips: filterChips(filters, sold, ctx.cities), href, notes };
}

/**
 * The model's answer as the website's own filters. Every value is checked by
 * the same schema as a /search URL (parseSearchParams), so nothing the search
 * doesn't already offer can come through (FH-1: no demographic filters exist).
 * Unknown cities are dropped; sold only with VOW access.
 */
export function filtersFromAnswer(a: SearchAnswer, ctx: SearchContext): { filters: SearchFilters; sold: boolean; notes: string[] } {
  const known = new Set(ctx.cities.map((c) => c.slug));
  const notes: string[] = [];
  const cities = [...new Set(a.cities.map((c) => c.trim().toLowerCase()))];
  const kept = cities.filter((c) => known.has(c));
  if (kept.length < cities.length) notes.push("A place you named isn't one of the cities we cover, so it isn't in the search.");
  const types = a.types.filter((t): t is HomeType => t in HOME_TYPES);
  const int = (n: number | null) => (n === null || !Number.isFinite(n) ? undefined : String(Math.round(n)));
  const raw: Record<string, string | undefined> = {
    city: kept.join(",") || undefined,
    minPrice: int(a.min_price),
    maxPrice: int(a.max_price),
    beds: int(a.beds),
    baths: int(a.baths),
    type: types.join(",") || undefined,
    tab: a.open_houses ? "open-houses" : undefined,
    sort: a.sort ?? undefined,
  };
  const filters = parseSearchParams(raw);
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    [filters.minPrice, filters.maxPrice] = [filters.maxPrice, filters.minPrice];
  }
  const sold = a.sold && ctx.soldAllowed;
  if (a.sold && !ctx.soldAllowed) notes.push("Sold homes aren't available on your account, so this searches homes for sale.");
  if (sold) filters.tab = "for-sale"; // /my/sold takes the same filters; the page itself shows sold homes.
  const extra = a.not_used?.replace(/\s+/g, " ").trim().slice(0, 200);
  if (extra) notes.push(extra);
  return { filters, sold, notes };
}

const money = (n: number) => (n >= 1_000_000 ? `$${Number((n / 1_000_000).toFixed(2))}M` : `$${Math.round(n / 1000)}K`);
const TYPE_LABELS: Record<HomeType, string> = { house: "Houses", condo: "Condos", townhome: "Townhomes", "multi-family": "Multi-family" };
const SORT_LABELS: Record<SearchFilters["sort"], string | null> = { newest: null, price_asc: "Lowest price first", price_desc: "Highest price first", beds: "Most bedrooms first", open_house: "Open houses first" };

/** The filters in plain words, one chip each. */
export function filterChips(f: SearchFilters, sold: boolean, cities: { slug: string; name: string }[]): string[] {
  const name = new Map(cities.map((c) => [c.slug, c.name]));
  const chips: string[] = [sold ? "Sold homes" : f.tab === "open-houses" ? "Open houses" : "For sale"];
  chips.push(...(f.city.length ? f.city.map((s) => name.get(s) ?? s) : ["All our cities"]));
  if (f.minPrice !== undefined && f.maxPrice !== undefined) chips.push(`${money(f.minPrice)} to ${money(f.maxPrice)}`);
  else if (f.maxPrice !== undefined) chips.push(`Under ${money(f.maxPrice)}`);
  else if (f.minPrice !== undefined) chips.push(`Over ${money(f.minPrice)}`);
  if (f.beds) chips.push(`${f.beds}+ beds`);
  if (f.baths) chips.push(`${f.baths}+ baths`);
  chips.push(...f.type.map((t) => TYPE_LABELS[t]));
  const sort = SORT_LABELS[f.sort];
  if (sort) chips.push(sort);
  return chips;
}

/** File-specific wording where the general one would mislead. */
const FILE_FAILURES: Partial<Record<AiFailure, string>> = {
  too_large: "This document is too long for Ask Vabrato to read in one go. Your agent can help with it.",
  invalid_output: "The summary didn't come through properly. Please try again.",
};

/** Summarize one of the member's documents (already loaded and checked by files.ts). */
export async function summarizeDocument(deps: AiDeps, file: MemberFile): Promise<AskCard> {
  const question = `Summarize: ${file.name}`;
  const r = await runAi(deps, SUMMARIZE_DOCUMENT, {
    parts: [{ type: "text", text: `The member's document: "${file.name}"${file.pages ? `, ${file.pages} page${file.pages === 1 ? "" : "s"}` : ""}.` }, file.part],
    dealId: file.dealId,
  });
  if (!r.ok) return error("summarize", question, FILE_FAILURES[r.reason] ?? MEMBER_MESSAGES[r.reason]);
  if (!r.data) return error("summarize", question, FILE_FAILURES.invalid_output!);
  const view = summaryView(r.data, file.pages);
  if (!view.points.length) return error("summarize", question, "Ask Vabrato couldn't find anything to summarize in this file. If it's a scan, try a clearer copy, or ask your agent.");
  return { kind: "summary", question, docName: file.name, pages: file.pages, ...view };
}
