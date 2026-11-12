import { describe, expect, it } from "vitest";
import { runAi, type AiFeature, type AiStore, type ModelClient, type ModelRequest } from "@vabrato/ai";
import { ASSISTANT_FEATURES } from "./assistant";
import { prepareNote } from "./drafts";
import { KIT_PARTS, bullets, cleanParts, partsText, presentationParts, sections } from "./kit-parts";
import { LISTING_KIT, PRESENTATIONS, kitInput, kitToParts, partsProblems, presentationInput, presentationToParts, typicalTimeline, type KitAnswer } from "./kits";

// S6b PR 5: launch kits and presentations. What each sends, how answers become
// editable parts, and what blocks approval. Fictional listing and people.

const LISTING = {
  ListingKey: "FX-001",
  StandardStatus: "Active",
  ListPrice: 1_950_000,
  UnparsedAddress: "12 Fictional Lane, San Carlos, CA 94070",
  City: "San Carlos",
  BedroomsTotal: 3,
  PublicRemarks: "Remodeled kitchen and a sunny yard.",
  InternetAddressDisplayYN: true,
  ListAgentFullName: "Avery Example",
  ListAgentEmail: "avery@example.test",
  ListAgentMobilePhone: "650-555-0101",
  ListOfficePhone: "650-555-0100",
  PrivateRemarks: "Seller motivated; will consider 1.8M.",
  ShowingInstructions: "Lockbox on the side gate, code 1234.",
  LockBoxLocation: "Side gate",
  OwnerName: "Fictional Owner",
  OccupantPhone: "650-555-0102",
};

const KIT: KitAnswer = {
  mls_description: "Light-filled three-bedroom home with a remodeled kitchen and a sunny yard.",
  headline: "Light-filled in San Carlos",
  instagram: "Just listed in San Carlos. #justlisted",
  facebook: "Just listed: a light-filled three-bedroom home.",
  linkedin: "Proud to bring this San Carlos home to market.",
  email_subject: "Just listed: 12 Fictional Lane",
  email_body: "Hi,\n\nI've just listed a three-bedroom home in San Carlos.\n\nAvery",
  flyer_headline: "Light-filled in San Carlos",
  flyer_bullets: ["Remodeled kitchen", " Sunny yard ", "", "Three bedrooms", "4", "5", "6", "7"],
  flyer_blurb: "A bright, updated home close to parks.",
};

