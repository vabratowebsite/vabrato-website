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
