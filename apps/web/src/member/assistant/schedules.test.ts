import { describe, expect, it } from "vitest";
import type { AiDeps, AiStore, ModelClient, ModelRequest } from "@vabrato/ai";
import { buildFixtures } from "@vabrato/mls/mock";
import { MEMBER_MESSAGES } from "./ask";
import { homeForAi, type AiHome } from "./listings";
import { SCHEDULE_MESSAGES, memberDate, pacificHm, movingPlan, namesContractDeadline, planItems, prelistingPlan, tourDay, tourStops, type MovingAnchor, type TourInput } from "./schedules";

// Schedules (S5b PR 5) without the network. The model writes steps; our code
// does every date and never moves a date of record. Fictional data only.

const TODAY = "2026-11-14";
const SALE: MovingAnchor = { kind: "sale", moveDay: "2026-12-04", fixed: [{ label: "Close of escrow", date: "2026-12-04" }] };

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

const PLAN = {
  tasks: [
    { title: "Book movers", detail: "Get three written quotes.", offset_days: -21, category: "movers" },
    { title: "Forward your mail", detail: "Set it up a week ahead.", offset_days: -7, category: "address" },
    { title: "Start packing the garage", detail: "Begin with what you use least.", offset_days: -40, category: "packing" },
    { title: "Remove your contingencies", detail: "Sign the removal.", offset_days: -10, category: "other" },
    { title: "Budget $2,000 for movers", detail: "Typical cost.", offset_days: -20, category: "movers" },
    { title: "Book movers!", detail: "Again.", offset_days: -21, category: "movers" },
    { title: "Too early", detail: "x", offset_days: -400, category: "other" },
  ],
  tips: ["Label boxes by room.", "Your close of escrow is the key date."],
};

describe("plan items: our code does the dates", () => {
  it("dates from the anchor; past dates become 'as soon as possible'; deadlines, money and out-of-range steps dropped", () => {
    const { items, dropped, tips } = planItems("moving", PLAN, SALE.moveDay, TODAY);
    expect(items.map((i) => [i.title, i.date, i.asap])).toEqual([
      ["Start packing the garage", TODAY, true],
      ["Book movers", TODAY, true], // planned for Nov 13, already past
      ["Forward your mail", "2026-11-27", false],
    ]);
    expect(dropped).toBe(3); // contingencies, $2,000, -400 (the repeat is just skipped)
    expect(tips).toEqual(["Label boxes by room."]);
  });

  it("contract deadlines are recognised", () => {
    expect(namesContractDeadline("Remove the inspection contingency")).toBe(true);
    expect(namesContractDeadline("Confirm the close of escrow")).toBe(true);
    expect(namesContractDeadline("Book movers")).toBe(false);
  });

  it("dates the member types: from today, within a year", () => {
    expect(memberDate("2026-12-01", TODAY)).toEqual({ date: "2026-12-01" });
    expect(memberDate("2026-11-01", TODAY)).toEqual({ error: SCHEDULE_MESSAGES.pastDate });
    expect(memberDate("2028-01-01", TODAY)).toEqual({ error: SCHEDULE_MESSAGES.farDate });
    expect(memberDate("Dec 1", TODAY)).toEqual({ error: SCHEDULE_MESSAGES.noDate });
    expect(memberDate("2027-03-01", TODAY, 60)).toEqual({ error: SCHEDULE_MESSAGES.tourDate });
  });
});

describe("moving plan", () => {
  it("sends only the move day and the member's notes (contacts replaced); keeps the dates of record fixed", async () => {
    const { d, requests } = deps(PLAN);
    const card = await movingPlan(d, SALE, "We have a piano. Call me at 650-555-0142.", TODAY);
    expect(card).toMatchObject({ kind: "plan", planKind: "moving", anchor: "2026-12-04", fixed: SALE.fixed, dropped: 3 });
    const body = sent(requests);
    expect(body).toContain("Dec 4, 2026");
    expect(body).toContain("piano");
    expect(body).not.toContain("650-555-0142");
  });

  it("wiring details in the notes: refused, nothing sent; wiring or Fair Housing in the answer: not shown", async () => {
    const { d, requests } = deps(PLAN);
    expect(await movingPlan(d, SALE, "Wire it to routing number 999999999, account 000123456789.", TODAY)).toMatchObject({ kind: "error", message: SCHEDULE_MESSAGES.payment });
    expect(requests).toHaveLength(0);
    const wiring = deps({ ...PLAN, tips: ["Wire the deposit to routing number 999999999, account 000123456789."] });
    expect(await movingPlan(wiring.d, SALE, "", TODAY)).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.payment_instructions });
    const steering = deps({ ...PLAN, tips: ["The new street is perfect for families with young kids."] });
    expect(await movingPlan(steering.d, SALE, "", TODAY)).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.fair_housing_output });
  });

  it("an extra field isn't used; a plan with nothing usable is an error", async () => {
    expect(await movingPlan(deps({ ...PLAN, budget: 9000 }).d, SALE, "", TODAY)).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.invalid_output });
    expect(await movingPlan(deps({ tasks: [PLAN.tasks[3]], tips: [] }).d, SALE, "", TODAY)).toMatchObject({ kind: "error", message: SCHEDULE_MESSAGES.empty });
  });
});

