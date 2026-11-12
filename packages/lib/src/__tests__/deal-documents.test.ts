import { describe, expect, it } from "vitest";
import { CHECKLIST, DOC_TYPE_KEYS, checklistFor, checklistKeys, cleanDocTypes } from "../deal-documents";

const keys = (t: Parameters<typeof checklistKeys>[0]) => checklistKeys(t);

describe("the seller-type checklist", () => {
  it("every sale needs the core documents", () => {
    for (const t of ["normal", "trust", "successor_trustee", "probate"] as const) {
      expect(keys(t)).toEqual(expect.arrayContaining(["rpa", "agency_disclosure", "sbsa", "spq", "avid", "nhd", "whsd", "prelim_title", "contingency_removal", "vp"]));
    }
  });

  it("a standard sale needs the TDS and nothing for trusts or estates", () => {
    expect(keys("normal")).toContain("tds");
    expect(keys("normal")).not.toEqual(expect.arrayContaining(["trust_certification"]));
    expect(keys("normal").filter((k) => ["esd", "letters", "death_certificate", "probate_advisory", "court_confirmation", "trust_certification"].includes(k))).toEqual([]);
  });

  it("a trust sale adds the certification of trust", () => {
    expect(keys("trust")).toEqual(expect.arrayContaining(["tds", "trust_certification"]));
  });

  it("a successor trustee may use the TDS or the ESD, and adds the death certificate", () => {
    expect(keys("successor_trustee")).toEqual(expect.arrayContaining(["tds_or_esd", "trust_certification", "death_certificate"]));
    expect(keys("successor_trustee")).not.toContain("tds");
    const esdOnly = checklistFor("successor_trustee", [{ id: "1", name: "esd.pdf", doc_types: ["esd"] }], []);
    expect(esdOnly.rows.find((r) => r.key === "tds_or_esd")!.status).toBe("on_file");
  });

  it("probate has no TDS: it needs the ESD, letters, the probate advisory and (if it applies) court confirmation", () => {
    expect(keys("probate")).toEqual(expect.arrayContaining(["esd", "letters", "probate_advisory", "court_confirmation"]));
    expect(keys("probate")).not.toContain("tds");
    const tdsOnly = checklistFor("probate", [{ id: "1", name: "tds.pdf", doc_types: ["tds"] }], []);
    expect(tdsOnly.rows.find((r) => r.key === "esd")!.status).toBe("missing");
  });

  it("counts on file, not needed and missing; a combined packet counts for each item it covers", () => {
    const packet = { id: "p", name: "disclosures.pdf", doc_types: ["tds", "spq", "avid"] };
    const r = checklistFor("normal", [packet, { id: "r", name: "rpa.pdf", doc_types: ["rpa"] }], [{ item_key: "lead_paint", note: "Built in 1998" }]);
    expect(r.rows.filter((x) => x.status === "on_file").map((x) => x.key)).toEqual(["rpa", "tds", "spq", "avid"]);
    expect(r.rows.find((x) => x.key === "spq")!.files).toEqual([packet]);
    expect(r.rows.find((x) => x.key === "lead_paint")).toMatchObject({ status: "not_needed", mark: { note: "Built in 1998" } });
    expect(r).toMatchObject({ onFile: 4, notNeeded: 1, total: keys("normal").length, missing: keys("normal").length - 5 });
  });

  it("a file on file wins over a not-needed mark", () => {
    const r = checklistFor("normal", [{ id: "1", name: "fld.pdf", doc_types: ["lead_paint"] }], [{ item_key: "lead_paint", note: null }]);
    expect(r.rows.find((x) => x.key === "lead_paint")!.status).toBe("on_file");
  });

  it("keys fit the database's format and every item is satisfied by known file types", () => {
    for (const i of CHECKLIST) {
      expect(i.key).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
      for (const t of i.satisfiedBy) expect(DOC_TYPE_KEYS).toContain(t);
    }
    for (const k of DOC_TYPE_KEYS) expect(k).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    expect(new Set(CHECKLIST.map((i) => i.key)).size).toBe(CHECKLIST.length);
  });

  it("cleanDocTypes keeps known types only, once, in order", () => {
    expect(cleanDocTypes(["spq", "made_up", "rpa", "spq", 3])).toEqual(["rpa", "spq"]);
  });
});
