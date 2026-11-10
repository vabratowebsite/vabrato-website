import { ADDRESS_FIELDS, FIELD_SETS, PROPERTY_IDX_FIELDS, PROPERTY_VOW_FIELDS, allowedFields, type DataLevel } from "./fields";

// Projections keep only allowlisted fields (MLS-4). The FULL projection is in
// ./full.ts and is exported only from the `@vabrato/mls/full` subpath, which
// ESLint restricts to the agent console (MLS-7).

export type Fields = Record<string, unknown>;

export function pick(record: Fields, fields: readonly string[] | ReadonlySet<string>): Fields {
  const out: Fields = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(record, f) && record[f] !== undefined) out[f] = record[f];
  }
  return out;
}

/** IDX field set of a Property, honoring InternetAddressDisplayYN (MLS-3). */
export function projectIdx(property: Fields): Fields {
  const out = pick(property, PROPERTY_IDX_FIELDS);
  if (property.InternetAddressDisplayYN === false) {
    for (const f of ADDRESS_FIELDS) delete out[f];
  }
  return out;
}

/** VOW-only field set of a Property (stored in mls_listing_vow). */
export function projectVow(property: Fields): Fields {
  return pick(property, PROPERTY_VOW_FIELDS);
}

/**
 * Everything a page at `level` may show, for resources whose top level is
 * IDX or VOW. Refuses FULL: use `@vabrato/mls/full` in the agent console.
 */
export function projectForLevel(
  resource: keyof typeof FIELD_SETS,
  record: Fields,
  level: Exclude<DataLevel, "FULL">,
): Fields {
  // Runtime guard too: callers outside TypeScript's reach must not get FULL fields here.
  if ((level as DataLevel) === "FULL") throw new Error("FULL projections are only available from @vabrato/mls/full (MLS-7)");
  const out = pick(record, allowedFields(resource, level));
  if (resource === "Property" && record.InternetAddressDisplayYN === false) {
    for (const f of ADDRESS_FIELDS) delete out[f];
  }
  return out;
}

export const projectMedia = (m: Fields) => pick(m, FIELD_SETS.Media.IDX);
export const projectOpenHouse = (o: Fields) => pick(o, FIELD_SETS.OpenHouse.IDX);
export const projectOffice = (o: Fields) => pick(o, FIELD_SETS.Office.IDX);
