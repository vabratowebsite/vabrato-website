import type { Media, OpenHouse, Property } from "./resources";

// Which feed records we may keep (MLS-3, MLS-5, MLS-8) and the service area
// (SPEC <service_area>). Anything ineligible is removed at the next sync.

/** Statuses shown on the site. Closed is kept for VOW (MLS-6) within the sold-history window. */
export const DISPLAYABLE_STATUSES = ["Active", "ActiveUnderContract", "Pending"] as const;
/**
 * Off-market or not displayable. ComingSoon is excluded until MLSListings
 * confirms it may be shown under IDX/VOW.
 */
export const OFF_MARKET_STATUSES = ["Withdrawn", "Expired", "Canceled", "Hold", "Delete", "Incomplete", "ComingSoon"] as const;

export const SERVICE_COUNTIES = ["San Mateo", "Santa Clara"] as const;

export type IneligibleReason =
  | "off_market"
  | "unknown_status"
  | "opted_out"
  | "no_idx_participation"
  | "outside_service_area"
  | "other_mls"
  | "sold_too_old";

export interface EligibilityOptions {
  soldHistoryYears: number;
  now?: Date;
}

export function normalizeCounty(county: string | null | undefined): string {
  return (county ?? "").replace(/\s+county$/i, "").trim();
}

export function eligibility(p: Property, opts: EligibilityOptions): { eligible: true } | { eligible: false; reason: IneligibleReason } {
  // MLS-8: only our MLSListings feed. Records that name another system are rejected.
  if (p.OriginatingSystemName && !/^mlslistings/i.test(p.OriginatingSystemName)) return no("other_mls");
  // MLS-3: seller opted out of internet display, or listing excluded from IDX.
  if (p.InternetEntireListingDisplayYN === false) return no("opted_out");
  if (p.IDXParticipationYN === false) return no("no_idx_participation");

  const county = normalizeCounty(p.CountyOrParish).toLowerCase();
  if (!SERVICE_COUNTIES.some((c) => c.toLowerCase() === county)) return no("outside_service_area");

  const status = p.StandardStatus;
  if ((OFF_MARKET_STATUSES as readonly string[]).includes(status)) return no("off_market");
  if (status === "Closed") {
    const closed = p.CloseDate ? new Date(p.CloseDate) : null;
    if (!closed || Number.isNaN(closed.getTime()) || closed < soldCutoff(opts)) return no("sold_too_old");
    return { eligible: true };
  }
  if (!(DISPLAYABLE_STATUSES as readonly string[]).includes(status)) return no("unknown_status");
  return { eligible: true };
}

export function isEligible(p: Property, opts: EligibilityOptions): boolean {
  return eligibility(p, opts).eligible;
}

export function soldCutoff(opts: EligibilityOptions): Date {
  const d = new Date(opts.now ?? new Date());
  d.setUTCFullYear(d.getUTCFullYear() - opts.soldHistoryYears);
  return d;
}

/** Display flags stored with the listing; pages must honor them (MLS-3). */
export function displayFlags(p: Property) {
  return {
    addressDisplay: p.InternetAddressDisplayYN !== false,
    avmDisplay: p.InternetAutomatedValuationDisplayYN !== false,
    commentsDisplay: p.InternetConsumerCommentYN !== false,
  };
}

/** Public listing photos only: drops private / office-only items and non-photo media. */
export function isPublicPhoto(m: Media): boolean {
  const perms = Array.isArray(m.Permission) ? m.Permission : m.Permission ? m.Permission.split(",") : ["Public"];
  const isPublic = perms.map((s) => s.trim().toLowerCase()).every((s) => s === "public");
  const category = (m.MediaCategory ?? "Photo").toLowerCase();
  return isPublic && category === "photo" && Boolean(m.MediaURL);
}

/** Public, not-canceled open houses. Broker tours stay out of IDX. */
export function isPublicOpenHouse(o: OpenHouse): boolean {
  const type = (o.OpenHouseType ?? "Public").toLowerCase();
  const status = (o.OpenHouseStatus ?? "Active").toLowerCase();
  return type === "public" && status !== "canceled" && status !== "cancelled";
}

function no(reason: IneligibleReason) {
  return { eligible: false as const, reason };
}
