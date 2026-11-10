import { z } from "zod";

// RESO Data Dictionary resources used from the MLSListings Web API. Schemas
// validate the fields the sync relies on and pass everything else through;
// the level allowlists (src/levels) decide what is ever stored.

const str = z.string().nullish();
const num = z.number().nullish();
const bool = z.boolean().nullish();

export const RESOURCE_NAMES = ["Property", "Media", "OpenHouse", "Member", "Office"] as const;
export type ResourceName = (typeof RESOURCE_NAMES)[number];

/** RESO StandardStatus values. */
export const STANDARD_STATUS = [
  "Active",
  "ActiveUnderContract",
  "ComingSoon",
  "Pending",
  "Closed",
  "Withdrawn",
  "Expired",
  "Canceled",
  "Hold",
  "Delete",
  "Incomplete",
] as const;

export const PropertySchema = z
  .object({
    ListingKey: z.string().min(1),
    ListingId: str,
    ModificationTimestamp: z.string().min(1),
    OriginatingSystemName: str,
    StandardStatus: z.string().min(1),
    PropertyType: str,
    PropertySubType: str,
    ListPrice: num,
    ClosePrice: num,
    CloseDate: str,
    UnparsedAddress: str,
    City: str,
    CountyOrParish: str,
    PostalCode: str,
    Latitude: num,
    Longitude: num,
    BedroomsTotal: num,
    BathroomsTotalInteger: num,
    LivingArea: num,
    ListOfficeMlsId: str,
    ListOfficeName: str,
    ListAgentFullName: str,
    InternetEntireListingDisplayYN: bool,
    InternetAddressDisplayYN: bool,
    InternetAutomatedValuationDisplayYN: bool,
    InternetConsumerCommentYN: bool,
    IDXParticipationYN: bool,
  })
  .passthrough();
export type Property = z.infer<typeof PropertySchema>;

export const MediaSchema = z
  .object({
    MediaKey: z.string().min(1),
    ResourceRecordKey: z.string().min(1),
    ResourceName: str,
    MediaCategory: str,
    MediaURL: str,
    MediaType: str,
    Order: num,
    ShortDescription: str,
    ImageWidth: num,
    ImageHeight: num,
    // RESO Permission (string list): e.g. ["Public"], ["Private"], ["Office Only"].
    Permission: z.union([z.array(z.string()), z.string()]).nullish(),
    ModificationTimestamp: str,
  })
  .passthrough();
export type Media = z.infer<typeof MediaSchema>;

export const OpenHouseSchema = z
  .object({
    OpenHouseKey: z.string().min(1),
    ListingKey: z.string().min(1),
    OpenHouseDate: str,
    OpenHouseStartTime: str,
    OpenHouseEndTime: str,
    OpenHouseRemarks: str,
    OpenHouseType: str,
    OpenHouseStatus: str,
    ModificationTimestamp: str,
  })
  .passthrough();
export type OpenHouse = z.infer<typeof OpenHouseSchema>;

export const MemberSchema = z
  .object({
    MemberKey: z.string().min(1),
    MemberMlsId: str,
    MemberFullName: str,
    MemberEmail: str,
    MemberStatus: str,
    OfficeMlsId: str,
    ModificationTimestamp: str,
  })
  .passthrough();
export type Member = z.infer<typeof MemberSchema>;

export const OfficeSchema = z
  .object({
    OfficeKey: z.string().min(1),
    OfficeMlsId: str,
    OfficeName: str,
    OfficePhone: str,
    ModificationTimestamp: str,
  })
  .passthrough();
export type Office = z.infer<typeof OfficeSchema>;

export const RESOURCE_SCHEMAS = {
  Property: PropertySchema,
  Media: MediaSchema,
  OpenHouse: OpenHouseSchema,
  Member: MemberSchema,
  Office: OfficeSchema,
} as const;

export type ResourceRecord<R extends ResourceName> = z.infer<(typeof RESOURCE_SCHEMAS)[R]>;

/** Primary key field per resource. */
export const RESOURCE_KEYS: Record<ResourceName, string> = {
  Property: "ListingKey",
  Media: "MediaKey",
  OpenHouse: "OpenHouseKey",
  Member: "MemberKey",
  Office: "OfficeKey",
};