async function ask<T>(feature: AiFeature<T>, input: Parameters<typeof runAi>[2], answer: unknown) {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return { text: JSON.stringify(answer), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 2000, outputTokens: 800, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  const store: AiStore = { begin: async () => ({ allowed: true, run_id: "run-1" }), finish: async () => undefined };
  return { result: await runAi({ store, model, log: () => undefined }, feature, input), request: requests[0] };
}

describe("the two features", () => {
  it("each has a switch on /assistant matching its pipeline key; both presentations share one", () => {
    const flags = ASSISTANT_FEATURES.map((f) => f.flag);
    expect(flags).toContain(`ai_${LISTING_KIT.key}`);
    expect(PRESENTATIONS.listing_presentation.key).toBe("staff_presentations");
    expect(PRESENTATIONS.buyer_presentation.key).toBe("staff_presentations");
    expect(flags).toContain("ai_staff_presentations");
  });

  it("the instructions forbid prices, invented facts, contact details and describing people", () => {
    for (const f of [LISTING_KIT, PRESENTATIONS.listing_presentation, PRESENTATIONS.buyer_presentation]) {
      expect(f.system).toMatch(/Never suggest a price/);
      expect(f.system).toMatch(/never the people who live there/);
      expect(f.system).toMatch(/Don't include phone numbers, email addresses or links/);
      expect(f.system).not.toMatch(/Avery|Fictional|@/);
    }
  });
});

describe("what a launch kit sends", () => {
  it("public listing facts only: no private remarks, showing or lockbox details, agent or owner contacts", () => {
    const text = JSON.stringify(kitInput(LISTING, "Avery Example"));
    expect(text).toContain("Remodeled kitchen");
    expect(text).toContain("1950000");
    expect(text).toMatch(/Sign as: Avery, Vabrato/);
    for (const never of ["Seller motivated", "1.8M", "Lockbox", "Side gate", "avery@example.test", "650-555", "Fictional Owner"]) expect(text).not.toContain(never);
  });

  it("the listing goes in as data; the agent's note is the instruction and is checked", async () => {
    const { request } = await ask(LISTING_KIT, { instruction: "New roof in 2024", parts: kitInput(LISTING, "Avery Example") }, KIT);
    const texts = request!.parts.map((p) => (p.type === "text" ? p.text : ""));
    expect(texts.find((t) => t.includes("Remodeled kitchen"))).toMatch(/^<data label="The listing/);
    expect(texts.at(-1)).toMatch(/New roof in 2024/);
    expect(prepareNote("Gate code 4321, key is under the mat").error).toMatch(/Leave lockbox codes/);
    const { result } = await ask(LISTING_KIT, { instruction: "Say it's perfect for young families", parts: kitInput(LISTING, null) }, KIT);
    expect(result).toMatchObject({ ok: false, reason: "fair_housing_input" });
  });

  it("an answer that steers isn't shown", async () => {
    const { result } = await ask(LISTING_KIT, { parts: kitInput(LISTING, null) }, { ...KIT, facebook: "Perfect for young families!" });
    expect(result).toMatchObject({ ok: false, reason: "fair_housing_output" });
  });

  it("becomes editable parts: highlights one per line, at most 6", () => {
    const parts = kitToParts(KIT);
    expect(Object.keys(parts)).toEqual(KIT_PARTS.map((p) => p.key));
    expect(parts.flyer_bullets).toBe("Remodeled kitchen\nSunny yard\nThree bedrooms\n4\n5\n6");
    expect(bullets(parts.flyer_bullets)).toHaveLength(6);
    expect(partsText("listing_kit", parts)).toMatch(/^MLS description\nLight-filled/);
  });
});

describe("approving a kit", () => {
  const ok = kitToParts(KIT);
  it("a clean kit can be approved", () => {
    expect(partsProblems("listing_kit", ok)).toEqual([]);
  });

  it("the MLS description can't carry contact details or links, or run long", () => {
    for (const bad of ["Call Avery at 650-555-0101.", "Email avery@example.test.", "See www.example.com.", "Details at https://example.test/x", "Visit fictionalhome.com"]) {
      expect(partsProblems("listing_kit", { ...ok, mls_description: bad }).join(" "), bad).toMatch(/MLS rules/);
    }
    expect(partsProblems("listing_kit", { ...ok, mls_description: "x".repeat(1001) }).join(" ")).toMatch(/1,000 characters/);
  });

  it("steering wording in any part, wiring details, or a missing required part block approval", () => {
    expect(partsProblems("listing_kit", { ...ok, linkedin: "Ideal for retirees." }).join(" ")).toMatch(/Fair Housing: reword "Ideal for retirees"/i);
    expect(partsProblems("listing_kit", { ...ok, email_body: "Wire instructions: routing 021000021 account 000123456789" }).join(" ")).toMatch(/wiring/);
    expect(partsProblems("listing_kit", { ...ok, flyer_blurb: "" }).join(" ")).toMatch(/Fill in "Flyer: short description"/);
  });

  it("unknown parts are dropped and long ones cut", () => {
    const parts = cleanParts("listing_kit", { ...ok, evil: "<script>", mls_description: "y".repeat(5000) });
    expect(parts).not.toHaveProperty("evil");
    expect(parts.mls_description).toHaveLength(1000);
  });
});

describe("presentations", () => {
  it("send the client's first name, the place, the agent's title and bio (as data); never contacts or prices", () => {
    const parts = presentationInput({ kind: "listing_presentation", clientFirstName: "Dana Example", place: "12 Fictional Lane, San Carlos", agent: { name: "Avery Example", title: "Realtor", bio: "Fifteen years selling homes on the Peninsula." } });
    const text = JSON.stringify(parts);
    expect(text).toMatch(/Client: Dana\./);
    expect(text).toMatch(/Their home: 12 Fictional Lane, San Carlos\./);
    expect(text).toMatch(/The agent: Avery, Realtor/);
    expect(parts.find((p) => p.type === "data")).toMatchObject({ label: "The agent's own bio" });
    expect(text).not.toMatch(/Dana Example|Avery Example|\$|price/i);
    expect(PRESENTATIONS.listing_presentation.system).toMatch(/Don't discuss price/);
  });

  it("the timeline comes from the schedule engine's usual contingency days and a 30-day close", () => {
    expect(typicalTimeline()).toEqual([
      { day: 0, label: "Offer accepted; escrow opens and the deposit goes to escrow" },
      { day: 7, label: "Buyer's insurance and loan contingency removal" },
      { day: 8, label: "Buyer's appraisal and inspections (property condition) contingency removal" },
      { day: 30, label: "Close of escrow" },
    ]);
  });

  it("answers become a title and up to 6 sections", () => {
    const parts = presentationToParts("buyer_presentation", {
      title: "Buying with Vabrato",
      sections: Array.from({ length: 8 }, (_, i) => ({ heading: `Part ${i + 1}`, paragraphs: ["One.", "Two."] })),
    });
    expect(Object.keys(parts)).toEqual(presentationParts().map((p) => p.key));
    expect(sections(parts)).toHaveLength(6);
    expect(sections(parts)[0]).toEqual({ heading: "Part 1", paragraphs: ["One.", "Two."] });
    expect(partsProblems("buyer_presentation", parts)).toEqual([]);
    expect(partsProblems("buyer_presentation", { ...parts, title: "" }).join(" ")).toMatch(/Fill in "Title"/);
  });
});
