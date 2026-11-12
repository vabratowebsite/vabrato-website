import { describe, expect, it } from "vitest";
import { fairHousingBlocks, paymentInstructionMatches } from "@vabrato/ai";
import { CONTRACT_READER, toIntakeProposal, type ContractReading } from "./contract-reader";

// Fictional contract values. No model is called: these test how an answer is
// checked and turned into form values.

const src = <T>(value: T, page: number | null = 1, quote: string | null = "quoted text") => ({ value, page, quote });
const cont = (days: number | null, waived = false, page: number | null = 2) => ({ days, waived, page, quote: days === null ? null : `${days} Days After Acceptance` });

const READING: ContractReading = {
  property_address: src("12 Fictional Lane, San Carlos"),
  seller_names: src("Dana Example, Trustee of the Example Family Trust"),
  seller_type: src("trust" as const),
  acceptance_date: src("2026-03-02", 14, "Date: March 2, 2026"),
  days_to_close: src(30, 1, "30 Days After Acceptance"),
  close_of_escrow_date: src(null, null, null),
  purchase_price: src(2150000, 1, "Two Million One Hundred Fifty Thousand Dollars"),
  seller_rent_back_days: src(0),
  contingencies: { loan: cont(21), appraisal: cont(17), investigation: cont(10), insurance: cont(null) },
  notes: ["Counter offer 1 changed the price (page 12).", "  ", "Seller initials missing on page 6."],
};
const parse = (v: unknown) => (CONTRACT_READER.output.kind === "json" ? CONTRACT_READER.output.parse(v) : null);

describe("contract reader", () => {
  it("is a staff feature that answers in JSON, with every object closed", () => {
    expect(CONTRACT_READER.key).toBe("staff_contract_reader");
    expect(CONTRACT_READER.output.kind).toBe("json");
    const open: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      if (o.type === "object") {
        if (o.additionalProperties !== false) open.push(path);
        expect(Object.keys(o.properties as object).sort(), path).toEqual([...(o.required as string[])].sort());
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}/${k}`);
    };
    if (CONTRACT_READER.output.kind === "json") walk(CONTRACT_READER.output.jsonSchema, "");
    expect(open).toEqual([]);
  });

  it("tells the model to prefer a blank to a guess, and to leave out bank details", () => {
    expect(CONTRACT_READER.system).toMatch(/a blank they fill in by hand is better than a guess/);
    expect(CONTRACT_READER.system).toMatch(/bank, deposit or wiring details/);
  });

  it("accepts a complete answer and refuses extra or wrong-typed fields", () => {
    expect(parse(READING)).toEqual(READING);
    expect(() => parse({ ...READING, wiring: "anything" })).toThrow();
    expect(() => parse({ ...READING, days_to_close: src("thirty") })).toThrow();
    expect(() => parse({ ...READING, seller_type: src("corporate") })).toThrow();
    const { notes: _omit, ...missing } = READING;
    expect(() => parse(missing)).toThrow();
    // An impossible page number is dropped, not trusted.
    expect(parse({ ...READING, days_to_close: src(30, -4) })?.days_to_close.page).toBeNull();
  });

  it("passes the pipeline's own checks (a family trust isn't a Fair Housing problem)", () => {
    expect(fairHousingBlocks(READING)).toEqual([]);
    expect(paymentInstructionMatches(READING)).toEqual([]);
  });
});

describe("toIntakeProposal", () => {
  it("fills the form fields with where each value came from", () => {
    const p = toIntakeProposal(READING);
    expect(p.values).toEqual({
      address: "12 Fictional Lane, San Carlos",
      seller_name: "Dana Example, Trustee of the Example Family Trust",
      seller_type: "trust",
      ratification_date: "2026-03-02",
      days_to_close: "30",
      sale_price: "2150000",
      rent_back_days: "0",
      cont_financing: "21",
      cont_appraisal: "17",
      cont_property_condition: "10",
    });
    expect(p.sources.ratification_date).toEqual({ page: 14, quote: "Date: March 2, 2026" });
    expect(p.sources.cont_financing).toEqual({ page: 2, quote: "21 Days After Acceptance" });
    // The model's notes first (blank ones dropped), then ours.
    expect(p.notes).toEqual([
      "Counter offer 1 changed the price (page 12).",
      "Seller initials missing on page 6.",
      "Insurance contingency: not found in the contract. The usual 7 days are shown; change them, or clear the field if there is none.",
    ]);
  });

  it("blanks a waived contingency and says so", () => {
    const p = toIntakeProposal({ ...READING, contingencies: { ...READING.contingencies, loan: cont(null, true), appraisal: cont(17, true) } });
    expect(p.values.cont_financing).toBe("");
    expect(p.values.cont_appraisal).toBe("");
    expect(p.notes).toContain("Loan contingency: waived or removed in the contract, so the field is blank.");
  });

  it("works out days to close from a closing date, and never invents one", () => {
    const dated = toIntakeProposal({ ...READING, days_to_close: src(null), close_of_escrow_date: src("2026-04-01", 3, "COE April 1, 2026") });
    expect(dated.values.days_to_close).toBe("30");
    expect(dated.sources.days_to_close).toEqual({ page: 3, quote: "COE April 1, 2026" });
    expect(dated.notes).toContain("Days to close: worked out as 30 from the closing date 2026-04-01 in the contract.");

    const none = toIntakeProposal({ ...READING, days_to_close: src(null) });
    expect(none.values).not.toHaveProperty("days_to_close");
    expect(none.notes).toContain("Close of escrow: not found or not clear. Enter the days to close by hand.");

    const before = toIntakeProposal({ ...READING, days_to_close: src(null), close_of_escrow_date: src("2026-02-01") });
    expect(before.values).not.toHaveProperty("days_to_close");
    expect(before.notes.join(" ")).toMatch(/outside 1 to 120/);
  });

  it("leaves out values the form wouldn't accept", () => {
    const p = toIntakeProposal({
      ...READING,
      property_address: src("   "),
      acceptance_date: src("03/02/2026"),
      days_to_close: src(400),
      purchase_price: src(-5),
      seller_rent_back_days: src(120),
      contingencies: { ...READING.contingencies, investigation: cont(0), appraisal: cont(90) },
    });
    for (const f of ["address", "ratification_date", "days_to_close", "sale_price", "rent_back_days", "cont_property_condition", "cont_appraisal"]) expect(p.values, f).not.toHaveProperty(f);
    expect(p.notes).toContain("Acceptance date: not found or not clear. Enter the ratification date by hand.");
    expect(p.notes.join(" ")).toMatch(/Rent-back: the contract appears to say 120 days/);
    expect(p.notes.join(" ")).toMatch(/Property condition contingency: the contract appears to say 0 days/);
    // An impossible calendar date is refused too.
    expect(toIntakeProposal({ ...READING, acceptance_date: src("2026-02-30") }).values).not.toHaveProperty("ratification_date");
  });

  it("shortens long quotes and keeps at most 8 of the model's notes", () => {
    const p = toIntakeProposal({ ...READING, property_address: src("1 Fictional Way", 1, "x".repeat(400)), notes: Array.from({ length: 12 }, (_, i) => `Note ${i + 1}`) });
    expect(p.sources.address?.quote?.length).toBe(198);
    expect(p.notes.filter((n) => n.startsWith("Note "))).toHaveLength(8);
  });
});
