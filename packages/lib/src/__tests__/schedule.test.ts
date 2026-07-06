import { describe, expect, it } from "vitest";
import { addDays, isBusinessDay } from "../holidays";
import { DEFAULT_CONTINGENCIES, computeCoe, generateSchedule } from "../schedule";

// The prototype's seed deal: ratified Tue 2026-02-24, 15 days to close.
const SEED = { ratificationDate: "2026-02-24", daysToClose: 15, sellerType: "normal" as const };

function dueOf(schedule: ReturnType<typeof generateSchedule>, title: string): string {
  const task = schedule.tasks.find((t) => t.title === title);
  if (!task) throw new Error(`task not found: ${title}`);
  return task.dueDate;
}

describe("seed scenario (matches prototype output)", () => {
  const s = generateSchedule(SEED);

  it("computes COE = ratification + 15 on a business day", () => {
    expect(s.timeline.coe).toBe("2026-03-11"); // Wednesday
    expect(dueOf(s, "Close of Escrow (COE)")).toBe("2026-03-11");
  });

  it("dates phase-1 tasks from ratification, rolling weekends forward", () => {
    expect(dueOf(s, "Verify COE isn't a holiday or weekend")).toBe("2026-02-24");
    expect(dueOf(s, "Change MLS status to Pending")).toBe("2026-02-25");
    expect(dueOf(s, "Complete & deliver the Escrow Guide to the seller")).toBe("2026-02-26");
    expect(dueOf(s, "Verify earnest-money deposit (EMD) is in escrow")).toBe("2026-02-27");
    // offsets 4 and 5 land on Sat/Sun and roll to Monday
    expect(dueOf(s, "Verify smoke/CO detectors + water heater strapped")).toBe("2026-03-02");
    expect(dueOf(s, "Order home warranty")).toBe("2026-03-02");
    expect(dueOf(s, "Create commission demand")).toBe("2026-03-02");
    expect(dueOf(s, "Schedule de-staging (after contingencies + appraisal)")).toBe("2026-03-05");
  });

  it("dates contingency removals at their default offsets", () => {
    expect(dueOf(s, "Insurance contingency removal")).toBe("2026-03-03");
    expect(dueOf(s, "Financing contingency removal")).toBe("2026-03-03");
    expect(dueOf(s, "Appraisal contingency removal")).toBe("2026-03-04");
    expect(dueOf(s, "Property-condition contingency removal")).toBe("2026-03-04");
    expect(s.timeline.contingencyRemovals).toEqual([
      { kind: "insurance", dueDate: "2026-03-03" },
      { kind: "financing", dueDate: "2026-03-03" },
      { kind: "appraisal", dueDate: "2026-03-04" },
      { kind: "property_condition", dueDate: "2026-03-04" },
    ]);
  });

  it("anchors closing-week and after-COE tasks to COE", () => {
    expect(dueOf(s, "Confirm escrow has coordinated seller signing")).toBe("2026-03-06"); // COE-5
    expect(dueOf(s, "Seller signs closing documents (window opens)")).toBe("2026-03-09"); // COE-4 Sat -> Mon
    expect(dueOf(s, "Buyers' final walk-through")).toBe("2026-03-09"); // COE-3 Sun -> Mon
    expect(dueOf(s, "Remove signs/lockbox; retrieve keys & remotes")).toBe("2026-03-10"); // COE-1
    expect(dueOf(s, "Give keys to buyer's agent")).toBe("2026-03-11"); // COE
    expect(dueOf(s, "Send seller thank-you note & gift")).toBe("2026-03-12"); // COE+1
    expect(dueOf(s, "Obtain final closing statement")).toBe("2026-03-13"); // COE+2
    expect(dueOf(s, "Dump transaction emails into cloud folder")).toBe("2026-03-16"); // COE+3 Sat -> Mon
  });

  it("emits seller notification send dates", () => {
    expect(s.notifications).toEqual([
      { templateKey: "seller_welcome", audience: "seller", sendDate: "2026-02-25" },
      { templateKey: "seller_signing_reminder", audience: "seller", sendDate: "2026-03-09" },
      { templateKey: "seller_closing_tomorrow", audience: "seller", sendDate: "2026-03-10" },
      { templateKey: "seller_post_coe_checklist", audience: "seller", sendDate: "2026-03-12" },
    ]);
  });

  it("has no trust tasks and no rent-back artifacts for a normal seller", () => {
    expect(s.tasks.some((t) => t.title.includes("Letters Testamentary"))).toBe(false);
    expect(s.timeline.rentBackEnd).toBeNull();
    expect(s.tasks).toHaveLength(38); // 34 base + 4 contingencies
  });

  it("full schedule snapshot (human check: eyeball every date)", () => {
    expect(
      s.tasks.map((t) => `${t.dueDate}  [${t.phase}]  ${t.owner}: ${t.title}`),
    ).toMatchSnapshot();
  });
});

