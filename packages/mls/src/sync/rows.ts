import { displayFlags, normalizeCounty } from "../eligibility";
import { projectFull, projectMember } from "../levels/full";
import { projectIdx, projectMedia, projectOffice, projectOpenHouse, projectVow, type Fields } from "../levels/project";
import type { Media, Member, Office, OpenHouse, Property } from "../resources";

// Feed record -> database rows, one per data level (MLS-4). Only projected
// (allowlisted) fields reach `data`.

/** 'mock' marks fictional preview data so it can be purged on its own (MLS-8). */
export type DataSource = "MLSListings" | "mock";

export interface ListingIdxRow {
  listing_key: string;
  source: DataSource;
  listing_id: string | null;
  standard_status: string;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: number | null;
  city: string | null;
  county: string | null;
  postal_code: string | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  living_area: number | null;
  latitude: number | null;
  longitude: number | null;
  list_office_mls_id: string | null;
  list_office_name: string | null;
  list_agent_full_name: string | null;
  is_own_listing: boolean;
  address_display: boolean;
  avm_display: boolean;
  comments_display: boolean;
  modification_ts: string;
  data: Fields;
}

export interface ListingRows {
  idx: ListingIdxRow;
  vow: Fields;
  full: Fields;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown): number | null => (n(v) === null ? null : Math.round(v as number));

export function listingRows(p: Property, officeId: string, source: DataSource = "MLSListings"): ListingRows {
  const idx = projectIdx(p);
  const flags = displayFlags(p);
  return {
    idx: {
      listing_key: p.ListingKey,
      source,
      listing_id: s(p.ListingId),
      standard_status: p.StandardStatus,
      property_type: s(p.PropertyType),
      property_sub_type: s(p.PropertySubType),
      list_price: n(p.ListPrice),
      city: s(p.City),
      county: normalizeCounty(p.CountyOrParish) || null,
      postal_code: s(p.PostalCode),
      bedrooms_total: int(p.BedroomsTotal),
      bathrooms_total: int(p.BathroomsTotalInteger),
      living_area: n(p.LivingArea),
      // Taken from the projection, so hidden addresses have no coordinates either.
      latitude: n(idx.Latitude),
      longitude: n(idx.Longitude),
      list_office_mls_id: s(p.ListOfficeMlsId),
      list_office_name: s(p.ListOfficeName),
      list_agent_full_name: s(p.ListAgentFullName),
      is_own_listing: p.ListOfficeMlsId === officeId,
      address_display: flags.addressDisplay,
      avm_display: flags.avmDisplay,
      comments_display: flags.commentsDisplay,
      modification_ts: new Date(p.ModificationTimestamp).toISOString(),
      data: idx,
    },
    vow: projectVow(p),
    full: projectFull(p),
  };
}

export interface MediaRow {
  media_key: string;
  listing_key: string;
  sort_order: number;
  category: string | null;
  url: string | null;
  storage_path: string | null;
  short_description: string | null;
  width: number | null;
  height: number | null;
  modification_ts: string | null;
}

export function mediaRow(m: Media, storagePath: string | null): MediaRow {
  const p = projectMedia(m);
  return {
    media_key: m.MediaKey,
    listing_key: m.ResourceRecordKey,
    sort_order: int(p.Order) ?? 0,
    category: s(p.MediaCategory),
    url: s(p.MediaURL),
    storage_path: storagePath,
    short_description: s(p.ShortDescription),
    width: int(p.ImageWidth),
    height: int(p.ImageHeight),
    modification_ts: s(p.ModificationTimestamp),
  };
}

export interface OpenHouseRow {
  open_house_key: string;
  listing_key: string;
  open_house_date: string | null;
  start_time: string | null;
  end_time: string | null;
  remarks: string | null;
  open_house_type: string | null;
  modification_ts: string | null;
}

export function openHouseRow(o: OpenHouse): OpenHouseRow {
  const p = projectOpenHouse(o);
  return {
    open_house_key: o.OpenHouseKey,
    listing_key: o.ListingKey,
    open_house_date: s(p.OpenHouseDate),
    start_time: s(p.OpenHouseStartTime),
    end_time: s(p.OpenHouseEndTime),
    remarks: s(p.OpenHouseRemarks),
    open_house_type: s(p.OpenHouseType),
    modification_ts: s(p.ModificationTimestamp),
  };
}

export interface MemberRow {
  member_key: string;
  source: DataSource;
  member_mls_id: string | null;
  full_name: string | null;
  email: string | null;
  member_status: string | null;
  office_mls_id: string | null;
  data: Fields;
  modification_ts: string | null;
}

export function memberRow(m: Member, source: DataSource = "MLSListings"): MemberRow {
  return {
    member_key: m.MemberKey,
    source,
    member_mls_id: s(m.MemberMlsId),
    full_name: s(m.MemberFullName),
    email: s(m.MemberEmail),
    member_status: s(m.MemberStatus),
    office_mls_id: s(m.OfficeMlsId),
    data: projectMember(m),
    modification_ts: s(m.ModificationTimestamp),
  };
}

export interface OfficeRow {
  office_key: string;
  source: DataSource;
  office_mls_id: string | null;
  name: string | null;
  phone: string | null;
  data: Fields;
  modification_ts: string | null;
}

export function officeRow(o: Office, source: DataSource = "MLSListings"): OfficeRow {
  return {
    office_key: o.OfficeKey,
    source,
    office_mls_id: s(o.OfficeMlsId),
    name: s(o.OfficeName),
    phone: s(o.OfficePhone),
    data: projectOffice(o),
    modification_ts: s(o.ModificationTimestamp),
  };
}
