import { z } from "zod";
import type { AiFeature, InputPart } from "@vabrato/ai";
import { cleanParts, type Parts } from "./kit-parts";
import { partsProblems } from "./kits";
import { numbersNotSent } from "./numbers";
import type { CmaRange } from "./stats";

// S6b PR 6, server side: market updates and CMA write-ups. Our code computes
// every number (market_stats in the database, cmaRange in stats.ts); the
// assistant only writes words around them. At approval, every number in the
// text must be one we sent (numbersNotSent), so a figure the assistant made
// up, or one someone typed in, is caught before it leaves.

const SHARED = `You write for an agent at Vabrato Real Estate Services, a residential brokerage on the San Francisco Peninsula (San Mateo and Santa Clara counties). The agent edits and approves what you write.

Use only the numbers given to you, exactly as given (you may round them for reading, e.g. $1,948,000 as about $1.95 million). Don't calculate new figures, don't add numbers that aren't given, and don't predict prices or say where the market is heading. If a figure is missing (null), say there weren't enough sales to report it rather than guessing. Describe homes and places, never the people who live there or who an area would suit; don't rate areas or schools. No phone numbers, email addresses or links.`;

const MARKET = `${SHARED}

Write a short market update for one city over the period given, from the statistics given: what sold, at what median price and price per square foot, how long homes took to sell, how sale prices compared with list prices, how much is for sale now and months of inventory, and how the monthly sales moved. Plain, calm and useful for homeowners and buyers; no hype. Return a title, a one- or two-sentence excerpt, and the article in Markdown (short paragraphs, at most two "##" headings, no tables, under 600 words). End with one sentence saying the figures come from MLSListings data for the period given.`;

const CMA = `${SHARED}

Write a plain-language summary of a comparative market analysis for the agent to share with a homeowner: the home, the comparable sales chosen and how they compare (size, beds, baths, how recently they sold, price per square foot), and the range our calculation gives. Say clearly that this is a comparison of recent sales, not an appraisal, and that condition, updates and location within the neighborhood affect value in ways the numbers don't show. Never give your own value or adjust the range. Return a summary (2 to 4 short paragraphs), one short note per comparable ("KEY: note"), and a short note on what to keep in mind.`;

const str = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const json = <T extends z.ZodTypeAny>(schema: Record<string, unknown>, parser: T) => ({ kind: "json" as const, jsonSchema: schema, parse: (v: unknown) => parser.parse(v) as z.infer<T> });

const MarketAnswer = z.object({ title: z.string().max(400), excerpt: z.string().max(800), body_md: z.string().max(12000) }).strict();
export type MarketAnswer = z.infer<typeof MarketAnswer>;
const CmaAnswer = z.object({ summary: z.string().max(6000), comparables: z.array(z.object({ key: z.string().max(64), note: z.string().max(600) }).strict()).max(20), adjustments_note: z.string().max(3000) }).strict();
export type CmaAnswer = z.infer<typeof CmaAnswer>;

export const MARKET_UPDATE: AiFeature<MarketAnswer> = {
  key: "staff_market_update",
  system: MARKET,
  effort: "medium",
  maxTokens: 3000,
  output: json(obj({ title: str, excerpt: str, body_md: str }), MarketAnswer),
};

export const CMA_WRITEUP: AiFeature<CmaAnswer> = {
  key: "staff_cma_writeup",
  system: CMA,
  effort: "medium",
  maxTokens: 3000,
  output: json(obj({ summary: str, comparables: { type: "array", items: obj({ key: str, note: str }) }, adjustments_note: str }), CmaAnswer),
};

export const marketToParts = (a: MarketAnswer): Parts => cleanParts("market_update", a);
export const cmaToParts = (a: CmaAnswer, keys: string[]): Parts =>
  cleanParts("cma_writeup", {
    summary: a.summary,
    comparables: a.comparables
      .filter((c) => keys.includes(c.key))
      .map((c) => `${c.key}: ${c.note.replace(/\s+/g, " ").trim()}`)
      .join("\n"),
    adjustments_note: a.adjustments_note,
  });

// --- What each sends -----------------------------------------------------------------------------

/** market_stats() output, as the database computed it (medians already null under 5 sales). */
export type MarketStats = Record<string, unknown>;

export function marketInput(stats: MarketStats): InputPart[] {
  return [
    { type: "text", text: `City: ${String(stats.city_name ?? stats.city)}. Period: the last ${String(stats.months)} months, since ${String(stats.since).slice(0, 10)}. Medians are reported only with at least ${String(stats.min_sales_for_medians ?? 5)} sales.` },
    { type: "data", label: "Market statistics computed by the console (MLSListings data)", text: JSON.stringify(stats) },
  ];
}

export interface CmaFacts {
  subject: { city: string | null; sub_type: string | null; beds: number | null; baths: number | null; sqft: number | null };
  comps: { listing_key: string; street: string | null; city: string | null; property_sub_type: string | null; bedrooms_total: number | null; bathrooms_total: number | null; living_area: number | null; close_price: number | null; close_date: string | null; list_price: number | null; price_per_sqft: number | null; days_on_market: number | null }[];
  range: CmaRange | null;
}

/** The facts a CMA write-up may use: the subject, each comparable's public sale facts, our range. */
export function cmaFactsJson(f: CmaFacts) {
  return {
    subject: f.subject,
    comparables: f.comps.map((c) => ({
      key: c.listing_key,
      street: c.street,
      city: c.city,
      type: c.property_sub_type,
      beds: c.bedrooms_total,
      baths: c.bathrooms_total,
      sqft: c.living_area,
      sold_price: c.close_price,
      sold_on: c.close_date,
      list_price: c.list_price,
      price_per_sqft: c.price_per_sqft,
      days_on_market: c.days_on_market,
    })),
    range: f.range ? { comparables_used: f.range.comps, median_price_per_sqft: f.range.medianPpsf, low: f.range.low, middle: f.range.mid, high: f.range.high } : null,
  };
}

export function cmaInput(f: CmaFacts): InputPart[] {
  return [
    { type: "text", text: f.range ? "Our calculation gives the range in the facts (25th to 75th percentile of the comparables' price per square foot times the home's size, rounded to $5,000)." : "There's no range: the home's size is missing or fewer than 3 comparables are usable. Say so; don't estimate one." },
    { type: "data", label: "The CMA: the home, the comparable sales and our range", text: JSON.stringify(cmaFactsJson(f)) },
  ];
}

// --- The numbers check (lib/numbers.ts, shared with S6b PR 7b) ------------------------------------

export { numbersIn, numbersInText, numbersNotSent } from "./numbers";

/** Everything that blocks approving a market update or CMA write-up. */
export function writeupProblems(kind: "market_update" | "cma_writeup", parts: Parts, sent: unknown): string[] {
  const problems = partsProblems(kind, parts);
  const extra = numbersNotSent(Object.values(parts).join("\n"), sent);
  if (extra.length) problems.push(`These numbers aren't in the ${kind === "market_update" ? "statistics" : "CMA"}: ${extra.slice(0, 8).join(", ")}. Use the figures shown, or take them out.`);
  if (kind === "cma_writeup" && !/not an appraisal/i.test(parts.summary ?? "")) problems.push('Say in the summary that this is a comparison of recent sales, "not an appraisal".');
  return problems;
}
