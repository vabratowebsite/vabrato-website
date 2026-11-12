import { describe, expect, it } from "vitest";
import { runAi, type AiFeature, type AiStore, type ModelClient, type ModelRequest } from "@vabrato/ai";
import { ASSISTANT_FEATURES } from "./assistant";
import { CMA_WRITEUP, MARKET_UPDATE, cmaFactsJson, cmaInput, cmaToParts, marketInput, marketToParts, numbersInText, numbersNotSent, writeupProblems, type CmaFacts } from "./market-cma";

// S6b PR 6: market updates and CMA write-ups. The numbers check, what each
// sends, and what blocks approval. Fictional stats and sales.

const STATS = {
  city: "san-carlos",
  city_name: "San Carlos",
  months: 6,
  since: "2026-05-01",
  min_sales_for_medians: 5,
  sold: { count: 24, median_price: 1948000, median_price_per_sqft: 1123, median_days_on_market: 18, median_sale_to_list: 1.023 },
  market: { active: 31, pending: 9, median_list_price: 2195000, months_of_inventory: 7.8 },
  by_month: [
    { month: "2026-09-01", sold: 5, median_price: 1910000 },
    { month: "2026-10-01", sold: 6, median_price: 2010000 },
  ],
};

const CMA: CmaFacts = {
  subject: { city: "Belmont", sub_type: "Single Family Residence", beds: 3, baths: 2, sqft: 1600 },
  comps: [
    { listing_key: "QA-S1", street: "1 Fixture Way", city: "Belmont", property_sub_type: "Single Family Residence", bedrooms_total: 3, bathrooms_total: 2, living_area: 1550, close_price: 1850000, close_date: "2026-09-12", list_price: 1795000, price_per_sqft: 1194, days_on_market: 9 },
    { listing_key: "QA-S2", street: "2 Fixture Way", city: "Belmont", property_sub_type: "Single Family Residence", bedrooms_total: 3, bathrooms_total: 2, living_area: 1700, close_price: 1960000, close_date: "2026-08-30", list_price: 1998000, price_per_sqft: 1153, days_on_market: 21 },
  ],
  range: { comps: 2, medianPpsf: 1173, low: 1855000, mid: 1875000, high: 1895000 },
};

