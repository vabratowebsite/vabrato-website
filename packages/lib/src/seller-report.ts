import type { SellerWeeklyReportData } from "@vabrato/db";
import type { MergeFields } from "./notifications";

// Seller weekly report (S6 PR 5): the merge fields for the static
// seller_weekly_report template, from seller_weekly_report_data() (0025).
// send_seller_weekly_report() builds the same fields in SQL; the console uses
// this for its preview, and an end-to-end test checks the two match.

export function weeklyReportMergeFields(d: SellerWeeklyReportData, sellerFirstName: string | null): MergeFields {
  return {
    sellerName: sellerFirstName ?? "",
    address: d.address,
    weekStart: d.week_start,
    weekEnd: d.week_end,
    views: String(d.week.views),
    saves: String(d.week.saves),
    tourRequests: String(d.week.tour_requests),
    openHouseSignins: String(d.week.open_house_signins),
    totalViews: String(d.totals.views),
    totalSaves: String(d.totals.saves),
    totalTourRequests: String(d.totals.tour_requests),
    totalOpenHouseSignins: String(d.totals.open_house_signins),
    status: d.listing?.standard_status ?? "",
    listPrice: d.listing?.list_price == null ? "" : String(d.listing.list_price),
  };
}

/** Mondays (YYYY-MM-DD) of the last `n` finished weeks, newest first, for a Pacific "today". */
export function finishedWeeks(todayPacific: string, n = 8): string[] {
  const [y, m, d] = todayPacific.split("-").map(Number) as [number, number, number];
  const today = new Date(Date.UTC(y, m - 1, d));
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(y, m - 1, d - sinceMonday);
  return Array.from({ length: n }, (_, i) => new Date(thisMonday - (i + 1) * 7 * 86_400_000).toISOString().slice(0, 10));
}
