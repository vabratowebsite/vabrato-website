import { runAi, type AiDeps, type AiFailure } from "@vabrato/ai";
import { MEMBER_MESSAGES } from "./ask";
import { COMPARE_HOMES, LISTING_QUESTION, type CompareAnswer, type ListingAnswer } from "./features";
import { LISTING_QUESTION_MAX, type AskCard, type CardHome } from "./kinds";
import { HOME_LETTERS, compareParts, computedFacts, listingParts, sentFieldNames, type AiHome, type HomesForAi } from "./listings";
import { cleanLine } from "./summary";

// Ask Vabrato's "Compare homes" and "Ask about a home" (S5b PR 4) end to end,
// given the pipeline's deps. Server-side only; nothing is stored. After the
// pipeline's own checks (Fair Housing, payment details), our code refuses any
// price or value opinion and any dollar figure we didn't send, keeps only
// sources we sent, and removes contacts and links.

export const LISTING_MESSAGES = {
  value: "Ask Vabrato doesn't give price or value opinions. Your agent can prepare a market analysis for you.",
  money: "The answer used a figure that isn't in the listing, so it isn't shown. Please try again, or ask your agent.",
  tooFew: "Pick at least two homes to compare.",
  noneSent: "None of these homes can be compared by Ask Vabrato: their sellers asked that listings not be used this way. Your agent can compare them with you.",
  optedOut: "The seller asked that this listing not be used by AI tools, so Ask Vabrato can't answer about it. Your agent can help.",
  notFound: "That home isn't available to you. Pick one of your saved or tracked homes.",
  noQuestion: "Type your question about the home.",
  empty: "The answer didn't come through properly. Please try again.",
} as const;

/** Price and value opinions the answer must never give (SPEC: never present a price opinion as an appraisal). */
const VALUE_OPINION =
  /\b(over[- ]?priced|under[- ]?priced|over[- ]?valued|under[- ]?valued|good (?:deal|value|buy|investment|price)|great (?:deal|value|buy|price)|best (?:deal|value)|better (?:deal|value)|bargain|a steal|fair(?:ly)? priced|priced (?:right|well|fairly|to sell|aggressively)|worth (?:it|the (?:money|price)|more|less|\$)|appraise[ds]?|appraisal|market value|will (?:sell|appreciate)|appreciate in value|price is (?:too )?(?:high|low)|too (?:expensive|cheap))\b/i;

export const valueOpinion = (text: string) => VALUE_OPINION.exec(text)?.[0] ?? null;

/** Every dollar figure in the text, as numbers ("$2.2M" → 2200000, "$1,195" → 1195). */
export function dollarFigures(text: string): { value: number; approx: boolean }[] {
  const out: { value: number; approx: boolean }[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|mm|million|thousand)?\b/gi)) {
    const base = Number(m[1]!.replace(/,/g, ""));
    const unit = (m[2] ?? "").toLowerCase();
    const mult = unit === "k" || unit === "thousand" ? 1e3 : unit ? 1e6 : 1;
    out.push({ value: base * mult, approx: Boolean(unit) });
  }
  return out;
}

