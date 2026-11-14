import { listingForAi, listingOptedOutOfAi, wrapData, type InputPart } from "@vabrato/ai";
import type { SupabaseDb } from "@vabrato/lib";
import type { Fields } from "@vabrato/mls";

// Listing data for Ask Vabrato's "Compare homes" and "Ask about a home" (S5b
// PR 4). Our code picks the records and the fields; the model only reads
// them. Records are read with the member's own client (RLS: sold homes only
// for VOW members), cut to the member's data level by listingForAi (IDX, or
// VOW once accepted; never FULL, never contacts, showing or lockbox
// details), and a home whose seller opted out of automated valuations or
// consumer comments (MLS-3) is never sent (owner decision 2026-11-14).

export const MAX_COMPARE = 4;
const KEY = /^[A-Za-z0-9._-]{1,64}$/;

export interface AiHome {
  key: string;
  /** The address, or "A home in <city>" when the seller hid the address. */
  label: string;
  /** The listing broker, shown with the answer (MLS attribution). */
  broker: string | null;
  /** What goes to the model: the member's level, allowlisted. */
  fields: Fields;
}

export interface HomesForAi {
  homes: AiHome[];
  /** Opted out of AI (MLS-3): shown with facts only, never sent. */
  excluded: { key: string; label: string; broker: string | null }[];
  /** Not found, or not visible to this member (sold without VOW access). */
  missing: string[];
}

interface Row {
  listing_key: string;
  city: string | null;
  list_office_name: string | null;
  address_display: boolean;
  avm_display: boolean;
  comments_display: boolean;
  data: unknown;
}

const asFields = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});

/** One stored row (and its VOW record, when the member may see it) as a home for the model. Pure; tested. */
export function homeForAi(row: Row, vow: Fields | null, level: "IDX" | "VOW"): { home: AiHome } | { excluded: HomesForAi["excluded"][number] } {
  const record: Fields = { ...asFields(row.data), ...(level === "VOW" && vow ? vow : {}) };
  // The stored columns carry the same MLS-3 flags; either says no.
  if (!row.address_display) record.InternetAddressDisplayYN = false;
  const optedOut = !row.avm_display || !row.comments_display || listingOptedOutOfAi(record);
  const address = row.address_display && typeof record.UnparsedAddress === "string" && record.UnparsedAddress.trim() ? record.UnparsedAddress.trim() : null;
  const label = address ?? `A home in ${row.city ?? "the area"}`;
  const broker = row.list_office_name ?? (typeof record.ListOfficeName === "string" ? record.ListOfficeName : null);
  if (optedOut) return { excluded: { key: row.listing_key, label, broker } };
  return { home: { key: row.listing_key, label, broker, fields: listingForAi(record, level) } };
}

export async function memberListingsForAi(db: SupabaseDb, keysIn: string[], level: "IDX" | "VOW", max: number = MAX_COMPARE): Promise<HomesForAi> {
  const keys = [...new Set(keysIn.filter((k) => KEY.test(k)))].slice(0, max);
  const out: HomesForAi = { homes: [], excluded: [], missing: [] };
  if (!keys.length) return out;
  const { data } = await db.from("mls_listings").select("listing_key, city, list_office_name, address_display, avm_display, comments_display, data").in("listing_key", keys);
  const rows = new Map(((data ?? []) as Row[]).map((r) => [r.listing_key, r]));
  let vow = new Map<string, Fields>();
  if (level === "VOW") {
    const { data: v } = await db.from("mls_listing_vow").select("listing_key, data").in("listing_key", keys);
    vow = new Map((v ?? []).map((r) => [r.listing_key, asFields(r.data)]));
  }
  for (const key of keys) {
    const row = rows.get(key);
    if (!row) {
      out.missing.push(key);
      continue;
    }
    const r = homeForAi(row, vow.get(key) ?? null, level);
    if ("home" in r) out.homes.push(r.home);
    else out.excluded.push(r.excluded);
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/** Figures our code works out, so the model never has to (and every dollar figure shown is one we sent). */
export function computedFacts(f: Fields): Record<string, number> {
  const out: Record<string, number> = {};
  const price = num(f.ClosePrice) ?? num(f.ListPrice);
  const area = num(f.LivingArea);
  if (price && area && area > 0) out.PricePerSqFt = Math.round(price / area);
  return out;
}

/** Fields for "Compare homes": the facts that matter side by side, plus remarks (cut short). */
const COMPARE_FIELDS = [
  "StandardStatus", "PropertySubType", "ListPrice", "ClosePrice", "CloseDate", "OriginalListPrice", "UnparsedAddress", "City",
  "BedroomsTotal", "BathroomsTotalInteger", "LivingArea", "LotSizeSquareFeet", "LotSizeAcres", "YearBuilt", "StoriesTotal",
  "GarageSpaces", "ParkingTotal", "PoolPrivateYN", "View", "Cooling", "Heating", "AssociationFee", "AssociationFeeFrequency",
  "DaysOnMarket", "CumulativeDaysOnMarket", "ElementarySchool", "MiddleOrJuniorSchool", "HighSchool", "HighSchoolDistrict", "PublicRemarks",
];

export function compareFields(f: Fields): Fields {
  const out: Fields = {};
  for (const k of COMPARE_FIELDS) if (f[k] !== undefined && f[k] !== null && f[k] !== "") out[k] = k === "PublicRemarks" && typeof f[k] === "string" ? (f[k] as string).slice(0, 600) : f[k];
  return { ...out, ...computedFacts(f) };
}

/** Each home as a labelled data block: Home A, Home B, ... The model refers to homes by letter. */
export const HOME_LETTERS = ["A", "B", "C", "D"] as const;
/** A tour day takes up to six homes (S5b PR 5). */
export const HOME_LETTERS_TOUR = ["A", "B", "C", "D", "E", "F"] as const;

export function compareParts(homes: AiHome[]): InputPart[] {
  return homes.map((h, i) => ({ type: "text", text: wrapData(`Home ${HOME_LETTERS[i]} (listing facts)`, JSON.stringify(compareFields(h.fields))) }));
}

export function listingParts(home: AiHome): InputPart[] {
  return [{ type: "text", text: wrapData("The home (listing facts)", JSON.stringify({ ...home.fields, ...computedFacts(home.fields) })) }];
}

/** The listing's field names we sent, so the answer's "fields used" can only name those. */
export const sentFieldNames = (home: AiHome) => new Set([...Object.keys(home.fields), ...Object.keys(computedFacts(home.fields))]);