async function ask<T>(feature: AiFeature<T>, input: Parameters<typeof runAi>[2], answer: unknown) {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return { text: JSON.stringify(answer), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 2000, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  const store: AiStore = { begin: async () => ({ allowed: true, run_id: "run-1" }), finish: async () => undefined };
  return { result: await runAi({ store, model, log: () => undefined }, feature, input), request: requests[0] };
}

describe("the numbers check", () => {
  it("reads numbers as people write them", () => {
    expect(numbersInText("$1,948,000, about $1.95M or $1.95 million; 102.3% of list; 18 days; 7.8 months").map((n) => n.value)).toEqual([1948000, 1950000, 1950000, 102.3, 18, 7.8]);
    expect(numbersInText("$950K and 1.2 thousand").map((n) => n.value)).toEqual([950000, 1200]);
  });

  it("passes the figures we sent, rounded for reading, and ratios as percentages", () => {
    const text = "The median sale price was about $1.95 million ($1,948,000), or $1,123 per square foot. Homes sold in 18 days at 102.3% of list. 31 homes are for sale, about 7.8 months of inventory, and 24 sold in the last 6 months, in 2026.";
    expect(numbersNotSent(text, STATS)).toEqual([]);
  });

  it("lists every figure we didn't send", () => {
    expect(numbersNotSent("Prices rose 12.5% to a median of $2,250,000, with 47 sales.", STATS)).toEqual(["12.5%", "$2,250,000", "47"]);
  });

  it("small counts and years don't need to be sent", () => {
    expect(numbersNotSent("Two of the 3 bedrooms face south; built in 1998.", STATS)).toEqual([]);
  });
});

describe("market updates", () => {
  it("send only our computed statistics, as data; the instructions forbid new numbers and predictions", async () => {
    const { request } = await ask(MARKET_UPDATE, { instruction: "Lead with speed of sales", parts: marketInput(STATS) }, { title: "San Carlos", excerpt: "x", body_md: "y" });
    const data = request!.parts.map((p) => (p.type === "text" ? p.text : "")).find((t) => t.includes("1948000"))!;
    expect(data).toMatch(/^<data label="Market statistics computed by the console/);
    expect(request!.system).toMatch(/Don't calculate new figures/);
    expect(request!.system).toMatch(/don't predict prices/);
    expect(MARKET_UPDATE.system).not.toMatch(/San Carlos|1948000/);
  });

  it("an invented figure blocks approval; ours pass", () => {
    const good = marketToParts({ title: "San Carlos, last 6 months", excerpt: "24 homes sold at a median of about $1.95 million.", body_md: "Homes sold in a median 18 days, at 102.3% of list price." });
    expect(writeupProblems("market_update", good, STATS)).toEqual([]);
    const bad = { ...good, body_md: "Prices will rise 15% next year." };
    expect(writeupProblems("market_update", bad, STATS).join(" ")).toMatch(/These numbers aren't in the statistics: 15%/);
  });

  it("steering wording or wiring details aren't shown", async () => {
    const steer = await ask(MARKET_UPDATE, { parts: marketInput(STATS) }, { title: "x", excerpt: "x", body_md: "A safe, family-friendly neighborhood for young families." });
    expect(steer.result).toMatchObject({ ok: false, reason: "fair_housing_output" });
    const wire = await ask(MARKET_UPDATE, { parts: marketInput(STATS) }, { title: "x", excerpt: "x", body_md: "Wire instructions: routing 021000021 account 000123456789" });
    expect(wire.result).toMatchObject({ ok: false, reason: "payment_instructions" });
  });
});

describe("CMA write-ups", () => {
  it("send the home, each comparable's public sale facts and our range; nothing else", () => {
    const facts = cmaFactsJson(CMA);
    expect(Object.keys(facts.comparables[0]!)).toEqual(["key", "street", "city", "type", "beds", "baths", "sqft", "sold_price", "sold_on", "list_price", "price_per_sqft", "days_on_market"]);
    expect(facts.range).toEqual({ comparables_used: 2, median_price_per_sqft: 1173, low: 1855000, middle: 1875000, high: 1895000 });
    expect(JSON.stringify(cmaInput(CMA))).not.toMatch(/PrivateRemarks|ShowingInstructions|@|BuyerName|SellerName/);
    expect(CMA_WRITEUP.system).toMatch(/not an appraisal/);
    expect(CMA_WRITEUP.system).toMatch(/Never give your own value or adjust the range/);
  });

  it("with no range, the assistant is told not to estimate one", () => {
    expect(JSON.stringify(cmaInput({ ...CMA, range: null }))).toMatch(/don't estimate one/);
  });

  it("notes only for the comparables we sent; 'not an appraisal' and our numbers required", () => {
    const parts = cmaToParts({ summary: "Two nearby sales put the range at $1,855,000 to $1,895,000. This is a comparison of recent sales, not an appraisal.", comparables: [{ key: "QA-S1", note: "Slightly smaller, sold in 9 days." }, { key: "MADE-UP", note: "x" }], adjustments_note: "Condition matters." }, ["QA-S1", "QA-S2"]);
    expect(parts.comparables).toBe("QA-S1: Slightly smaller, sold in 9 days.");
    expect(writeupProblems("cma_writeup", parts, cmaFactsJson(CMA))).toEqual([]);
    expect(writeupProblems("cma_writeup", { ...parts, summary: "Worth about $2,400,000." }, cmaFactsJson(CMA)).join(" ")).toMatch(/\$2,400,000.*not an appraisal/s);
  });
});

it("each feature has its switch on /assistant", () => {
  const flags = ASSISTANT_FEATURES.map((f) => f.flag);
  expect(flags).toContain(`ai_${MARKET_UPDATE.key}`);
  expect(flags).toContain(`ai_${CMA_WRITEUP.key}`);
});
