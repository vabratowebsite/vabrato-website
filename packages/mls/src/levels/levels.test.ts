import { describe, expect, it } from "vitest";
import * as publicEntry from "../index";
import { buildFixtures } from "../fixtures";
import { listingRows } from "../sync/rows";
import {
  ADDRESS_FIELDS,
  allowedFields,
  DATA_LEVELS,
  FIELD_SETS,
  PROPERTY_FULL_FIELDS,
  PROPERTY_IDX_FIELDS,
  PROPERTY_VOW_FIELDS,
} from "./fields";
import { projectFull, projectMember } from "./full";
import { projectForLevel, projectIdx, projectVow } from "./project";

const fx = buildFixtures();

describe("field allowlists (MLS-4)", () => {
  it.each(Object.keys(FIELD_SETS) as (keyof typeof FIELD_SETS)[])("%s field sets are disjoint and duplicate-free", (resource) => {
    const all = DATA_LEVELS.flatMap((l) => [...FIELD_SETS[resource][l]]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("puts sold detail in VOW and agent-only data in FULL", () => {
    for (const f of ["ClosePrice", "CloseDate", "OriginalListPrice", "BuyerAgentFullName"]) expect(PROPERTY_VOW_FIELDS).toContain(f);
    for (const f of ["PrivateRemarks", "ShowingInstructions", "LockBoxType", "ListAgentEmail", "OwnerName", "OccupantPhone"]) {
      expect(PROPERTY_FULL_FIELDS).toContain(f);
    }
    expect(allowedFields("Property", "IDX").has("ClosePrice")).toBe(false);
    expect(allowedFields("Property", "VOW").has("ClosePrice")).toBe(true);
    expect(allowedFields("Property", "VOW").has("PrivateRemarks")).toBe(false);
    expect(allowedFields("Property", "FULL").has("PrivateRemarks")).toBe(true);
  });

  it("keeps the office roster (with contact details) at FULL only", () => {
    expect(allowedFields("Member", "VOW").size).toBe(0);
    expect(allowedFields("Member", "FULL").has("MemberEmail")).toBe(true);
  });
});

describe("projections", () => {
  it.each(fx.properties.map((p) => [p.ListingKey, p] as const))("%s: every level stores only its own fields", (_k, p) => {
    const idx = projectIdx(p);
    const vow = projectVow(p);
    const full = projectFull(p);
    for (const k of Object.keys(idx)) expect(PROPERTY_IDX_FIELDS).toContain(k);
    for (const k of Object.keys(vow)) expect(PROPERTY_VOW_FIELDS).toContain(k);
    for (const k of Object.keys(full)) expect(PROPERTY_FULL_FIELDS).toContain(k);
    // The fixture's unlisted field never survives.
    expect({ ...idx, ...vow, ...full }).not.toHaveProperty("X_FixtureInternalNote");
  });

  it("never lets VOW or FULL fields into the IDX row", () => {
    for (const p of fx.properties) {
      const rows = listingRows(p, "VABRA");
      const idxKeys = Object.keys(rows.idx.data);
      for (const f of [...PROPERTY_VOW_FIELDS, ...PROPERTY_FULL_FIELDS]) expect(idxKeys).not.toContain(f);
    }
  });

  it("hides the address and coordinates when InternetAddressDisplayYN is false (MLS-3)", () => {
    const p = fx.properties.find((x) => x.ListingKey === "FX-012")!;
    const idx = projectIdx(p);
    for (const f of ADDRESS_FIELDS) expect(idx).not.toHaveProperty(f);
    expect(idx.City).toBe("Los Gatos");
    const rows = listingRows(p, "VABRA");
    expect(rows.idx).toMatchObject({ latitude: null, longitude: null, address_display: false });
    expect(projectForLevel("Property", p, "VOW")).not.toHaveProperty("UnparsedAddress");
  });

  it("projects for a page's level", () => {
    const p = fx.properties.find((x) => x.ListingKey === "FX-005")!;
    expect(projectForLevel("Property", p, "IDX")).not.toHaveProperty("ClosePrice");
    expect(projectForLevel("Property", p, "VOW")).toMatchObject({ ClosePrice: p.ClosePrice, ListPrice: p.ListPrice });
    expect(projectForLevel("Property", p, "VOW")).not.toHaveProperty("PrivateRemarks");
  });

  it("marks our own listings from the configured office id, not a hard-coded one", () => {
    const p = fx.properties.find((x) => x.ListingKey === "FX-001")!;
    expect(listingRows(p, "VABRA").idx.is_own_listing).toBe(true);
    expect(listingRows(p, "VABRA-1").idx.is_own_listing).toBe(false);
  });

  it("projects members to the roster field set", () => {
    const m = projectMember({ ...fx.members[0]!, X_Secret: "no" });
    expect(Object.keys(m).every((k) => (FIELD_SETS.Member.FULL as readonly string[]).includes(k))).toBe(true);
  });
});

describe("public entry point (MLS-7)", () => {
  it("does not export FULL projections", () => {
    expect(publicEntry).not.toHaveProperty("projectFull");
    expect(publicEntry).not.toHaveProperty("projectMember");
    expect(() => (projectForLevel as (...a: unknown[]) => unknown)("Property", { PrivateRemarks: "x" }, "FULL")).toThrow(/MLS-7/);
  });
});
