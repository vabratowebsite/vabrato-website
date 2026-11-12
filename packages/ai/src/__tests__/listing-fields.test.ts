import { describe, expect, it } from "vitest";
import { listingForAi, stripNeverSend } from "../listing-fields";

// A fictional Property record with fields from every data level.
const RECORD = {
  ListingKey: "FX-1",
  StandardStatus: "Active",
  ListPrice: 1_950_000,
  UnparsedAddress: "1 Fiction Rd, San Carlos, CA 94070",
  StreetNumber: "1",
  BedroomsTotal: 3,
  PublicRemarks: "Remodeled kitchen.",
  ListAgentFullName: "Example Agent",
  ListOfficeName: "Example Realty",
  ListOfficePhone: "650-555-0100",
  InternetAddressDisplayYN: true,
  // VOW
  ClosePrice: 2_000_000,
  CloseDate: "2026-10-01",
  // FULL
  PrivateRemarks: "Seller motivated.",
  ShowingInstructions: "Call first.",
  LockBoxLocation: "Side gate",
  ListAgentEmail: "agent@example.test",
  ListAgentMobilePhone: "650-555-0101",
  OwnerName: "Fictional Owner",
  OccupantPhone: "650-555-0102",
};

describe("listing fields sent to the model", () => {
  it("IDX: public fields only, and no phone numbers", () => {
    const out = listingForAi(RECORD, "IDX");
    expect(out).toMatchObject({ ListingKey: "FX-1", ListPrice: 1_950_000, BedroomsTotal: 3, PublicRemarks: "Remodeled kitchen.", ListAgentFullName: "Example Agent" });
    for (const k of ["ClosePrice", "CloseDate", "PrivateRemarks", "ShowingInstructions", "LockBoxLocation", "ListAgentEmail", "ListAgentMobilePhone", "OwnerName", "OccupantPhone", "ListOfficePhone"]) {
      expect(out, k).not.toHaveProperty(k);
    }
  });

  it("VOW: adds sold fields, still nothing from FULL", () => {
    const out = listingForAi(RECORD, "VOW");
    expect(out).toMatchObject({ ClosePrice: 2_000_000, CloseDate: "2026-10-01" });
    expect(JSON.stringify(out)).not.toMatch(/Seller motivated|Call first|Side gate|example\.test|650-555|Fictional Owner/);
  });

  it("keeps a hidden address hidden", () => {
    const out = listingForAi({ ...RECORD, InternetAddressDisplayYN: false }, "IDX");
    expect(out).not.toHaveProperty("UnparsedAddress");
    expect(out).not.toHaveProperty("StreetNumber");
  });

  it("refuses FULL here; the console strips contacts from FULL records itself", () => {
    expect(() => listingForAi(RECORD, "FULL" as never)).toThrow(/FULL/);
    const stripped = stripNeverSend({ ...RECORD, SomeNewContactEmail: "x@example.test", BuyerAgencyCompensation: "2.5%" });
    expect(stripped).toMatchObject({ ListingKey: "FX-1", BuyerAgencyCompensation: "2.5%" });
    expect(JSON.stringify(stripped)).not.toMatch(/Seller motivated|Call first|Side gate|example\.test|650-555|Fictional Owner/);
  });
});
