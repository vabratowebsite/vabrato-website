// Field allowlists per data level (SPEC MLS-4).
//
// PROVISIONAL: these follow common IDX/VOW practice and must be checked
// against MLSListings' IDX and VOW rules once the license paperwork arrives
// (tracked in docs/STATUS.md). Moving a field between levels is a one-line
// change here; tests keep the sets disjoint and the stored data within them.
//
// Each list is the field set *added* at that level. A page at level VOW may
// show IDX + VOW fields; FULL may show all three. Fields on no list are never
// stored.

export const DATA_LEVELS = ["IDX", "VOW", "FULL"] as const;
export type DataLevel = (typeof DATA_LEVELS)[number];

export const PROPERTY_IDX_FIELDS = [
  "ListingKey",
  "ListingId",
  "OriginatingSystemName",
  "ModificationTimestamp",
  "StandardStatus",
  "PropertyType",
  "PropertySubType",
  "ListPrice",
  "UnparsedAddress",
  "StreetNumber",
  "StreetName",
  "StreetSuffix",
  "UnitNumber",
  "City",
  "StateOrProvince",
  "PostalCode",
  "CountyOrParish",
  "Latitude",
  "Longitude",
  "BedroomsTotal",
  "BathroomsTotalInteger",
  "BathroomsFull",
  "BathroomsHalf",
  "LivingArea",
  "LotSizeSquareFeet",
  "LotSizeAcres",
  "YearBuilt",
  "StoriesTotal",
  "GarageSpaces",
  "ParkingTotal",
  "PoolPrivateYN",
  "View",
  "Cooling",
  "Heating",
  "AssociationFee",
  "AssociationFeeFrequency",
  "PublicRemarks",
  "VirtualTourURLUnbranded",
  "ElementarySchool",
  "MiddleOrJuniorSchool",
  "HighSchool",
  "HighSchoolDistrict",
  "ListingContractDate",
  "OnMarketDate",
  "DaysOnMarket",
  "PhotosCount",
  // Attribution (MLS-2).
  "ListAgentFullName",
  "ListAgentMlsId",
  "ListAgentKey",
  "ListOfficeName",
  "ListOfficeMlsId",
  "ListOfficeKey",
  "ListOfficePhone",
  "CoListAgentFullName",
  "CoListOfficeName",
  // Display and opt-out flags (MLS-3).
  "InternetEntireListingDisplayYN",
  "InternetAddressDisplayYN",
  "InternetAutomatedValuationDisplayYN",
  "InternetConsumerCommentYN",
  "IDXParticipationYN",
] as const;

/** Sold detail and price history: signed-in members who accepted the VOW Terms (MLS-6). */
export const PROPERTY_VOW_FIELDS = [
  "ClosePrice",
  "CloseDate",
  "OriginalListPrice",
  "PreviousListPrice",
  "PriceChangeTimestamp",
  "PurchaseContractDate",
  "CumulativeDaysOnMarket",
  "BuyerAgentFullName",
  "BuyerOfficeName",
] as const;

/** Agent console only, ACC-1-verified agents (MLS-7). */
export const PROPERTY_FULL_FIELDS = [
  "PrivateRemarks",
  "ShowingInstructions",
  "ShowingContactName",
  "ShowingContactPhone",
  "LockBoxType",
  "LockBoxLocation",
  "ListAgentDirectPhone",
  "ListAgentMobilePhone",
  "ListAgentEmail",
  "OwnerName",
  "OccupantName",
  "OccupantPhone",
  "Directions",
  "BuyerAgencyCompensation",
  "BuyerAgencyCompensationType",
  "SpecialListingConditions",
] as const;

/** Address fields hidden when InternetAddressDisplayYN is false (MLS-3). */
export const ADDRESS_FIELDS = [
  "UnparsedAddress",
  "StreetNumber",
  "StreetName",
  "StreetSuffix",
  "UnitNumber",
  "Latitude",
  "Longitude",
] as const;

export const MEDIA_IDX_FIELDS = [
  "MediaKey",
  "ResourceRecordKey",
  "MediaCategory",
  "MediaURL",
  "MediaType",
  "Order",
  "ShortDescription",
  "ImageWidth",
  "ImageHeight",
  "ModificationTimestamp",
] as const;

export const OPEN_HOUSE_IDX_FIELDS = [
  "OpenHouseKey",
  "ListingKey",
  "OpenHouseDate",
  "OpenHouseStartTime",
  "OpenHouseEndTime",
  "OpenHouseRemarks",
  "OpenHouseType",
  "OpenHouseStatus",
  "ModificationTimestamp",
] as const;

export const OFFICE_IDX_FIELDS = [
  "OfficeKey",
  "OfficeMlsId",
  "OfficeName",
  "OfficePhone",
  "OfficeAddress1",
  "OfficeCity",
  "OfficeStateOrProvince",
  "OfficePostalCode",
  "OfficeStatus",
  "ModificationTimestamp",
] as const;

/** The office roster is FULL: it includes member contact details. */
export const MEMBER_FULL_FIELDS = [
  "MemberKey",
  "MemberMlsId",
  "MemberFirstName",
  "MemberLastName",
  "MemberFullName",
  "MemberStatus",
  "MemberEmail",
  "MemberDirectPhone",
  "MemberMobilePhone",
  "MemberStateLicense",
  "OfficeKey",
  "OfficeMlsId",
  "OfficeName",
  "ModificationTimestamp",
] as const;

export const FIELD_SETS = {
  Property: { IDX: PROPERTY_IDX_FIELDS, VOW: PROPERTY_VOW_FIELDS, FULL: PROPERTY_FULL_FIELDS },
  Media: { IDX: MEDIA_IDX_FIELDS, VOW: [], FULL: [] },
  OpenHouse: { IDX: OPEN_HOUSE_IDX_FIELDS, VOW: [], FULL: [] },
  Office: { IDX: OFFICE_IDX_FIELDS, VOW: [], FULL: [] },
  Member: { IDX: [], VOW: [], FULL: MEMBER_FULL_FIELDS },
} as const satisfies Record<string, Record<DataLevel, readonly string[]>>;

/** Every field a page at `level` may show for a resource (its set plus all lower ones). */
export function allowedFields(resource: keyof typeof FIELD_SETS, level: DataLevel): ReadonlySet<string> {
  const sets = FIELD_SETS[resource];
  const upTo = DATA_LEVELS.slice(0, DATA_LEVELS.indexOf(level) + 1);
  return new Set(upTo.flatMap((l) => [...sets[l]]));
}
