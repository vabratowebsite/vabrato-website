import { describe, expect, it } from "vitest";
import { buildTimeline } from "../timeline";

// Mirrors the verified seed deal: ratified Tue 2026-02-24, 15 days -> COE 2026-03-11.
const DEAL = {
  ratification_date: "2026-02-24",
  days_to_close: 15,
  rent_back_days: 0,
  status: "active" as const,
};
const CONTINGENCIES = [
  { kind: "financing", due_date: "2026-03-03", removed_at: null },
  { kind: "appraisal", due_date: "2026-03-04", removed_at: null },
];
const TASKS = [
  { title: "Seller signs closing documents (window opens)", due_date: "2026-03-09", done: false, owner: "Seller" },
];

describe("buildTimeline", () => {
  it("orders milestones by date and computes COE", () => {
    const t = buildTimeline(DEAL, CONTINGENCIES, TASKS, "2026-02-24");
    expect(t.coe).toBe("2026-03-11");
    expect(t.milestones.map((m) => m.key)).toEqual([
      "ratified",
      "contingency:financing",
      "contingency:appraisal",
      "signing",
      "coe",
    ]);
  });

  it("marks passed dates and flagged items complete; next points at first open item", () => {
    const t = buildTimeline(DEAL, CONTINGENCIES, TASKS, "2026-03-04");
    expect(t.milestones.map((m) => m.complete)).toEqual([true, true, false, false, false]);
    expect(t.milestones[t.nextIndex]?.key).toBe("contingency:appraisal");
  });

  it("respects removed_at and done flags before dates", () => {
    const t = buildTimeline(
      DEAL,
      [{ kind: "appraisal", due_date: "2026-03-04", removed_at: "2026-03-01T10:00:00Z" }],
      [{ ...TASKS[0]!, done: true }],
      "2026-02-25",
    );
    expect(t.milestones.find((m) => m.key === "contingency:appraisal")?.complete).toBe(true);
    expect(t.milestones.find((m) => m.key === "signing")?.complete).toBe(true);
  });

  it("adds rent-back end and closed-status COE", () => {
    const t = buildTimeline(
      { ...DEAL, rent_back_days: 30, status: "closed" },
      [],
      [],
      "2026-03-12",
    );
    expect(t.milestones.at(-1)).toMatchObject({
      key: "rent_back_end",
      date: "2026-04-10",
      complete: false,
    });
    expect(t.milestones.find((m) => m.key === "coe")?.complete).toBe(true);
  });

  it("uses only the closing-documents task as the signing milestone", () => {
    const t = buildTimeline(
      DEAL,
      [],
      [{ title: "Sign seller disclosures", due_date: "2026-02-25", done: true, owner: "Seller" }, ...TASKS],
      "2026-02-24",
    );
    expect(t.milestones.find((m) => m.key === "signing")?.date).toBe("2026-03-09");
    expect(buildTimeline(DEAL, [], [{ title: "Confirm movers", due_date: "2026-03-01", done: false, owner: "Seller" }], "2026-02-24").milestones.some((m) => m.key === "signing")).toBe(false);
  });

  it("returns -1 next index when everything is complete", () => {
    const t = buildTimeline(DEAL, [], [], "2027-01-01");
    expect(t.nextIndex).toBe(-1);
  });
});
