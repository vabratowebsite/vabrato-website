import { describe, expect, it } from "vitest";
import { displayFlags, eligibility, isPublicOpenHouse, isPublicPhoto, normalizeCounty } from "./eligibility";
import { buildFixtures, CASES, ELIGIBLE_KEYS, FIXTURE_NOW, type FixtureKey } from "./fixtures";

const fx = buildFixtures();
const byKey = (k: FixtureKey) => fx.properties.find((p) => p.ListingKey === k)!;
const opts = { soldHistoryYears: 3, now: FIXTURE_NOW };

describe("eligibility (MLS-3, MLS-5, MLS-8, service area)", () => {
  it("has a case description for every fixture", () => {
    expect(fx.properties.map((p) => p.ListingKey).sort()).toEqual(Object.keys(CASES).sort());
  });

  it("keeps exactly the eligible fixtures", () => {
    const kept = fx.properties.filter((p) => eligibility(p, opts).eligible).map((p) => p.ListingKey);
    expect(kept.sort()).toEqual([...ELIGIBLE_KEYS].sort());
  });

  it.each<[FixtureKey, string]>([
    ["FX-007", "sold_too_old"],
    ["FX-008", "off_market"],
    ["FX-009", "off_market"],
    ["FX-010", "off_market"],
    ["FX-011", "opted_out"],
    ["FX-014", "outside_service_area"],
    ["FX-015", "other_mls"],
    ["FX-016", "no_idx_participation"],
    ["FX-017", "off_market"],
    ["FX-018", "off_market"],
  ])("%s is ineligible: %s", (key, reason) => {
    expect(eligibility(byKey(key), opts)).toEqual({ eligible: false, reason });
  });

  it("keeps older sales when the sold window is 5 years", () => {
    expect(eligibility(byKey("FX-007"), { soldHistoryYears: 5, now: FIXTURE_NOW }).eligible).toBe(true);
  });

  it("rejects a Closed record with no close date and an unknown status", () => {
    expect(eligibility({ ...byKey("FX-005"), CloseDate: null }, opts)).toEqual({ eligible: false, reason: "sold_too_old" });
    expect(eligibility({ ...byKey("FX-001"), StandardStatus: "Mystery" }, opts)).toEqual({ eligible: false, reason: "unknown_status" });
  });

  it("normalizes county spellings", () => {
    expect(normalizeCounty("San Mateo County")).toBe("San Mateo");
    expect(eligibility({ ...byKey("FX-001"), CountyOrParish: "SANTA CLARA COUNTY" }, opts).eligible).toBe(true);
  });

  it("reports display flags", () => {
    expect(displayFlags(byKey("FX-001"))).toEqual({ addressDisplay: true, avmDisplay: true, commentsDisplay: true });
    expect(displayFlags(byKey("FX-012")).addressDisplay).toBe(false);
    expect(displayFlags(byKey("FX-013"))).toEqual({ addressDisplay: true, avmDisplay: false, commentsDisplay: false });
  });

  it("keeps public photos only", () => {
    const keys = fx.media.filter((m) => m.ResourceRecordKey === "FX-001" && isPublicPhoto(m)).map((m) => m.MediaKey);
    expect(keys).toEqual(["FX-001-P1", "FX-001-P2", "FX-001-P3"]);
    expect(isPublicPhoto({ MediaKey: "x", ResourceRecordKey: "y", MediaURL: "u", Permission: "Public,Office Only" })).toBe(false);
  });

  it("keeps public, not-canceled open houses", () => {
    expect(fx.openHouses.filter(isPublicOpenHouse).map((o) => o.OpenHouseKey)).toEqual(["OH-001", "OH-002", "OH-005", "OH-006"]);
  });
});
