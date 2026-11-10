import { FIELD_SETS, PROPERTY_FULL_FIELDS } from "./fields";
import { pick, type Fields } from "./project";

// FULL-level projections (SPEC MLS-7: FULL data never leaves the agent
// console). Exported only from `@vabrato/mls/full`; ESLint forbids importing
// that path outside apps/va and packages/mls.

/** FULL-only field set of a Property (stored in mls_listing_full). */
export function projectFull(property: Fields): Fields {
  return pick(property, PROPERTY_FULL_FIELDS);
}

/** Office roster record (stored in mls_members, FULL). */
export function projectMember(member: Fields): Fields {
  return pick(member, FIELD_SETS.Member.FULL);
}