/** The dollar-like numbers we sent (prices, fees, computed figures). */
export function sentAmounts(homes: AiHome[]): number[] {
  const out: number[] = [];
  for (const h of homes) {
    for (const [k, v] of Object.entries({ ...h.fields, ...computedFacts(h.fields) })) {
      if (/Price|Fee|PerSqFt/.test(k) && typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** A dollar figure is fine only if it's one we sent (shorthand like "$2.2M" may round it). */
export function unsentDollar(text: string, sent: number[]): number | null {
  for (const d of dollarFigures(text)) {
    const ok = sent.some((a) => (d.approx ? Math.abs(d.value - a) <= Math.max(1, a * 0.05) : Math.abs(d.value - a) < 1));
    if (!ok) return d.value;
  }
  return null;
}

/** Field names as members read them: "LotSizeSquareFeet" → "Lot size square feet". */
export function fieldLabel(name: string): string {
  const MAP: Record<string, string> = { PricePerSqFt: "Price per sq ft (worked out from the list price)", BathroomsTotalInteger: "Bathrooms", BedroomsTotal: "Bedrooms", PublicRemarks: "Listing description", DaysOnMarket: "Days on market" };
  if (MAP[name]) return MAP[name]!;
  const words = name.replace(/YN$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const card = (h: Pick<AiHome, "key" | "label" | "broker">): CardHome => ({ key: h.key, label: h.label, broker: h.broker });
const error = (feature: "compare" | "listing", question: string, message: string): AskCard => ({ kind: "error", feature, question, message });
const fail = (reason: AiFailure) => MEMBER_MESSAGES[reason];

export function compareView(a: CompareAnswer, homes: AiHome[]): { summary: string[]; differences: { topic: string; values: string[] }[]; questions: string[] } {
  return {
    summary: a.summary.map((s) => cleanLine(s, 300)).filter(Boolean).slice(0, 4),
    differences: a.differences
      .map((d) => ({ topic: cleanLine(d.topic, 60), values: homes.map((_, i) => cleanLine(d.values[i] ?? "", 160) || "Not listed") }))
      .filter((d) => d.topic)
      .slice(0, 8),
    questions: a.questions.map((q) => cleanLine(q, 200)).filter(Boolean).slice(0, 4),
  };
}

/** Compare 2-4 homes (already loaded for the member's level by memberListingsForAi). */
export async function compareHomes(deps: AiDeps, loaded: HomesForAi): Promise<AskCard> {
  const all = [...loaded.homes, ...loaded.excluded];
  const question = `Compare ${all.map((h) => h.label).join(", ") || "homes"}`;
  if (loaded.homes.length + loaded.excluded.length < 2) return error("compare", question, LISTING_MESSAGES.tooFew);
  if (loaded.homes.length < 2) return error("compare", question, LISTING_MESSAGES.noneSent);
  const r = await runAi(deps, COMPARE_HOMES, { parts: compareParts(loaded.homes) });
  if (!r.ok) return error("compare", question, fail(r.reason));
  if (!r.data) return error("compare", question, LISTING_MESSAGES.empty);
  const view = compareView(r.data, loaded.homes);
  const text = [...view.summary, ...view.differences.flatMap((d) => [d.topic, ...d.values]), ...view.questions].join("\n");
  if (valueOpinion(text)) return error("compare", question, LISTING_MESSAGES.value);
  if (unsentDollar(text, sentAmounts(loaded.homes)) !== null) return error("compare", question, LISTING_MESSAGES.money);
  if (!view.summary.length && !view.differences.length) return error("compare", question, LISTING_MESSAGES.empty);
  return {
    kind: "compare",
    question,
    homes: loaded.homes.map((h, i) => ({ ...card(h), letter: HOME_LETTERS[i]! })),
    excluded: loaded.excluded.map(card),
    ...view,
  };
}

export function cleanListingQuestion(text: unknown): string | null {
  const s = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, LISTING_QUESTION_MAX) : null;
}

/** Answer one question about one home. */
export async function askAboutHome(deps: AiDeps, loaded: HomesForAi, text: unknown): Promise<AskCard> {
  const q = cleanListingQuestion(text);
  const home = loaded.homes[0];
  const label = home?.label ?? loaded.excluded[0]?.label ?? "this home";
  const question = q ? `${q} (${label})` : `About ${label}`;
  if (!q) return error("listing", question, LISTING_MESSAGES.noQuestion);
  if (!home) return error("listing", question, loaded.excluded.length ? LISTING_MESSAGES.optedOut : LISTING_MESSAGES.notFound);
  const r = await runAi(deps, LISTING_QUESTION, { instruction: q, parts: listingParts(home) });
  if (!r.ok) return error("listing", question, fail(r.reason));
  if (!r.data) return error("listing", question, LISTING_MESSAGES.empty);
  const a: ListingAnswer = r.data;
  const answer = cleanLine(a.answer, 900);
  if (!answer) return error("listing", question, LISTING_MESSAGES.empty);
  if (valueOpinion(answer)) return error("listing", question, LISTING_MESSAGES.value);
  if (unsentDollar(answer, sentAmounts([home])) !== null) return error("listing", question, LISTING_MESSAGES.money);
  const sent = sentFieldNames(home);
  const sources = [...new Set(a.fields_used.filter((f) => sent.has(f)))].slice(0, 8).map(fieldLabel);
  return { kind: "listing", question, home: card(home), answer, sources, notInListing: a.not_in_listing };
}
