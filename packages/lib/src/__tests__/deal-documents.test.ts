import { describe, expect, it } from "vitest";
import { CHECKLIST, DOC_TYPE_KEYS, checklistFor, checklistKeys, cleanDocTypes } from "../deal-documents";

const req = (t: Parameters<typeof checklistKeys>[0]) => CHECKLIST.filter((i) => i.sellerTypes.includes(t) && !i.ifApplies).map((i) => i.key);
const opt = (t: Parameters<typeof checklistKeys>[0]) => CHECKLIST.filter((i) => i.sellerTypes.includes(t) && i.ifApplies).map((i) => i.key);
const file = (id: string, ...doc_types: string[]) => ({ id, name: `${id}.pdf`, doc_types });

describe("the seller-type checklist (draft for Mark's review)", () => {
  it("every sale requires the core documents, WCMD included", () => {
    for (const t of ["normal", "trust", "successor_trustee", "probate"] as const) {
      expect(req(t)).toEqual(expect.arrayContaining(["rpa", "agency_disclosure", "sbsa", "avid", "nhd", "wcmd", "prelim_title", "contingency_removal", "vp"]));
      expect(opt(t)).toEqual(expect.arrayContaining(["counter_offers", "whsd", "lead_paint", "home_inspection", "pest_inspection", "rla", "sa", "fhda", "prbs", "wfa", "sfls", "withholding", "hoa_docs", "county_advisory"]));
    }
  });

  it("standard: TDS and SPQ, nothing for trusts or estates", () => {
    expect(req("normal")).toEqual(expect.arrayContaining(["tds", "spq"]));
    expect(req("normal").filter((k) => ["esd", "tds_or_esd", "spq_or_esd", "letters", "death_certificate", "probate_advisory", "trust_certification", "trust_advisory", "papa", "pla"].includes(k))).toEqual([]);
  });

  it("trust: TDS or ESD, SPQ, certification of trust and Trust Advisory", () => {
    expect(req("trust")).toEqual(expect.arrayContaining(["tds_or_esd", "spq", "trust_certification", "trust_advisory"]));
    expect(req("trust")).not.toContain("tds");
  });

  it("successor trustee: TDS or ESD, SPQ or ESD, certification, death certificate, Trust Advisory", () => {
    expect(req("successor_trustee")).toEqual(expect.arrayContaining(["tds_or_esd", "spq_or_esd", "trust_certification", "death_certificate", "trust_advisory"]));
    expect(req("successor_trustee")).not.toEqual(expect.arrayContaining(["tds"]));
    expect(req("successor_trustee")).not.toContain("spq");
  });

  it("probate: ESD in place of TDS and SPQ, letters, PA, PAPA and PLA; court confirmation if it applies", () => {
    expect(req("probate")).toEqual(expect.arrayContaining(["esd", "letters", "probate_advisory", "papa", "pla"]));
    expect(req("probate").filter((k) => ["tds", "spq", "tds_or_esd", "spq_or_esd"].includes(k))).toEqual([]);
    expect(opt("probate")).toContain("court_confirmation");
  });

  it("either/or items: one ESD satisfies both for a successor trustee; a TDS does for the trust", () => {
    const st = checklistFor("successor_trustee", [file("esd", "esd")], []);
    expect(st.rows.filter((r) => ["tds_or_esd", "spq_or_esd"].includes(r.key)).map((r) => r.status)).toEqual(["on_file", "on_file"]);
    const trust = checklistFor("trust", [file("tds", "tds")], []);
    expect(trust.rows.find((r) => r.key === "tds_or_esd")!.status).toBe("on_file");
    const probate = checklistFor("probate", [file("tds", "tds")], []);
    expect(probate.rows.find((r) => r.key === "esd")!.status).toBe("missing");
  });

  it("if-applies items are listed apart and count in N of M only once decided", () => {
    const none = checklistFor("normal", [], []);
    expect(none.total).toBe(req("normal").length);
    expect(none.missing).toBe(req("normal").length);
    expect(none.ifApplies.every((r) => r.status === "open")).toBe(true);
    expect(none.rows.map((r) => r.key)).toEqual([...none.required, ...none.ifApplies].map((r) => r.key));

    const some = checklistFor("normal", [file("rpa", "rpa"), file("fld", "lead_paint")], [{ item_key: "hoa_docs", note: "Not in an HOA" }]);
    expect(some.total).toBe(req("normal").length + 2);
    expect(some.done).toBe(3); // RPA, plus the two decided if-applies items
    expect(some.missing).toBe(req("normal").length - 1);
    expect(some.ifApplies.find((r) => r.key === "hoa_docs")).toMatchObject({ status: "not_needed", mark: { note: "Not in an HOA" } });
  });

  it("a combined packet counts for each item it covers; a file wins over a not-needed mark", () => {
    const packet = file("packet", "tds", "spq", "avid");
    const r = checklistFor("normal", [packet], [{ item_key: "spq", note: null }]);
    expect(r.rows.filter((x) => x.status === "on_file").map((x) => x.key)).toEqual(["tds", "spq", "avid"]);
    expect(r.rows.find((x) => x.key === "spq")!.files).toEqual([packet]);
  });

  it("keys fit the database's format, are unique, and every item is satisfied by known file types", () => {
    for (const i of CHECKLIST) {
      expect(i.key).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
      for (const t of i.satisfiedBy) expect(DOC_TYPE_KEYS).toContain(t);
    }
    for (const k of DOC_TYPE_KEYS) expect(k).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    expect(new Set(CHECKLIST.map((i) => i.key)).size).toBe(CHECKLIST.length);
  });

  it("new and changed rows are flagged for Mark to confirm", () => {
    const flagged = CHECKLIST.filter((i) => i.confirm).map((i) => i.key);
    expect(flagged).toEqual(expect.arrayContaining(["wcmd", "whsd", "tds_or_esd", "spq_or_esd", "esd", "spq", "trust_advisory", "papa", "pla", "rla", "sa", "fhda", "prbs", "wfa", "sfls", "withholding", "hoa_docs", "county_advisory"]));
  });

  it("cleanDocTypes keeps known types only, once, in order", () => {
    expect(cleanDocTypes(["spq", "made_up", "rpa", "spq", 3])).toEqual(["rpa", "spq"]);
  });
});
