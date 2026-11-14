import { describe, expect, it } from "vitest";
import type { AiDeps, AiStore, ModelClient, ModelRequest } from "@vabrato/ai";
import { buildFixtures } from "@vabrato/mls/mock";
import { MEMBER_MESSAGES } from "./ask";
import { LISTING_MESSAGES, askAboutHome, compareHomes, dollarFigures, fieldLabel, unsentDollar, valueOpinion } from "./listing-ask";
import { homeForAi, type HomesForAi } from "./listings";

// "Compare homes" and "Ask about a home" (S5b PR 4) without the network, on
// the fictional MLS fixtures. Each fixture record also carries FULL fields
// (private remarks, showing contact, agent email, owner name) and an
// internal note: none of them may ever reach the model.

const FIX = new Map(buildFixtures().properties.map((p) => [p.ListingKey as string, p]));
const row = (key: string, over: Partial<{ address_display: boolean; avm_display: boolean; comments_display: boolean }> = {}) => {
  const data = FIX.get(key)!;
  return {
    listing_key: key,
    city: data.City as string,
    list_office_name: data.ListOfficeName as string,
    address_display: data.InternetAddressDisplayYN !== false,
    avm_display: data.InternetAutomatedValuationDisplayYN !== false,
    comments_display: data.InternetConsumerCommentYN !== false,
    // What the sync stores: the full record here, so the tests prove our own allowlist does the cutting.
    data,
    ...over,
  };
};
const load = (keys: string[], level: "IDX" | "VOW" = "IDX"): HomesForAi => {
  const out: HomesForAi = { homes: [], excluded: [], missing: [] };
  for (const k of keys) {
    const r = homeForAi(row(k), level === "VOW" ? (FIX.get(k) as Record<string, unknown>) : null, level);
    if ("home" in r) out.homes.push(r.home);
    else out.excluded.push(r.excluded);
  }
  return out;
};
const FULL_CANARIES = /PrivateRemarks|ShowingContact|ShowingInstructions|ListAgentEmail|ListAgentDirectPhone|ListAgentMobilePhone|OwnerName|OccupantName|LockBox|X_FixtureInternalNote|ListOfficePhone/;

function deps(reply: unknown) {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return { text: JSON.stringify(reply), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 900, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  const store: AiStore = { begin: async () => ({ allowed: true, run_id: "run-1" }), finish: async () => undefined };
  return { d: { store, model, log: () => undefined } as AiDeps, requests };
}
const sent = (r: ModelRequest[]) => JSON.stringify(r[0] ?? null);

const COMPARE = {
  summary: ["Home A is larger, with 4 bedrooms; Home B has 3."],
  differences: [{ topic: "Size", values: ["2,150 sq ft", "1,580 sq ft"] }, { topic: "Price", values: ["$2,195,000", "$1,649,000"] }],
  questions: ["Ask your agent about the HOA for Home B."],
};

describe("which homes, and which fields, are sent", () => {
  it("IDX: listing facts only; no FULL field, contact or internal note; the broker kept for attribution", () => {
    const h = load(["FX-001"]).homes[0]!;
    expect(h.fields).toMatchObject({ ListingKey: "FX-001", ListPrice: 2_195_000, BedroomsTotal: 4 });
    expect(JSON.stringify(Object.keys(h.fields))).not.toMatch(FULL_CANARIES);
    expect(h.fields).not.toHaveProperty("ClosePrice");
    expect(h.broker).toBeTruthy();
  });

  it("VOW adds sold fields; IDX never has them", () => {
    expect(load(["FX-005"], "VOW").homes[0]!.fields).toHaveProperty("ClosePrice");
    expect(load(["FX-005"], "IDX").homes[0]!.fields).not.toHaveProperty("ClosePrice");
  });

  it("a hidden address stays hidden, and the home is named by its city", () => {
    const h = load(["FX-012"]).homes[0]!;
    expect(h.fields).not.toHaveProperty("UnparsedAddress");
    expect(h.label).toBe(`A home in ${FIX.get("FX-012")!.City}`);
  });

  it("MLS-3: a seller's AVM or comments opt-out keeps the home away from the model (by the record or the stored column)", () => {
    expect(load(["FX-013"])).toMatchObject({ homes: [], excluded: [{ key: "FX-013" }] });
    const r = homeForAi(row("FX-001", { comments_display: false }), null, "IDX");
    expect("excluded" in r).toBe(true);
  });
});

describe("compare homes", () => {
  it("sends each home as a lettered data block; returns the cleaned comparison", async () => {
    const { d, requests } = deps(COMPARE);
    const card = await compareHomes(d, load(["FX-001", "FX-002"]));
    expect(card).toMatchObject({ kind: "compare", homes: [{ key: "FX-001", letter: "A" }, { key: "FX-002", letter: "B" }], excluded: [] });
    expect(sent(requests)).toContain('label=\\"Home A');
    expect(sent(requests)).not.toMatch(FULL_CANARIES);
    expect(sent(requests)).toContain("PricePerSqFt");
  });

  it("an opted-out home is listed but never sent", async () => {
    const { d, requests } = deps(COMPARE);
    const card = await compareHomes(d, load(["FX-001", "FX-002", "FX-013"]));
    expect(card).toMatchObject({ kind: "compare", excluded: [{ key: "FX-013" }] });
    expect(sent(requests)).not.toContain("FX-013");
  });

  it("fewer than two homes to send: refused with nothing sent", async () => {
    const one = deps(COMPARE);
    expect(await compareHomes(one.d, load(["FX-001"]))).toMatchObject({ kind: "error", message: LISTING_MESSAGES.tooFew });
    expect(await compareHomes(one.d, load(["FX-001", "FX-013"]))).toMatchObject({ kind: "error", message: LISTING_MESSAGES.noneSent });
    expect(one.requests).toHaveLength(0);
  });

  it("a price opinion, or a dollar figure we didn't send: not shown", async () => {
    const value = deps({ ...COMPARE, summary: ["Home B looks underpriced for the area."] });
    expect(await compareHomes(value.d, load(["FX-001", "FX-002"]))).toMatchObject({ kind: "error", message: LISTING_MESSAGES.value });
    const money = deps({ ...COMPARE, differences: [{ topic: "Taxes", values: ["About $24,000 a year", "Not listed"] }] });
    expect(await compareHomes(money.d, load(["FX-001", "FX-002"]))).toMatchObject({ kind: "error", message: LISTING_MESSAGES.money });
  });

  it("Fair Housing wording, wiring details or an extra field: not shown", async () => {
    expect(await compareHomes(deps({ ...COMPARE, summary: ["Home A is perfect for families with young kids."] }).d, load(["FX-001", "FX-002"]))).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.fair_housing_output });
    expect(await compareHomes(deps({ ...COMPARE, questions: ["Wire the deposit to routing number 999999999, account 000123456789."] }).d, load(["FX-001", "FX-002"]))).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.payment_instructions });
    expect(await compareHomes(deps({ ...COMPARE, verdict: "buy A" }).d, load(["FX-001", "FX-002"]))).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.invalid_output });
  });
});

