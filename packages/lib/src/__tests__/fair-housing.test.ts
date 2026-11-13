import { describe, expect, it } from "vitest";
import { contentStrings, fairHousingIssues, fairHousingIssuesIn, hasBlockingIssue } from "../fair-housing";

const blocks = (s: string) => fairHousingIssues(s).filter((i) => i.level === "block").map((i) => i.match);
const warns = (s: string) => fairHousingIssues(s).filter((i) => i.level === "warn").map((i) => i.match);

describe("fairHousingIssues (FH-1)", () => {
  it.each([
    ["This home is perfect for young families.", "perfect for young families"],
    ["Ideal for a couple starting out.", "Ideal for a couple"],
    ["A family-friendly neighborhood near the park.", "family-friendly neighborhood"],
    ["Adults only community.", "Adults only"],
    ["Quiet street with mature residents.", "mature residents"],
    ["A Christian community with deep roots.", "Christian community"],
    ["Shifting demographics in the area.", "demographics"],
    ["A bachelor pad over the garage.", "bachelor pad"],
    ["Not suitable for the handicapped.", "Not suitable for the handicapped"],
    ["One of the safest neighborhoods on the Peninsula.", "safest neighborhoods"],
    ["Low crime area.", "Low crime area"],
    ["Check the crime rates before you buy.", "crime rates"],
    ["An exclusive enclave in the hills.", "exclusive enclave"],
    ["An up-and-coming neighborhood.", "up-and-coming neighborhood"],
    ["Close to top-rated schools.", "top-rated schools"],
  ])("blocks %j", (text, match) => {
    expect(blocks(text)).toContain(match);
  });

  it.each([
    "Three bedrooms, a remodeled kitchen and a large yard.",
    "Downtown has a farmers market on Thursdays and a library.",
    "The family room opens onto the deck.",
    "Laurel Street is lined with restaurants and cafes.",
    "Caltrain runs every 30 minutes to San Francisco.",
  ])("leaves plain property and place facts alone: %j", (text) => {
    expect(fairHousingIssues(text).filter((i) => i.level === "block")).toEqual([]);
  });

  // Familial status (S6b PR 9). The wording list is for Mark to sign off (STATUS).
  it.each([
    ["Seller prefers no kids.", "no kids"],
    ["No children, please.", "No children"],
    ["Quiet building, no young children.", "no young children"],
    ["Adults only.", "Adults only"],
    ["Children not allowed in the unit.", "Children not allowed"],
    ["Kids are not permitted on the deck.", "Kids are not permitted"],
    ["No families with kids.", "No families"],
    ["Not for families.", "Not for families"],
    ["Not suitable for kids.", "suitable for kids"],
    ["Not a good fit: not safe for children.", "not safe for children"],
  ])("blocks familial-status wording %j", (text, match) => {
    expect(blocks(text).join(" | ")).toContain(match);
  });

  it.each([
    "The family room opens onto the deck.",
    "There's no family room, but the den is large.",
    "The kids' bedroom has a built-in desk.",
    "No children's play structure in the yard; the park nearby has one.",
    "The children's play area in the park nearby is open daily.",
    "The seller's children will move the furniture on Saturday.",
    "A single-family home on a quiet street.",
    "Part of a 55+ community with a clubhouse.",
    "No family members will attend the walkthrough.",
  ])("doesn't block ordinary property wording %j", (text) => {
    expect(blocks(text)).toEqual([]);
  });

  it("warns, without blocking, on words that are usually fine in context", () => {
    expect(warns("Next to St. Example church and a short walk to the park.")).toEqual(["church"]);
    expect(warns("A close-knit street.")).toEqual(["close-knit"]);
    expect(warns("See the San Carlos School District site for boundaries.")).toEqual(["School"]);
    expect(blocks("See the San Carlos School District site for boundaries.")).toEqual([]);
  });

  it("doesn't report a warning inside a span already blocked", () => {
    const issues = fairHousingIssues("Perfect for families.");
    expect(issues.map((i) => i.level)).toEqual(["block"]);
  });

  it("lists blocking issues first", () => {
    const issues = fairHousingIssues("Near the church. Safe neighborhood.");
    expect(issues.map((i) => i.level)).toEqual(["block", "warn"]);
  });
});

describe("fairHousingIssuesIn (whole revision body)", () => {
  it("checks nested strings, skips URLs and fixed fields, and de-duplicates", () => {
    const body = {
      intro: "A safe neighborhood. Another safe neighborhood.",
      neighborhoods: [{ name: "Example Heights", blurb: "Ideal for retirees." }],
      school_links: [{ label: "District", url: "https://example.test/safe-neighborhood" }],
      source: "perfect for families (client email)",
    };
    expect(contentStrings(body)).not.toContain("https://example.test/safe-neighborhood");
    const issues = fairHousingIssuesIn(body);
    expect(issues.filter((i) => i.level === "block").map((i) => i.match)).toEqual(["safe neighborhood", "Ideal for retirees"]);
    expect(hasBlockingIssue(issues)).toBe(true);
    expect(hasBlockingIssue(fairHousingIssuesIn({ intro: "Three bedrooms." }))).toBe(false);
  });
});