describe("COE never lands on a weekend or holiday (sweep)", () => {
  it("holds for every ratification date in 2026-2027 across daysToClose variants", () => {
    for (const daysToClose of [10, 15, 21, 30, 45, 60]) {
      let d = "2026-01-01";
      while (d <= "2027-12-31") {
        const s = generateSchedule({ ratificationDate: d, daysToClose });
        expect(isBusinessDay(s.timeline.coe), `COE ${s.timeline.coe} (rat ${d}, ${daysToClose}d)`).toBe(true);
        for (const c of s.timeline.contingencyRemovals) {
          expect(isBusinessDay(c.dueDate), `${c.kind} ${c.dueDate} (rat ${d})`).toBe(true);
        }
        d = addDays(d, 1);
      }
    }
  });

  it("every task due date is a business day and the list is date-ordered", () => {
    let d = "2026-01-01";
    while (d <= "2026-12-31") {
      const s = generateSchedule({ ratificationDate: d, daysToClose: 21, rentBackDays: 14 });
      let prev = "";
      for (const task of s.tasks) {
        expect(isBusinessDay(task.dueDate), `${task.title} ${task.dueDate} (rat ${d})`).toBe(true);
        expect(task.dueDate >= prev).toBe(true);
        prev = task.dueDate;
      }
      expect(dueOf(s, "Close of Escrow (COE)")).toBe(s.timeline.coe);
      d = addDays(d, 1);
    }
  });

  it("rolls a COE that would land on July 4 weekend / observed holiday", () => {
    // 2026-06-19 + 15 = Sat 2026-07-04
    expect(computeCoe("2026-06-19", 15)).toBe("2026-07-06");
    // 2026-06-18 + 15 = Fri 2026-07-03, the observed holiday
    expect(computeCoe("2026-06-18", 15)).toBe("2026-07-06");
  });
});

describe("seller types", () => {
  const TRUST_TITLES = [
    "Confirm estate/trust bank account for proceeds",
    "Provide escrow Letters Testamentary / trust certificate",
    "Address supplemental taxes (probate / successor trustee)",
  ];

  it.each(["trust", "successor_trustee", "probate"] as const)(
    "%s appends the three estate tasks",
    (sellerType) => {
      const s = generateSchedule({ ...SEED, sellerType });
      for (const title of TRUST_TITLES) {
        expect(s.tasks.some((t) => t.title === title)).toBe(true);
      }
      expect(s.tasks).toHaveLength(41); // 38 + 3 estate tasks
      expect(dueOf(s, TRUST_TITLES[0]!)).toBe("2026-02-27"); // rat+3
      expect(dueOf(s, TRUST_TITLES[2]!)).toBe("2026-03-04"); // rat+8
    },
  );
});

describe("contingency inputs", () => {
  it("overrides replace the defaults entirely", () => {
    const s = generateSchedule({ ...SEED, contingencies: [{ kind: "appraisal", offsetDays: 12 }] });
    expect(dueOf(s, "Appraisal contingency removal")).toBe("2026-03-09"); // rat+12 Sun -> Mon
    expect(s.tasks.some((t) => t.title === "Financing contingency removal")).toBe(false);
    expect(s.timeline.contingencyRemovals).toEqual([{ kind: "appraisal", dueDate: "2026-03-09" }]);
  });

  it("an empty list models an all-cash deal", () => {
    const s = generateSchedule({ ...SEED, contingencies: [] });
    expect(s.tasks.some((t) => t.title.includes("contingency removal"))).toBe(false);
    expect(s.timeline.contingencyRemovals).toEqual([]);
  });

  it("unknown kinds get a readable generic title", () => {
    const s = generateSchedule({ ...SEED, contingencies: [{ kind: "hoa_review", offsetDays: 5 }] });
    expect(s.tasks.some((t) => t.title === "hoa review contingency removal")).toBe(true);
  });

  it("exports the standard defaults", () => {
    expect(DEFAULT_CONTINGENCIES.map((c) => c.kind)).toEqual([
      "insurance",
      "financing",
      "appraisal",
      "property_condition",
    ]);
  });
});

describe("rent-back", () => {
  it("adds the end-of-rent-back task and notification", () => {
    const s = generateSchedule({ ...SEED, rentBackDays: 30 });
    expect(s.timeline.rentBackEnd).toBe("2026-04-10"); // COE 03-11 + 30 (Fri)
    expect(dueOf(s, "Rent-back ends — retrieve keys & confirm move-out")).toBe("2026-04-10");
    expect(s.notifications.at(-1)).toEqual({
      templateKey: "seller_rent_back_ending",
      audience: "seller",
      sendDate: "2026-04-08",
    });
  });

  it("keeps the contractual end date but rolls the task off a weekend", () => {
    const s = generateSchedule({ ...SEED, rentBackDays: 31 });
    expect(s.timeline.rentBackEnd).toBe("2026-04-11"); // Saturday — contract date preserved
    expect(dueOf(s, "Rent-back ends — retrieve keys & confirm move-out")).toBe("2026-04-13");
  });
});

describe("input validation and determinism", () => {
  it("rejects malformed inputs", () => {
    expect(() => generateSchedule({ ratificationDate: "2026-2-24" })).toThrow(/Invalid ISO date/);
    expect(() => generateSchedule({ ratificationDate: "2026-02-30" })).toThrow(/Invalid ISO date/);
    expect(() => generateSchedule({ ...SEED, daysToClose: 0 })).toThrow(/daysToClose/);
    expect(() => generateSchedule({ ...SEED, rentBackDays: -1 })).toThrow(/rentBackDays/);
    expect(() =>
      generateSchedule({ ...SEED, contingencies: [{ kind: "financing", offsetDays: -2 }] }),
    ).toThrow(/financing/);
  });

  it("defaults daysToClose to 15", () => {
    expect(generateSchedule({ ratificationDate: "2026-02-24" }).timeline.coe).toBe("2026-03-11");
  });

  it("allows ratification on a non-business day; day-0 tasks roll forward", () => {
    const s = generateSchedule({ ratificationDate: "2026-02-28" }); // Saturday
    expect(dueOf(s, "Verify COE isn't a holiday or weekend")).toBe("2026-03-02");
  });

  it("is deterministic", () => {
    expect(generateSchedule({ ...SEED, rentBackDays: 7, sellerType: "trust" })).toEqual(
      generateSchedule({ ...SEED, rentBackDays: 7, sellerType: "trust" }),
    );
  });
});
