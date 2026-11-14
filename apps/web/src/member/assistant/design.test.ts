import { describe, expect, it } from "vitest";
import type { AiDeps, AiStore, ModelClient, ModelRequest } from "@vabrato/ai";
import { MEMBER_MESSAGES } from "./ask";
import { DESIGN_MESSAGES, checkHex, cleanColors, cleanFlyer, flyer, flyerProblem, palette, staging } from "./design";

// Design (S5b PR 6) without the network. The model returns words and colors;
// our code checks them and draws everything. A flyer is written only from the
// seller's words. Fictional data only.

function deps(reply: unknown) {
  const requests: ModelRequest[] = [];
  const model: ModelClient = {
    async generate(req) {
      requests.push(req);
      return { text: JSON.stringify(reply), citations: [], stop: "end", model: "claude-opus-5-5", usage: { inputTokens: 500, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
  const store: AiStore = { begin: async () => ({ allowed: true, run_id: "run-1" }), finish: async () => undefined };
  return { d: { store, model, log: () => undefined } as AiDeps, requests };
}
const sent = (r: ModelRequest[]) => JSON.stringify(r[0] ?? null);

const PALETTE = {
  name: "Light and warm",
  colors: [
    { hex: "#f5f0e6", name: "Warm white", use: "walls" },
    { hex: "#8A9A5B", name: "Sage (Sherwin-Williams SW 6178)", use: "accent" },
    { hex: "#F5F0E6", name: "Duplicate", use: "trim" },
    { hex: "red", name: "Not a hex", use: "trim" },
    { hex: "#C8B89A", name: "Oat", use: "textiles" },
    { hex: "#2F3B4C", name: "Ink blue", use: "nowhere" },
  ],
  tiles: [
    { label: "Oak floor", hex: "#B8875A", kind: "material" },
    { label: "Linen curtains", hex: "#E9E2D3", kind: "texture" },
    { label: "Bad", hex: "#12345", kind: "material" },
    { label: "Adds $20k in value", hex: "#123456", kind: "material" },
  ],
  notes: ["Use the warm white on all walls.", "Call 650-555-0199 for a painter."],
};

describe("colors and moodboard", () => {
  it("checks hex codes", () => {
    expect(checkHex("#abcdef")).toBe("#ABCDEF");
    expect(checkHex(" #ABCDEF ")).toBe("#ABCDEF");
    for (const bad of ["abcdef", "#abc", "#abcdefg", "url(x)", 5, null]) expect(checkHex(bad)).toBeNull();
  });

  it("keeps real colors only, once each, without brand names; draws nothing from markup", async () => {
    const { d, requests } = deps(PALETTE);
    const card = await palette(d, "Living room, north light, want it to feel warmer. Email me at sam@example.test");
    expect(card.kind).toBe("palette");
    if (card.kind !== "palette") return;
    expect(card.colors).toEqual([
      { hex: "#F5F0E6", name: "Warm white", use: "walls" },
      { hex: "#8A9A5B", name: "Sage", use: "accent" },
      { hex: "#C8B89A", name: "Oat", use: "textiles" },
      { hex: "#2F3B4C", name: "Ink blue", use: "accent" },
    ]);
    expect(card.tiles.map((t) => t.label)).toEqual(["Oak floor", "Linen curtains"]);
    expect(card.notes).toEqual(["Use the warm white on all walls.", "Call for a painter."]);
    expect(card.dropped).toBe(4);
    // The member's email isn't sent.
    expect(sent(requests)).not.toContain("sam@example.test");
  });

  it("fewer than 3 real colors is an error; empty notes are refused before sending", async () => {
    const { d, requests } = deps({ ...PALETTE, colors: PALETTE.colors.slice(2, 4) });
    expect(await palette(d, "warm")).toMatchObject({ kind: "error", message: DESIGN_MESSAGES.tooFewColors });
    expect(await palette(d, "   ")).toMatchObject({ kind: "error", message: DESIGN_MESSAGES.noNotes });
    expect(requests.length).toBe(1);
  });

  it("caps colors at the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ hex: `#0000${String(10 + i)}`, name: `C${i}`, use: "walls" }));
    expect(cleanColors(many, 6).colors.length).toBe(6);
  });

  it("payment details are refused before anything is sent", async () => {
    const { d, requests } = deps(PALETTE);
    expect(await palette(d, "wire the deposit to routing number 121000358 account 12345678")).toMatchObject({ kind: "error", message: DESIGN_MESSAGES.payment });
    expect(requests.length).toBe(0);
  });
});

describe("staging ideas", () => {
  const STAGING = {
    summary: "Open the room up and warm the light.",
    keep: ["The sofa", "The sofa"],
    remove: ["Family photos", "The extra armchair"],
    add: ["A warm floor lamp", "A $400 rug"],
    arrange: ["Float the sofa off the wall", "Photoshop the view for the listing"],
    palette: [{ hex: "#C8B89A", name: "Oat", use: "textiles" }, { hex: "oops", name: "x", use: "accent" }],
    todos: [{ title: "Store the extra armchair", detail: "Before photos." }, { title: "Repaint to add value", detail: "Raises the price." }],
  };

  it("drops costs, value talk and faked photos; sends only the room type and notes", async () => {
    const { d, requests } = deps(STAGING);
    const card = await staging(d, "living", "Small living room with dark corners");
    expect(card.kind).toBe("staging");
    if (card.kind !== "staging") return;
    expect(card.keep).toEqual(["The sofa"]);
    expect(card.add).toEqual(["A warm floor lamp"]);
    expect(card.arrange).toEqual(["Float the sofa off the wall"]);
    expect(card.palette).toEqual([{ hex: "#C8B89A", name: "Oat", use: "textiles" }]);
    expect(card.todos).toEqual([{ title: "Store the extra armchair", detail: "Before photos." }]);
    expect(card.dropped).toBe(4); // $400, Photoshop, value to-do, bad hex
    expect(sent(requests)).toContain("Living room");
  });
});

describe("open-house flyer and posts", () => {
  const FLYER = {
    headline: "Sunny Craftsman with a garden",
    highlights: ["- Big south-facing yard", "New kitchen (2024)", "Visit https://example.test", "New kitchen (2024)"],
    blurb: "Light all day. Call 650-555-0123.",
    instagram: "Open house this weekend!\n\n#OpenHouse #SanCarlos",
    facebook: "Come see it.\nEmail sam@example.test",
  };

  it("sends only the seller's words and the kind, never listing facts; tidies the answer", async () => {
    const { d, requests } = deps(FLYER);
    const card = await flyer(d, "open_house", "We love the light and the yard. New kitchen in 2024.");
    expect(card.kind).toBe("flyer");
    if (card.kind !== "flyer") return;
    expect(card.highlights).toEqual(["Big south-facing yard", "New kitchen (2024)", "Visit"]);
    expect(card.blurb).toBe("Light all day. Call.");
    expect(card.facebook).toBe("Come see it.\nEmail");
    expect(card.instagram).toBe("Open house this weekend!\n\n#OpenHouse #SanCarlos");
    const body = sent(requests);
    expect(body).toContain("an open house");
    expect(body).not.toMatch(/ListPrice|UnparsedAddress|listing facts/);
  });

  it("price talk or a dollar figure blocks the flyer", async () => {
    const { d } = deps({ ...FLYER, blurb: "Priced to sell at $1.9M!" });
    expect(await flyer(d, "just_listed", "lovely home")).toMatchObject({ kind: "error", message: DESIGN_MESSAGES.value });
    const v = deps({ ...FLYER, blurb: "Undervalued gem." });
    expect(await flyer(v.d, "just_listed", "lovely home")).toMatchObject({ kind: "error" });
  });

  it("Fair Housing wording in the answer is blocked", async () => {
    const { d } = deps({ ...FLYER, blurb: "Perfect for a young family in a safe neighborhood." });
    expect(await flyer(d, "open_house", "lovely home")).toMatchObject({ kind: "error", message: MEMBER_MESSAGES.fair_housing_output });
  });

  it("the edited flyer is checked again when sent", () => {
    const f = cleanFlyer({ headline: "x".repeat(200), highlights: "a\nb\n\nc", blurb: "fine", instagram: "", facebook: "" });
    expect(f.headline.length).toBe(80);
    expect(f.highlights).toEqual(["a", "b", "c"]);
    expect(flyerProblem(f)).toBeNull();
    expect(flyerProblem({ ...f, headline: "" })).toBe("Add a headline.");
    expect(flyerProblem({ ...f, blurb: "Just $5,000 under appraisal" })).toBe(DESIGN_MESSAGES.value);
  });
});