describe("pre-listing checklist", () => {
  it("counts back from the list date the seller typed; never forward", async () => {
    const { d, requests } = deps({
      tasks: [
        { title: "Fix the leaky faucet", detail: "Small repairs first.", offset_days: -28, category: "repairs" },
        { title: "Book the photographer", detail: "A week ahead.", offset_days: -7, category: "photos" },
        { title: "After listing", detail: "x", offset_days: 5, category: "other" },
      ],
      tips: [],
    });
    const card = await prelistingPlan(d, "2027-01-08", "occupied", "Old carpet in the den.", TODAY);
    expect(card).toMatchObject({ kind: "plan", planKind: "prelisting", anchor: "2027-01-08", dropped: 1 });
    expect((card as { items: { date: string }[] }).items.map((i) => i.date)).toEqual(["2026-12-11", "2027-01-01"]);
    expect(sent(requests)).toContain("occupied");
  });
});

// --- Tour day: the fictional MLS fixtures, cut to IDX as the website does ---------------------
const FIX = new Map(buildFixtures().properties.map((p) => [p.ListingKey as string, p]));
function fixture(key: string): AiHome | { key: string; label: string; broker: string | null } {
  const data = FIX.get(key)!;
  const r = homeForAi({ listing_key: key, city: String(data.City), list_office_name: String(data.ListOfficeName), address_display: data.InternetAddressDisplayYN !== false, avm_display: data.InternetAutomatedValuationDisplayYN !== false, comments_display: data.InternetConsumerCommentYN !== false, data }, null, "IDX");
  return "home" in r ? r.home : r.excluded;
}
const tourInput = (keys: string[], places: Record<string, { lat: number | null; lng: number | null; openHouse: { start: string; end: string | null } | null }>): TourInput => {
  const homes: AiHome[] = [];
  const excluded: TourInput["excluded"] = [];
  for (const k of keys) {
    const f = fixture(k);
    if ("fields" in f) homes.push(f);
    else excluded.push(f);
  }
  return { date: "2026-11-21", homes, excluded, places: new Map(Object.entries(places)) };
};
const FULL_CANARIES = /PrivateRemarks|ShowingContact|ShowingInstructions|ListAgentEmail|OwnerName|X_FixtureInternalNote|ListOfficePhone/;

describe("tour day", () => {
  const input = () =>
    tourInput(["FX-001", "FX-002", "FX-013"], {
      "FX-001": { lat: 37.5, lng: -122.26, openHouse: null },
      "FX-002": { lat: 37.48, lng: -122.23, openHouse: { start: "10:00", end: "12:00" } },
      "FX-013": { lat: 37.39, lng: -122.08, openHouse: null },
    });

  it("our code orders the stops (open house first); the opted-out home stays in the order but gets no letter", () => {
    const stops = tourStops(input());
    expect(stops.map((s) => [s.key, s.letter])).toEqual([
      ["FX-002", "A"],
      ["FX-001", "B"],
      ["FX-013", null],
    ]);
    expect(stops[1]!.milesFromPrevious).toBeGreaterThan(0);
  });

  it("sends only the lettered homes' listing facts; notes land on their stops", async () => {
    const { d, requests } = deps({ summary: ["Start at the 10:00 open house."], stops: [{ letter: "A", look_for: ["The kitchen"] }, { letter: "B", look_for: ["The yard"] }, { letter: "Z", look_for: ["?"] }], bring: ["A tape measure"] });
    const card = await tourDay(d, input());
    expect(card).toMatchObject({ kind: "tour", summary: ["Start at the 10:00 open house."], bring: ["A tape measure"] });
    const stops = (card as { stops: { key: string; lookFor: string[] }[] }).stops;
    expect(stops.map((s) => s.lookFor)).toEqual([["The kitchen"], ["The yard"], []]);
    expect(sent(requests)).not.toContain("FX-013");
    expect(sent(requests)).not.toMatch(FULL_CANARIES);
    expect(sent(requests)).toContain("OpenHouseOnTourDay");
  });

  it("a value opinion or a dollar figure we didn't send: not shown", async () => {
    expect(await tourDay(deps({ summary: ["Home A is underpriced."], stops: [], bring: [] }).d, input())).toMatchObject({ kind: "error", message: SCHEDULE_MESSAGES.value });
    expect(await tourDay(deps({ summary: ["Expect $9,500 in taxes at Home B."], stops: [], bring: [] }).d, input())).toMatchObject({ kind: "error", message: SCHEDULE_MESSAGES.money });
  });

  it("fewer than two homes: refused; all opted out: the order only, nothing sent", async () => {
    const one = deps({ summary: [], stops: [], bring: [] });
    expect(await tourDay(one.d, tourInput(["FX-001"], {}))).toMatchObject({ kind: "error", message: SCHEDULE_MESSAGES.tooFew });
    const optedOut = tourInput(["FX-013", "FX-013"], {});
    optedOut.excluded.push({ key: "FX-999", label: "A home in Fiction", broker: null });
    expect(await tourDay(one.d, optedOut)).toMatchObject({ kind: "tour", summary: [SCHEDULE_MESSAGES.noneSent] });
    expect(one.requests).toHaveLength(0);
  });
});

describe("open-house times", () => {
  it("stored UTC timestamps read as Pacific time", () => {
    expect(pacificHm("2026-11-15T21:00:00+00:00")).toBe("13:00");
    expect(pacificHm("2026-07-15T17:30:00+00:00")).toBe("10:30"); // daylight time
    expect(pacificHm("not a time")).toBeNull();
  });
});
