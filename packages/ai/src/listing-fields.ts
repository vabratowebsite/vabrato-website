import { projectForLevel, type Fields } from "@vabrato/mls";

// What a listing record may contain when it is sent to the model (SPEC
// <ai_rules>): the fields for the person's data level and nothing else, and
// never contact details, showing instructions or lockbox information, at
// any level.

const NEVER_SEND = new Set([
  "ShowingInstructions",
  "ShowingContactName",
  "ShowingContactPhone",
  "LockBoxType",
  "LockBoxLocation",
  "ListAgentDirectPhone",
  "ListAgentMobilePhone",
  "ListAgentEmail",
  "ListOfficePhone",
  "OwnerName",
  "OccupantName",
  "OccupantPhone",
  "PrivateRemarks",
  "Directions",
]);
// Catches fields added later that nobody remembered to list.
const NEVER_SEND_PATTERN = /phone|email|lockbox|showing|owner|occupant|privateremarks/i;

/** Drops contact, showing and lockbox fields from any record. Use on FULL data in the console before a model call. */
export function stripNeverSend(record: Fields): Fields {
  return Object.fromEntries(Object.entries(record).filter(([k]) => !NEVER_SEND.has(k) && !NEVER_SEND_PATTERN.test(k)));
}

/** A Property record for the model at IDX or VOW level (hidden addresses stay hidden). */
export function listingForAi(record: Fields, level: "IDX" | "VOW"): Fields {
  return stripNeverSend(projectForLevel("Property", record, level));
}
