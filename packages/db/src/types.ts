// Named aliases over the generated schema (types.gen.ts, produced by
// `pnpm gen:types`). Regenerate after every migration; this file only maps
// names and should rarely change.

import type { Database } from "./types.gen";

export type { Database, Json } from "./types.gen";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type UserRole = Enums["user_role"];
export type SellerType = Enums["seller_type"];
export type DealStatus = Enums["deal_status"];
export type TaskPhase = Enums["task_phase"];
export type DealMemberRole = Enums["deal_member_role"];
export type ReceiptSource = Enums["receipt_source"];
export type NotificationStatus = Enums["notification_status"];

export type Profile = Tables["profiles"]["Row"];
export type Deal = Tables["deals"]["Row"];
export type DealMember = Tables["deal_members"]["Row"];
export type DealContingency = Tables["deal_contingencies"]["Row"];
export type Task = Tables["tasks"]["Row"];
export type Vendor = Tables["vendors"]["Row"];
export type DealVendor = Tables["deal_vendors"]["Row"];
export type Receipt = Tables["receipts"]["Row"];
export type Notification = Tables["notifications"]["Row"];
export type InboundEmail = Tables["inbound_emails"]["Row"];
export type TrackedProperty = Tables["tracked_properties"]["Row"];
export type PropertyEvent = Tables["property_events"]["Row"];

export type MlsDataLevel = Enums["mls_data_level"];
export type MlsSyncKind = Enums["mls_sync_kind"];
export type MlsSyncStatus = Enums["mls_sync_status"];

export type FeatureFlag = Tables["feature_flags"]["Row"];
export type MlsListing = Tables["mls_listings"]["Row"];
export type MlsListingVow = Tables["mls_listing_vow"]["Row"];
export type MlsListingFull = Tables["mls_listing_full"]["Row"];
export type MlsPriceEvent = Tables["mls_price_events"]["Row"];
export type MlsMedia = Tables["mls_media"]["Row"];
export type MlsOpenHouse = Tables["mls_open_houses"]["Row"];
export type MlsOffice = Tables["mls_offices"]["Row"];
export type MlsMember = Tables["mls_members"]["Row"];
export type MlsAgentAccess = Tables["mls_agent_access"]["Row"];
export type MlsSyncRun = Tables["mls_sync_runs"]["Row"];

export type CityKind = Enums["city_kind"];
export type LeadKind = Enums["lead_kind"];
export type PostKind = Enums["post_kind"];

export type City = Tables["cities"]["Row"];
export type CityGuide = Tables["city_guides"]["Row"];
export type AgentProfile = Tables["agent_profiles"]["Row"];
export type Testimonial = Tables["testimonials"]["Row"];
export type Video = Tables["videos"]["Row"];
export type Post = Tables["posts"]["Row"];
export type Lead = Tables["leads"]["Row"];

export type DeletionRequestStatus = Enums["deletion_request_status"];
export type AppSettings = Tables["app_settings"]["Row"];
export type AccountDeletionRequest = Tables["account_deletion_requests"]["Row"];

export type AlertFrequency = Enums["alert_frequency"];
export type SavedHome = Tables["saved_homes"]["Row"];
export type SavedSearch = Tables["saved_searches"]["Row"];

export type AlertKind = Enums["alert_kind"];
export type AlertDelivery = Tables["alert_deliveries"]["Row"];

export type TourStatus = Enums["tour_status"];
export type MemberDocument = Tables["member_documents"]["Row"];
export type Message = Tables["messages"]["Row"];

export type OpenHouseSigninLink = Tables["open_house_signin_links"]["Row"];

/** listing_performance(deal) (0021): counts only, IDX-level listing fields. */
export interface ListingPerformanceWeek {
  week_start: string;
  views: number;
  saves: number;
  tour_requests: number;
  open_house_signins: number;
}
export type ListingPerformance =
  | { linked: false }
  | {
      linked: true;
      listing_key: string;
      listing: { standard_status: string | null; list_price: number | null } | null;
      totals: Omit<ListingPerformanceWeek, "week_start">;
      weeks: ListingPerformanceWeek[];
    };

export type LeadNote = Tables["lead_notes"]["Row"];
export type StaffNotification = Tables["staff_notifications"]["Row"];
export type StaffAudit = Tables["staff_audit"]["Row"];

export type ContentTable = Enums["content_table"];
export type RevisionStatus = Enums["revision_status"];
export type ContentRevision = Tables["content_revisions"]["Row"];
export type FeaturedListing = Tables["featured_listings"]["Row"];

export type SellerReportSend = Tables["seller_report_sends"]["Row"];
export type Cma = Tables["cmas"]["Row"];

/** seller_weekly_report_data(deal, week) (0025): counts only, IDX listing fields. */
export interface SellerWeeklyCounts {
  views: number;
  saves: number;
  tour_requests: number;
  open_house_signins: number;
}
export interface SellerWeeklyReportData {
  deal_id: string;
  address: string;
  linked: boolean;
  week_start: string;
  week_end: string;
  listing: { standard_status: string | null; list_price: number | null } | null;
  week: SellerWeeklyCounts;
  totals: SellerWeeklyCounts;
  sellers: { first_name: string | null }[];
  sent: { sent_at: string; sent_by: string | null; recipients: number } | null;
}

/** market_stats(city, months) / public_city_stats(city) (0025). Medians are null under 5 sales. */
export interface MarketStats {
  enabled?: boolean;
  city: string;
  city_name: string;
  months: number;
  since: string;
  min_sales_for_medians: number;
  sold: {
    count: number;
    median_price: number | null;
    median_price_per_sqft: number | null;
    median_days_on_market: number | null;
    median_sale_to_list: number | null;
  };
  market: { active: number; pending: number; median_list_price: number | null; months_of_inventory: number | null };
  by_month: { month: string; sold: number; median_price: number | null }[];
}

export type AiRun = Tables["ai_runs"]["Row"];
export type AiDraft = Tables["ai_drafts"]["Row"];
/** The email drafts (0028). */
export type EmailDraftKind = "lead_reply" | "open_house_followup" | "escrow_update" | "vendor_request";
/** Every kind of draft: emails (0028), launch kits and presentations (0030). */
export type AiDraftKind = EmailDraftKind | "listing_kit" | "listing_presentation" | "buyer_presentation";
export type AiDraftStatus = "draft" | "approved" | "discarded";
/** ai_begin(feature, deal) (0026). */
export type AiBegin = { allowed: true; run_id: string } | { allowed: false; reason: "off" | "daily_requests" | "daily_tokens" | "monthly_budget" };
/** ai_usage_today() (0026). */
export interface AiUsageToday {
  enabled: boolean;
  requests: number;
  tokens: number;
  requests_limit: number;
  tokens_limit: number;
}

/** ai_month_summary() (0027), admins only. Costs in millionths of a dollar. */
export interface AiMonthSummary {
  budget_usd: number;
  spent_micros: number;
  requests: number;
  by_feature: { feature: string; requests: number; cost_micros: number; not_ok: number }[];
}