describe("ask about a home", () => {
  const ANSWER = { answer: "The lot is listed at 6,000 square feet.", fields_used: ["LotSizeSquareFeet", "PrivateRemarks", "MadeUp"], not_in_listing: false };

  it("sends the question and the home's facts; sources only name fields we sent", async () => {
    const { d, requests } = deps(ANSWER);
    const card = await askAboutHome(d, load(["FX-001"]), "How big is the lot?");
    expect(card).toMatchObject({ kind: "listing", home: { key: "FX-001" }, sources: ["Lot size square feet"], notInListing: false });
    expect(sent(requests)).not.toMatch(FULL_CANARIES);
  });

  it("a steering question is refused before anything is sent", async () => {
    const { d, requests } = deps(ANSWER);
    expect(await askAboutHome(d, load(["FX-001"]), "Is this a good neighborhood for families with kids?")).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.fair_housing_input });
    expect(requests).toHaveLength(0);
  });

  it("an opted-out home, a home that isn't theirs, an empty question: member messages, nothing sent", async () => {
    const { d, requests } = deps(ANSWER);
    expect(await askAboutHome(d, load(["FX-013"]), "How big is the lot?")).toMatchObject({ kind: "error", message: LISTING_MESSAGES.optedOut });
    expect(await askAboutHome(d, { homes: [], excluded: [], missing: ["FX-999"] }, "How big is the lot?")).toMatchObject({ kind: "error", message: LISTING_MESSAGES.notFound });
    expect(await askAboutHome(d, load(["FX-001"]), "   ")).toMatchObject({ kind: "error", message: LISTING_MESSAGES.noQuestion });
    expect(requests).toHaveLength(0);
  });

  it("a value opinion or invented figure in the answer: not shown", async () => {
    expect(await askAboutHome(deps({ ...ANSWER, answer: "It's a great deal at this price." }).d, load(["FX-001"]), "Is it priced well?")).toMatchObject({ kind: "error", message: LISTING_MESSAGES.value });
    expect(await askAboutHome(deps({ ...ANSWER, answer: "Expect about $9,500 a year in taxes." }).d, load(["FX-001"]), "Taxes?")).toMatchObject({ kind: "error", message: LISTING_MESSAGES.money });
  });
});

describe("the checks themselves", () => {
  it("value opinions are caught; plain facts aren't", () => {
    expect(valueOpinion("It looks overpriced.")).toBe("overpriced");
    expect(valueOpinion("Is it worth $2M?")).toBeTruthy();
    expect(valueOpinion("The list price is $2,195,000 and it has 4 bedrooms.")).toBeNull();
  });

  it("dollar figures: exact ones must match; shorthand may round", () => {
    expect(dollarFigures("$2,195,000 or $2.2M or $450k")).toEqual([{ value: 2_195_000, approx: false }, { value: 2_200_000, approx: true }, { value: 450_000, approx: true }]);
    expect(unsentDollar("Listed at $2,195,000 ($2.2M).", [2_195_000])).toBeNull();
    expect(unsentDollar("Listed at $2,190,000.", [2_195_000])).toBe(2_190_000);
  });

  it("field names read as words", () => {
    expect(fieldLabel("LotSizeSquareFeet")).toBe("Lot size square feet");
    expect(fieldLabel("PoolPrivateYN")).toBe("Pool private");
    expect(fieldLabel("PricePerSqFt")).toMatch(/worked out/);
  });
});

