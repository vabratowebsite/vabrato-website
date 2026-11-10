// MLS-1 / MLS-2 material in ONE place. The logo, disclaimer and IDX icon are
// PLACEHOLDERS until MLSListings provides the official versions; replacing
// them here updates every page (tracked in docs/STATUS.md).

export const MLS_LEGAL_IS_PLACEHOLDER = true;

export const MLS_PROVIDER = "MLSListings Inc.";

/** PLACEHOLDER disclaimer text; swap for MLSListings' official IDX disclaimer. */
export function mlsDisclaimer(year: number = new Date().getFullYear()): string {
  return `Listing information © ${year} ${MLS_PROVIDER}. Information is deemed reliable but not guaranteed and should be independently verified. Listings marked with the IDX icon are held by brokerages other than Vabrato Real Estate Services; the listing broker is shown on each listing. [PLACEHOLDER: official MLSListings disclaimer pending]`;
}

/** Alt text for the logo slot (the official artwork replaces the text badge). */
export const MLS_LOGO_ALT = "MLSListings";
